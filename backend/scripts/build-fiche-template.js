// Construit le fond PDF d'une fiche et la position de ses champs à partir du modèle Word.
// À lancer une seule fois par modèle, sous Windows avec Microsoft Word installé :
//   node scripts/build-fiche-template.js medecine-famille
// Produit dans templates/<specialite>/ : fond.pdf (modèle vierge rendu par Word),
// calibrage.pdf (modèle rempli d'un exemple) et champs.json (coordonnées des champs).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const JSZip = require('jszip');

const specialite = process.argv[2] || 'medecine-famille';
const dir = path.join(__dirname, '..', 'templates', specialite);

// Valeurs d'exemple : chacune doit être unique sur la page pour être retrouvée dans le PDF.
const EXEMPLE = {
    HOPITAL: 'HOPITAL EXEMPLE',
    SERVICE: 'SERVICE EXEMPLE',
    NOM_PRENOM: 'NOM PRENOM EXEMPLE',
    ANNEE: '3ème',
    PERIODE: 'Du 01/01/2026 au 30/06/2026'
};

function escapeXml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Remplace le texte des runs d'un paragraphe à partir du run contenant `marqueur` :
// le premier reçoit `valeur`, les suivants (jusqu'à `dernier` inclus, ou la fin) sont vidés.
function remplacerRuns(xml, ancre, marqueur, valeur, dernier) {
    const debut = xml.lastIndexOf('<w:p ', xml.indexOf(ancre));
    const fin = xml.indexOf('</w:p>', debut) + 6;
    let paragraphe = xml.slice(debut, fin);
    let etat = 'avant';
    paragraphe = paragraphe.replace(/(<w:t(?: [^>]*)?>)([^<]*)(<\/w:t>)/g, (m, ouv, texte, ferm) => {
        if (etat === 'apres') return m;
        if (etat === 'avant') {
            if (!texte.includes(marqueur)) return m;
            etat = 'dedans';
            const nouveau = texte.replace(marqueur, escapeXml(valeur));
            if (dernier !== undefined && texte.includes(dernier)) etat = 'apres';
            return `<w:t xml:space="preserve">${nouveau}</w:t>`;
        }
        if (dernier !== undefined && texte.includes(dernier)) etat = 'apres';
        return `${ouv}${ferm}`;
    });
    if (etat === 'avant') throw new Error(`Marqueur introuvable : ${marqueur}`);
    return xml.slice(0, debut) + paragraphe + xml.slice(fin);
}

function remplir(xml, v) {
    xml = xml.replace('{{HOPITAL}}', escapeXml(v.HOPITAL));
    xml = xml.replace('{{SERVICE}}', escapeXml(v.SERVICE));
    xml = xml.replace('{{NOM_PRENOM}}', escapeXml(v.NOM_PRENOM));
    // {{ANNEE}} est coupé en deux runs ("   {" et "{ANNEE}}"), suivis du run " année".
    if (v.ANNEE === '') xml = remplacerRuns(xml, 'ANNEE}}', ' année', '');
    xml = remplacerRuns(xml, 'ANNEE}}', '{', v.ANNEE, 'ANNEE}}');
    // La période est écrite en dur dans le modèle, répartie sur une dizaine de runs :
    // le premier ("Du 01/0") reçoit la période complète, les suivants sont vidés.
    xml = remplacerRuns(xml, 'Du 01/0', 'Du 01/0', v.PERIODE);
    return xml;
}

async function genererDocx(source, cible, valeurs) {
    const zip = await JSZip.loadAsync(fs.readFileSync(source));
    let xml = await zip.file('word/document.xml').async('string');
    xml = remplir(xml, valeurs);
    zip.file('word/document.xml', xml);
    fs.writeFileSync(cible, await zip.generateAsync({ type: 'nodebuffer' }));
}

function exporterPdfAvecWord(docx, pdf) {
    const script = `
$w = New-Object -ComObject Word.Application
$w.Visible = $false
try {
  $d = $w.Documents.Open('${docx}', $false, $true)
  $d.SaveAs2('${pdf}', 17)
  $d.Close($false)
} finally { $w.Quit() }`;
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: 'inherit' });
}

