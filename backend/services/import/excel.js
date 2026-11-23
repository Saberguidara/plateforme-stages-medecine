// Lecture d'un classeur Excel : toutes les feuilles, sous forme de lignes { entête: valeur }.
const fs = require('fs');
const ExcelJS = require('exceljs');
const JSZip = require('jszip');

// Certains outils (openpyxl, scripts de mise à jour du registre) rangent les commentaires de cellules
// ailleurs que dans « xl/commentsN.xml » : exceljs ne les retrouve pas et plante.
// L'import n'en a pas besoin : leurs liens sont retirés, le reste du classeur est lu tel quel.
const LIEN_COMMENTAIRE = /<Relationship\b[^>]*Type="[^"]*\/(comments|vmlDrawing)"[^>]*\/>/g;

async function retirerCommentairesIllisibles(contenu) {
    const zip = await JSZip.loadAsync(contenu);
    let corrige = false;
    for (const nom of Object.keys(zip.files).filter((n) => /^xl\/worksheets\/_rels\/.+\.rels$/.test(n))) {
        const xml = await zip.file(nom).async('string');
        const lisible = xml.replace(LIEN_COMMENTAIRE, (lien) => (/Target="(\.\.\/)?comments\d+\.xml"/.test(lien) ? lien : ''));
        if (lisible !== xml) {
            zip.file(nom, lisible);
            corrige = true;
        }
    }
    return corrige ? zip.generateAsync({ type: 'nodebuffer' }) : contenu;
}

// Valeur lisible d'une cellule exceljs : texte riche, lien (mailto:…), formule ou date.
function valeurCellule(valeur) {
    if (valeur === null || valeur === undefined) return '';
    if (valeur instanceof Date) return valeur;
    if (typeof valeur !== 'object') return valeur;
    if (valeur.richText) return valeur.richText.map((morceau) => morceau.text).join('');
    if (valeur.text !== undefined) return typeof valeur.text === 'object' ? valeurCellule(valeur.text) : valeur.text;
    if (valeur.result !== undefined) return valeurCellule(valeur.result);
    return '';
}

// Clé de comparaison d'un entête : majuscules, sans accents ni espaces superflus.
function normaliserEntete(texte) {
    return String(texte || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
}

/**
 * @returns {Promise<Array<{ nom: string, entetes: string[], lignes: Array<{ numero: number, valeurs: Object }>, grille: Array<Array<*>> }>>}
 *   `entetes` garde le texte d'origine (utile pour y lire des dates), `valeurs` est indexé par entête normalisé.
 *   `grille` donne toutes les cellules brutes (grille[ligne][colonne], à partir de 1), pour les registres
 *   dont les entêtes tiennent sur plusieurs lignes.
 */
async function lireClasseur(chemin) {
    const classeur = new ExcelJS.Workbook();
    await classeur.xlsx.load(await retirerCommentairesIllisibles(fs.readFileSync(chemin)));

    return classeur.worksheets.map((feuille) => {
        const grille = [];
        feuille.eachRow((ligne, numero) => {
            const cellules = [];
            ligne.eachCell({ includeEmpty: true }, (cellule, colonne) => { cellules[colonne] = valeurCellule(cellule.value); });
            grille[numero] = cellules;
        });

        const entetes = [];
        feuille.getRow(1).eachCell({ includeEmpty: true }, (cellule, colonne) => {
            entetes[colonne] = String(valeurCellule(cellule.value)).replace(/\s+/g, ' ').trim();
        });

        const lignes = [];
        feuille.eachRow((ligne, numero) => {
            if (numero === 1) return;
            const valeurs = {};
            let remplies = 0;
            ligne.eachCell((cellule, colonne) => {
                if (!entetes[colonne]) return;
                const valeur = valeurCellule(cellule.value);
                valeurs[normaliserEntete(entetes[colonne])] = valeur;
                if (String(valeur).trim()) remplies++;
            });
            if (remplies > 0) lignes.push({ numero, valeurs });
        });

        return { nom: feuille.name, entetes: entetes.filter(Boolean), lignes, grille };
    });
}

module.exports = { lireClasseur, normaliserEntete, valeurCellule };
