// Chargement des variables pour les scripts (db.js, recharger-fiches.js).
//
// Par défaut : backend/.env (la base locale).
// Avec FICHIER_ENV=.env.production : ce fichier seul, dont les valeurs remplacent celles du terminal.
// Pour une base distante, les cinq variables de connexion doivent toutes y être, sinon le script s'arrête :
// une valeur manquante serait sinon remplacée par une valeur locale (localhost, root…).
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const OBLIGATOIRES = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASS', 'DB_NAME'];

function chargerEnv() {
    try {
        return lire();
    } catch (error) {
        console.error(`❌ ${error.message}`);
        process.exit(1);
    }
}

function lire() {
    const fichier = process.env.FICHIER_ENV;
    if (!fichier) {
        dotenv.config({ quiet: true, path: path.join(__dirname, '..', '.env') });
        return { fichier: '.env' };
    }
    const chemin = path.resolve(path.join(__dirname, '..'), fichier);
    if (!fs.existsSync(chemin)) throw new Error(`Fichier ${fichier} introuvable dans backend/.`);
    const valeurs = dotenv.parse(fs.readFileSync(chemin));
    const manquantes = OBLIGATOIRES.filter((cle) => !String(valeurs[cle] || '').trim());
    if (manquantes.length) throw new Error(`${fichier} : valeur manquante pour ${manquantes.join(', ')}.`);
    for (const [cle, valeur] of Object.entries(valeurs)) process.env[cle] = valeur;
    return { fichier };
}

module.exports = { chargerEnv };
