// Génère une fiche de validation en écrivant les champs variables sur le fond PDF
// exporté depuis le modèle Word (voir scripts/build-fiche-template.js).
const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');
// Marge droite : au-delà, le texte est réduit pour rester dans la page.
const MARGE_DROITE = 40;

const cache = new Map();

function chargerModele(code) {
    if (!cache.has(code)) {
        const dir = path.join(TEMPLATES_DIR, code);
        const config = JSON.parse(fs.readFileSync(path.join(dir, 'champs.json'), 'utf8'));
        cache.set(code, {
            config,
            fond: fs.readFileSync(path.join(dir, 'fond.pdf')),
            police: fs.readFileSync(path.join(dir, config.police))
        });
    }
    return cache.get(code);
}

function niveauLabel(niveau) {
    const n = parseInt(niveau, 10);
    if (!n || n < 1) return '';
    return n === 1 ? '1ère' : `${n}ème`;
}

// Taille réduite si le texte dépasse la largeur disponible.
function ajusterTaille(police, texte, taille, largeurMax) {
    const largeur = police.widthOfTextAtSize(texte, taille);
    return largeur > largeurMax ? taille * (largeurMax / largeur) : taille;
}

/**
 * @param {string} code  code du modèle (ex. 'medecine-famille')
 * @param {{ nomPrenom: string, niveau: number, periode: string, hopital: string, service: string }} donnees
 * @returns {Promise<Uint8Array>}
 */
async function genererFiche(code, donnees) {
    const { config, fond, police: policeOctets } = chargerModele(code);
    const pdf = await PDFDocument.load(fond);
    pdf.registerFontkit(fontkit);
    const police = await pdf.embedFont(policeOctets, { subset: true });
    const page = pdf.getPage(0);
    const largeurPage = page.getWidth();
    const noir = rgb(0, 0, 0);
    const c = config.champs;

    const ecrire = (texte, x, y, size) => page.drawText(texte, { x, y, size, font: police, color: noir });

    const centrer = (texte, champ) => {
        if (!texte) return;
        const size = ajusterTaille(police, texte, champ.taille, largeurPage - 2 * MARGE_DROITE);
        ecrire(texte, champ.centreX - police.widthOfTextAtSize(texte, size) / 2, champ.y, size);
    };

    const aGauche = (texte, champ) => {
        if (!texte) return;
        const size = ajusterTaille(police, texte, champ.taille, largeurPage - MARGE_DROITE - champ.x);
        ecrire(texte, champ.x, champ.y, size);
    };

    centrer(String(donnees.hopital || '').toUpperCase(), c.hopital);
    centrer(String(donnees.service || '').toUpperCase(), c.service);
    aGauche(String(donnees.nomPrenom || '').toUpperCase(), c.nomPrenom);
    aGauche(donnees.periode, c.periode);

    // Comme dans le modèle Word : la valeur (« 3ème ») et le mot « année » n'ont pas la même taille.
    const niveau = niveauLabel(donnees.niveau);
    if (niveau) {
        ecrire(niveau, c.annee.x, c.annee.y, c.annee.taille);
        const xSuffixe = c.annee.x + police.widthOfTextAtSize(niveau, c.annee.taille);
        ecrire(c.annee.suffixe, xSuffixe, c.annee.y, c.annee.tailleSuffixe);
    }

    pdf.setTitle(`Fiche de validation - ${donnees.nomPrenom}`);
    pdf.setProducer('Plateforme des stages - Faculté de Médecine de Sfax');
    return pdf.save();
}

module.exports = { genererFiche, niveauLabel };
