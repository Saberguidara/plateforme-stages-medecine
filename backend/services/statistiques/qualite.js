// Qualité des données : contrôles sur les dossiers et les fiches, score sur 100,
// et suivi des signalements des résidents (motifs, délai de traitement, hôpitaux concernés).
const db = require('../../config/db');
const { ACTIF, paramsActif, dernierRegistre, conditionAbsents } = require('../filtres-residents');
const { variantesProbables, pairesIgnorees } = require('../../controllers/referentiels.controller');
const { mediane } = require('./synthese');

const NB_EXEMPLES = 10;
const NB_MOIS = 6;

// Poids de chaque contrôle dans le score (total 1). Un contrôle touchant tous ses éléments retire tout son poids.
const POIDS = {
    'sans-email': 0.3,
    'fiches-incompletes': 0.2,
    'variantes': 0.15,
    'doublons': 0.15,
    'absents-registre': 0.1,
    'sans-promotion': 0.1
};

function cleNom(nom) {
    return String(nom || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
        .replace(/[^A-Z]+/g, ' ').trim().split(' ').filter(Boolean).sort().join(' ');
}

/** Résidents portant le même nom (ordre des mots, accents et ponctuation ignorés) sous des identifiants différents. */
function doublonsProbables(residents) {
    const groupes = new Map();
    for (const r of residents) {
        const cle = cleNom(r.nom_prenom);
        if (!cle) continue;
        if (!groupes.has(cle)) groupes.set(cle, []);
        groupes.get(cle).push(r);
    }
    return [...groupes.values()].filter((g) => g.length > 1);
}

/** Score sur 100 : chaque contrôle retire son poids multiplié par la part d'éléments concernés. */
function calculerScore(controles) {
    const perte = controles.reduce((somme, c) => {
        const part = c.base > 0 ? Math.min(1, c.nombre / c.base) : 0;
        return somme + (POIDS[c.cle] || 0) * part;
    }, 0);
    return Math.max(0, Math.round(100 * (1 - perte)));
}

function moisLocal(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

async function signalements(maintenant) {
    const debutAnnee = new Date(maintenant.getFullYear() - 1, maintenant.getMonth() + 1, 1);
    const debutMois = new Date(maintenant.getFullYear(), maintenant.getMonth() - NB_MOIS + 1, 1);
    const [[motifs], [hopitaux], [traites], [ouverts]] = await Promise.all([
        db.query('SELECT motif, COUNT(*) AS n FROM signalements WHERE cree_le >= ? GROUP BY motif ORDER BY n DESC', [debutAnnee]),
        db.query(
            `SELECT COALESCE(NULLIF(TRIM(f.hopital), ''), 'Non renseigné') AS hopital, COUNT(*) AS n
             FROM signalements s JOIN formulaires_stage f ON f.id = s.fiche_id
             WHERE s.cree_le >= ? GROUP BY hopital ORDER BY n DESC LIMIT 5`,
            [debutAnnee]
        ),
        db.query(
            `SELECT DATE_FORMAT(cree_le, '%Y-%m') AS mois, TIMESTAMPDIFF(MINUTE, cree_le, traite_le) AS minutes
             FROM signalements WHERE traite_le IS NOT NULL AND cree_le >= ?`,
            [debutMois]
        ),
        db.query('SELECT COUNT(*) AS n FROM signalements WHERE traite_le IS NULL')
    ]);

    const mois = [];
    for (let i = 0; i < NB_MOIS; i++) {
        const d = new Date(debutMois.getFullYear(), debutMois.getMonth() + i, 1);
        const cle = moisLocal(d);
        const delais = traites.filter((t) => t.mois === cle).map((t) => Number(t.minutes) / 60);
        const m = mediane(delais);
        mois.push({ mois: cle, traites: delais.length, delaiMedianHeures: m === null ? null : Math.round(m * 10) / 10 });
    }
    return {
        ouverts: Number(ouverts[0]?.n) || 0,
        recus12Mois: motifs.reduce((n, m) => n + Number(m.n), 0),
        parMotif: motifs.map((m) => ({ motif: m.motif, signalements: Number(m.n) })),
        parHopital: hopitaux.map((h) => ({ hopital: h.hopital, signalements: Number(h.n) })),
        parMois: mois
    };
}

async function calculerQualite(maintenant = new Date()) {
    const [
        [[actifs]], [sansEmail], [sansPromotion], [[fiches]], [fichesIncompletes], [tous], hopitaux, services, absents, sig
    ] = await Promise.all([
        db.query(`SELECT COUNT(*) AS n FROM residents r WHERE ${ACTIF}`, paramsActif()),
        db.query(
            `SELECT r.id, r.nom_prenom FROM residents r WHERE ${ACTIF} AND (r.email IS NULL OR TRIM(r.email) = '') ORDER BY r.nom_prenom`,
            paramsActif()
        ),
        db.query(
            `SELECT r.id, r.nom_prenom FROM residents r WHERE ${ACTIF} AND (r.promotion IS NULL OR r.promotion <= 0) ORDER BY r.nom_prenom`,
            paramsActif()
        ),
        db.query('SELECT COUNT(*) AS n FROM formulaires_stage'),
        db.query(
            `SELECT f.id, f.resident_id, f.periode, f.annee, r.nom_prenom, f.hopital, f.service
             FROM formulaires_stage f JOIN residents r ON r.id = f.resident_id
             WHERE f.hopital IS NULL OR TRIM(f.hopital) = '' OR f.service IS NULL OR TRIM(f.service) = ''
             ORDER BY f.annee DESC, r.nom_prenom`
        ),
        db.query('SELECT id, nom_prenom, cin, promotion FROM residents'),
        (async () => {
            const [rows] = await db.query(
                `SELECT hopital AS valeur, COUNT(*) AS nb_fiches FROM formulaires_stage
                 WHERE hopital IS NOT NULL AND hopital <> '' GROUP BY hopital`
            );
            return { valeurs: rows.length, groupes: variantesProbables(rows, await pairesIgnorees('hopital')) };
        })(),
        (async () => {
            const [rows] = await db.query(
                `SELECT service AS valeur, COUNT(*) AS nb_fiches FROM formulaires_stage
                 WHERE service IS NOT NULL AND service <> '' GROUP BY service`
            );
            return { valeurs: rows.length, groupes: variantesProbables(rows, await pairesIgnorees('service')) };
        })(),
        (async () => {
            const registre = await dernierRegistre();
            if (!registre) return { total: 0, registre: null };
            const condition = await conditionAbsents(registre);
            const [rows] = await db.query(`SELECT COUNT(*) AS n FROM residents r WHERE ${condition.sql}`, condition.params);
            return { total: Number(rows[0].n) || 0, registre: registre.filename };
        })(),
        signalements(maintenant)
    ]);

    const nbActifs = Number(actifs.n) || 0;
    const doublons = doublonsProbables(tous);
    const variantes = hopitaux.groupes.length + services.groupes.length;

    const controles = [
        {
            cle: 'sans-email', gravite: 'critique', titre: 'Résidents en cours sans e-mail',
            detail: 'Ils ne reçoivent ni code de connexion ni annonce de leur fiche.',
            nombre: sansEmail.length, base: nbActifs,
            exemples: sansEmail.slice(0, NB_EXEMPLES)
        },
        {
            cle: 'fiches-incompletes', gravite: 'attention', titre: 'Fiches sans hôpital ou sans service',
            detail: 'La fiche imprimée aura une case vide.',
            nombre: fichesIncompletes.length, base: Number(fiches.n) || 0,
            exemples: fichesIncompletes.slice(0, NB_EXEMPLES).map((f) => ({
                id: f.resident_id, nom_prenom: f.nom_prenom,
                precision: `${f.periode} ${f.annee} · ${f.hopital || 'hôpital manquant'} · ${f.service || 'service manquant'}`
            }))
        },
        {
            cle: 'variantes', gravite: 'attention', titre: "Écritures proches d'hôpitaux ou de services",
            detail: "À fusionner si c'est le même lieu, sinon à marquer « Ne pas fusionner » : un lieu écrit de plusieurs façons fausse les statistiques.",
            nombre: variantes, base: hopitaux.valeurs + services.valeurs,
            exemples: [...hopitaux.groupes, ...services.groupes].slice(0, NB_EXEMPLES)
                .map((g) => ({ precision: g.variantes.map((v) => v.valeur).join(' / ') }))
        },
        {
            cle: 'doublons', gravite: 'attention', titre: 'Doublons possibles',
            detail: 'Même nom sous des identifiants différents : un même résident a peut-être deux dossiers.',
            nombre: doublons.length, base: nbActifs,
            exemples: doublons.slice(0, NB_EXEMPLES).map((g) => ({
                precision: g.map((r) => `${r.nom_prenom} (${r.cin})`).join(' / '),
                ids: g.map((r) => r.id)
            }))
        },
        {
            cle: 'absents-registre', gravite: 'info', titre: 'Absents du dernier registre',
            detail: absents.registre ? `Résidents en cours absents de ${absents.registre} : mutation, mobilité, report ?` : 'Aucun registre importé.',
            nombre: absents.total, base: nbActifs, exemples: []
        },
        {
            cle: 'sans-promotion', gravite: 'info', titre: 'Résidents sans promotion',
            detail: "Sans année d'entrée, l'année de résidanat imprimée sur la fiche est estimée.",
            nombre: sansPromotion.length, base: nbActifs,
            exemples: sansPromotion.slice(0, NB_EXEMPLES)
        }
    ];

    return {
        score: calculerScore(controles),
        poids: POIDS,
        residentsActifs: nbActifs,
        anomalies: controles.reduce((n, c) => n + c.nombre, 0),
        controles,
        signalements: sig
    };
}

module.exports = { calculerQualite, calculerScore, doublonsProbables, cleNom, POIDS };
