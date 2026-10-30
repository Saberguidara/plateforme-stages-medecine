// Référentiels des hôpitaux et des services, construits à partir des fiches existantes :
// suggestions à la saisie et fusion des variantes d'écriture (fautes de frappe des registres).
const db = require('../config/db');
const logger = require('../utils/logger');
const { normalizeString } = require('../utils/validation');
const { journaliser } = require('../utils/journal');

const COLONNES = { hopital: 'hopital', service: 'service' };

function colonneDe(type) {
    return COLONNES[type] || null;
}

// Clé de comparaison : majuscules sans accents ni ponctuation.
function cleNormalisee(valeur) {
    return String(valeur).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ').trim();
}

function distance(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 3;
    let precedente = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        const courante = [i];
        for (let j = 1; j <= b.length; j++) {
            courante[j] = Math.min(precedente[j] + 1, courante[j - 1] + 1, precedente[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        precedente = courante;
    }
    return precedente[b.length];
}

// Regroupe les valeurs probablement identiques : même clé normalisée, ou une à deux lettres d'écart.
function variantesProbables(valeurs) {
    const parent = valeurs.map((_, i) => i);
    const racine = (i) => (parent[i] === i ? i : (parent[i] = racine(parent[i])));
    const cles = valeurs.map((v) => cleNormalisee(v.valeur));
    for (let i = 0; i < valeurs.length; i++) {
        for (let j = i + 1; j < valeurs.length; j++) {
            const seuil = Math.min(cles[i].length, cles[j].length) >= 10 ? 2 : 1;
            if (cles[i] === cles[j] || (cles[i].length >= 6 && distance(cles[i], cles[j]) <= seuil)) {
                parent[racine(j)] = racine(i);
            }
        }
    }
    const groupes = new Map();
    valeurs.forEach((v, i) => {
        const r = racine(i);
        if (!groupes.has(r)) groupes.set(r, []);
        groupes.get(r).push(v);
    });
    return [...groupes.values()]
        .filter((g) => g.length > 1)
        .map((g) => {
            const tries = [...g].sort((a, b) => b.nb_fiches - a.nb_fiches);
            return { cible: tries[0].valeur, variantes: tries };
        });
}

exports.variantesProbables = variantesProbables;

// Suggestions pendant la saisie : valeurs déjà utilisées, les plus fréquentes d'abord.
exports.getSuggestions = async (req, res) => {
    const colonne = colonneDe(req.query.type);
    if (!colonne) return res.status(400).json({ message: 'Type de référentiel inconnu.' });
    const q = normalizeString(req.query.q).slice(0, 100);
    const conditions = [`${colonne} IS NOT NULL`, `${colonne} <> ''`];
    const params = [];
    if (q) { conditions.push(`${colonne} LIKE ?`); params.push(`%${q}%`); }
    // Services : ceux de l'hôpital choisi d'abord
    const hopital = normalizeString(req.query.hopital);
    const ordreHopital = colonne === 'service' && hopital ? 'SUM(hopital = ?) DESC,' : '';

    try {
        const [rows] = await db.query(
            `SELECT ${colonne} AS valeur, COUNT(*) AS nb_fiches FROM formulaires_stage
             WHERE ${conditions.join(' AND ')}
             GROUP BY ${colonne}
             ORDER BY ${ordreHopital} nb_fiches DESC, valeur ASC
             LIMIT 10`,
            [...params, ...(ordreHopital ? [hopital] : [])]
        );
        res.json(rows.map((r) => r.valeur));
    } catch (error) {
        logger.error('Suggestions de référentiel : ' + error);
        res.status(500).json({ error: 'Erreur lors du chargement des suggestions' });
    }
};

// Toutes les valeurs d'un référentiel avec leur nombre de fiches, et les variantes probables.
exports.getReferentiel = async (req, res) => {
    const colonne = colonneDe(req.params.type);
    if (!colonne) return res.status(400).json({ message: 'Type de référentiel inconnu.' });
    try {
        const [rows] = await db.query(
            `SELECT ${colonne} AS valeur, COUNT(*) AS nb_fiches FROM formulaires_stage
             WHERE ${colonne} IS NOT NULL AND ${colonne} <> ''
             GROUP BY ${colonne} ORDER BY valeur ASC`
        );
        res.json({ valeurs: rows, groupes: variantesProbables(rows) });
    } catch (error) {
        logger.error('Référentiel : ' + error);
        res.status(500).json({ error: 'Erreur lors du chargement du référentiel' });
    }
};

// Remplace les variantes choisies par la valeur retenue dans toutes les fiches concernées.
exports.fusionner = async (req, res) => {
    const colonne = colonneDe(req.body.type);
    if (!colonne) return res.status(400).json({ message: 'Type de référentiel inconnu.' });
    const cible = normalizeString(req.body.cible);
    const sources = [...new Set((Array.isArray(req.body.sources) ? req.body.sources : [])
        .map(normalizeString).filter((s) => s && s !== cible))];
    if (!cible || cible.length > 150) return res.status(400).json({ message: 'Valeur retenue invalide.' });
    if (sources.length === 0) return res.status(400).json({ message: 'Choisissez au moins une variante à remplacer.' });

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();
        // Comparaison sans tenir compte de la casse ni des accents (collation de la base),
        // comme le regroupement des valeurs affiché à l'administrateur.
        const [resultat] = await connection.query(
            `UPDATE formulaires_stage SET ${colonne} = ? WHERE ${colonne} IN (?)`,
            [cible, sources]
        );
        await journaliser(connection, req, {
            action: 'fusion', entite: 'referentiel',
            avant: { type: colonne, variantes: sources },
            apres: { type: colonne, valeur: cible, fichesModifiees: resultat.affectedRows }
        });
        await connection.commit();
        res.json({
            message: `${resultat.affectedRows} fiche(s) mise(s) à jour : ${sources.length} variante(s) remplacée(s) par « ${cible} ».`,
            fichesModifiees: resultat.affectedRows
        });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => { });
        logger.error('Fusion de référentiel : ' + error);
        res.status(500).json({ message: 'Erreur lors de la fusion.' });
    } finally {
        if (connection) connection.release();
    }
};
