// Filtres de la liste des résidents, partagés par le tableau, l'export Excel et le tableau de bord.
const db = require('../config/db');
const { LIBELLES_SPECIALITES, DUREE_MAX, PERIODES_DU_SEMESTRE, semestreCourant } = require('../config/specialites');

// Année de résidanat en cours, déduite de la promotion (le niveau saisi ne sert qu'aux anciens dossiers).
const NIVEAU_COURANT = 'IF(r.promotion IS NOT NULL AND r.promotion > 0, YEAR(CURRENT_DATE) - r.promotion + 1, r.niveau)';

// Résidents en cours de résidanat dans une spécialité gérée par la plateforme.
const ACTIF = `(r.specialite IN (?) AND ${NIVEAU_COURANT} BETWEEN 1 AND ?)`;
const paramsActif = () => [LIBELLES_SPECIALITES, DUREE_MAX];

function fichesDuSemestre(alias = 'f') {
    const { semestre, annee } = semestreCourant();
    return { sql: `${alias}.periode IN (?) AND ${alias}.annee = ?`, params: [PERIODES_DU_SEMESTRE[semestre], annee] };
}

// Dernier registre importé (non annulé) : résidents présents et années de résidanat couvertes.
async function dernierRegistre() {
    const [rows] = await db.query(
        `SELECT id, filename, imported_at, semestre, annee, undo_data FROM historique_imports
         WHERE undone = 0 AND residents_vus > 0 ORDER BY id DESC LIMIT 1`
    );
    if (rows.length === 0) return null;
    let donnees = {};
    try { donnees = JSON.parse(rows[0].undo_data || '{}'); } catch { donnees = {}; }
    const { undo_data, ...entete } = rows[0];
    return { ...entete, residentIdsVus: donnees.residentIdsVus || [], niveaux: donnees.niveaux || [] };
}

// Résidents actifs d'une année couverte par le registre mais absents de celui-ci.
async function conditionAbsents(registre) {
    if (!registre || registre.niveaux.length === 0) return { sql: '0 = 1', params: [] };
    const niveauALImport = `IF(r.promotion IS NOT NULL AND r.promotion > 0, ? - r.promotion + 1, r.niveau)`;
    const params = [registre.annee || new Date().getFullYear(), registre.niveaux];
    let sql = `${ACTIF} AND ${niveauALImport} IN (?)`;
    if (registre.residentIdsVus.length > 0) {
        sql += ' AND r.id NOT IN (?)';
        params.push(registre.residentIdsVus);
    }
    return { sql, params: [...paramsActif(), ...params] };
}

const ALERTES = {
    'sans-fiche-semestre': () => {
        const f = fichesDuSemestre();
        return { sql: `${ACTIF} AND NOT EXISTS (SELECT 1 FROM formulaires_stage f WHERE f.resident_id = r.id AND ${f.sql})`, params: [...paramsActif(), ...f.params] };
    },
    'avec-fiche-semestre': () => {
        const f = fichesDuSemestre();
        return { sql: `${ACTIF} AND EXISTS (SELECT 1 FROM formulaires_stage f WHERE f.resident_id = r.id AND ${f.sql})`, params: [...paramsActif(), ...f.params] };
    },
    'sans-stage': () => ({
        sql: `${ACTIF} AND NOT EXISTS (SELECT 1 FROM formulaires_stage f WHERE f.resident_id = r.id)`,
        params: paramsActif()
    }),
    // Fiche du semestre disponible mais jamais récupérée par le résident
    'a-relancer': () => {
        const f = fichesDuSemestre();
        return {
            sql: `${ACTIF} AND EXISTS (SELECT 1 FROM formulaires_stage f WHERE f.resident_id = r.id AND ${f.sql})
                  AND NOT EXISTS (SELECT 1 FROM telechargements t JOIN formulaires_stage f ON f.id = t.fiche_id
                                  WHERE t.resident_id = r.id AND ${f.sql})`,
            params: [...paramsActif(), ...f.params, ...f.params]
        };
    },
    'fiche-recuperee': () => {
        const f = fichesDuSemestre();
        return {
            sql: `EXISTS (SELECT 1 FROM telechargements t JOIN formulaires_stage f ON f.id = t.fiche_id
                          WHERE t.resident_id = r.id AND ${f.sql})`,
            params: f.params
        };
    },
    'absents-registre': async () => conditionAbsents(await dernierRegistre())
};

/**
 * @param {object} query  paramètres de la liste : search, specialite, promo, email=sans, actifs=1, alerte
 * @returns {Promise<{ where: string, params: any[] }>}
 */
async function construireFiltres(query = {}) {
    const conditions = ['1=1'];
    const params = [];
    const ajouter = (sql, valeurs = []) => { conditions.push(sql); params.push(...valeurs); };

    const search = String(query.search || '').trim();
    if (search) ajouter('(r.cin LIKE ? OR r.nom_prenom LIKE ?)', [`%${search}%`, `%${search}%`]);
    if (query.specialite) ajouter('r.specialite = ?', [String(query.specialite)]);
    const promo = parseInt(query.promo, 10);
    if (promo) ajouter('r.promotion = ?', [promo]);
    if (query.email === 'sans') ajouter("(r.email IS NULL OR r.email = '')");
    if (query.actifs === '1' || query.actifs === 'true') ajouter(ACTIF, paramsActif());
    if (query.hopital) {
        ajouter('EXISTS (SELECT 1 FROM formulaires_stage fh WHERE fh.resident_id = r.id AND fh.hopital = ?)', [String(query.hopital)]);
    }

    const alerte = ALERTES[query.alerte];
    if (alerte) {
        const { sql, params: valeurs } = await alerte();
        ajouter(`(${sql})`, valeurs);
    }

    return { where: `WHERE ${conditions.join(' AND ')}`, params };
}

module.exports = {
    NIVEAU_COURANT, ACTIF, paramsActif, fichesDuSemestre, dernierRegistre, conditionAbsents, construireFiltres,
    ALERTES: Object.keys(ALERTES)
};