async function extrairePositions(pdfPath) {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(pdfPath)), useSystemFonts: false }).promise;
    const page = await doc.getPage(1);
    const { items } = await page.getTextContent();
    const lignes = items.filter((it) => it.str.trim()).map((it) => ({
        str: it.str, x: it.transform[4], y: it.transform[5], taille: Math.abs(it.transform[3]), largeur: it.width
    }));
    // Regroupe les fragments situés sur la même ligne de base pour retrouver chaque valeur entière.
    function trouver(valeur) {
        const mots = valeur.split(' ').filter(Boolean);
        const premier = lignes.find((l) => l.str.includes(mots[0]) && lignes.some((m) => Math.abs(m.y - l.y) < 0.5 && m.str.includes(mots[mots.length - 1])));
        if (!premier) throw new Error(`Valeur introuvable dans le PDF : ${valeur}`);
        const memeLigne = lignes.filter((l) => Math.abs(l.y - premier.y) < 0.5 && mots.some((m) => l.str.includes(m)));
        const xMin = Math.min(...memeLigne.map((l) => l.x));
        const xMax = Math.max(...memeLigne.map((l) => l.x + l.largeur));
        return { x: xMin, y: premier.y, taille: premier.taille, largeur: xMax - xMin, brut: memeLigne.map((l) => l.str) };
    }
    return { trouver, lignes, largeurPage: page.view[2], hauteurPage: page.view[3] };
}

(async () => {
    const source = path.join(dir, 'modele.docx');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fiche-'));
    const docxFond = path.join(tmp, 'fond.docx');
    const docxCalib = path.join(tmp, 'calibrage.docx');

    await genererDocx(source, docxFond, { HOPITAL: '', SERVICE: '', NOM_PRENOM: '', ANNEE: '', PERIODE: '' });
    await genererDocx(source, docxCalib, EXEMPLE);

    exporterPdfAvecWord(docxFond, path.join(dir, 'fond.pdf'));
    exporterPdfAvecWord(docxCalib, path.join(dir, 'calibrage.pdf'));

    const { trouver, largeurPage } = await extrairePositions(path.join(dir, 'calibrage.pdf'));
    const hopital = trouver(EXEMPLE.HOPITAL);
    const service = trouver(EXEMPLE.SERVICE);
    const nom = trouver(EXEMPLE.NOM_PRENOM);
    const annee = trouver(EXEMPLE.ANNEE);
    const periode = trouver(EXEMPLE.PERIODE);
    const suffixe = trouver('année');

    const arrondi = (n) => Math.round(n * 100) / 100;
    const champs = {
        source: 'modele.docx',
        police: '../fonts/carlito-bold.woff',
        largeurPage: arrondi(largeurPage),
        champs: {
            hopital: { centreX: arrondi(hopital.x + hopital.largeur / 2), y: arrondi(hopital.y), taille: arrondi(hopital.taille), alignement: 'centre' },
            service: { centreX: arrondi(service.x + service.largeur / 2), y: arrondi(service.y), taille: arrondi(service.taille), alignement: 'centre' },
            nomPrenom: { x: arrondi(nom.x), y: arrondi(nom.y), taille: arrondi(nom.taille) },
            annee: { x: arrondi(annee.x), y: arrondi(annee.y), taille: arrondi(annee.taille), suffixe: ' année', tailleSuffixe: arrondi(suffixe.taille) },
            periode: { x: arrondi(periode.x), y: arrondi(periode.y), taille: arrondi(periode.taille) }
        }
    };
    fs.writeFileSync(path.join(dir, 'champs.json'), JSON.stringify(champs, null, 2) + '\n');
    console.log(JSON.stringify(champs, null, 2));
    console.log('Fragments détectés :', { hopital: hopital.brut, nom: nom.brut, annee: annee.brut, suffixe: suffixe.brut, periode: periode.brut });
    fs.rmSync(tmp, { recursive: true, force: true });
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
