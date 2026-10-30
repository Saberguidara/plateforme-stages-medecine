// Lecture d'un classeur Excel : toutes les feuilles, sous forme de lignes { entête: valeur }.
const ExcelJS = require('exceljs');

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
 * @returns {Promise<Array<{ nom: string, entetes: string[], lignes: Array<{ numero: number, valeurs: Object }> }>>}
 *   `entetes` garde le texte d'origine (utile pour y lire des dates), `valeurs` est indexé par entête normalisé.
 */
async function lireClasseur(chemin) {
    const classeur = new ExcelJS.Workbook();
    await classeur.xlsx.readFile(chemin);

    return classeur.worksheets.map((feuille) => {
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

        return { nom: feuille.name, entetes: entetes.filter(Boolean), lignes };
    });
}

module.exports = { lireClasseur, normaliserEntete, valeurCellule };
