// Journal des actions des administrateurs : qui a fait quoi, sur quoi, avec les valeurs avant / après.
// `executant` est la connexion d'une transaction en cours, sinon le pool.
const db = require('../config/db');

const json = (valeur) => (valeur === undefined || valeur === null ? null : JSON.stringify(valeur));

async function journaliser(executant, req, { action, entite, entiteId = null, residentId = null, avant = null, apres = null }) {
    const admin = (req && req.admin) || {};
    await (executant || db).query(
        `INSERT INTO journal_actions (admin_id, admin_login, action, entite, entite_id, resident_id, avant, apres)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [admin.id || null, admin.login || null, action, entite, entiteId, residentId, json(avant), json(apres)]
    );
}

// Ne garde que les champs utiles d'une ligne de base (pas de hash d'OTP ni de mot de passe).
function extraire(ligne, champs) {
    if (!ligne) return null;
    return Object.fromEntries(champs.filter((c) => ligne[c] !== undefined).map((c) => [c, ligne[c]]));
}

const CHAMPS_RESIDENT = ['cin', 'nom_prenom', 'email', 'specialite', 'faculte_origine', 'promotion', 'niveau'];
const CHAMPS_FICHE = ['periode', 'annee', 'service', 'hopital'];

module.exports = { journaliser, extraire, CHAMPS_RESIDENT, CHAMPS_FICHE };
