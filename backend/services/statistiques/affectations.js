// Affectations : répartition des fiches par hôpital, service, type de période, année de résidanat
// et faculté d'origine, carte hôpitaux × périodes et évolution par semestre.
const db = require('../../config/db');
const { PERIODES_DU_SEMESTRE, semestreCourant } = require('../../config/specialites');
const { conditionsFiches } = require('./filtres');
const { derniers, rang } = require('./semestres');

const NON_RENSEIGNE = 'Non renseigné';
const LIGNES_CARTE = 12;
const NB_SERVICES = 12;
const NB_SEMESTRES_EVOLUTION = 8;

// Colonnes de la carte : les moitiés de 45 jours sont rangées avec leur trimestre.
const COLONNES = {
    T1: ['T1', 'T1A', 'T1B'], T2: ['T2', 'T2A', 'T2B'], S1: ['S1'],
    T3: ['T3', 'T3A', 'T3B'], T4: ['T4', 'T4A', 'T4B'], S2: ['S2'],
    R1: ['R1'], R2: ['R2']
};
const COLONNES_DU_SEMESTRE = { S1: ['T1', 'T2', 'S1', 'R1'], S2: ['T3', 'T4', 'S2', 'R2'] };

const SQL_COLONNE = `CASE ${Object.entries(COLONNES).filter(([, p]) => p.length > 1)
    .map(([c, p]) => `WHEN f.periode IN (${p.map((x) => `'${x}'`).join(',')}) THEN '${c}'`).join(' ')} ELSE f.periode END`;
const SQL_TYPE = "CASE WHEN f.periode LIKE 'R%' THEN 'rattrapage' WHEN f.periode LIKE 'S%' THEN 'semestre' ELSE 'trimestre' END";
const SQL_HOPITAL = `COALESCE(NULLIF(TRIM(f.hopital), ''), '${NON_RENSEIGNE}')`;
const SQL_SERVICE = `COALESCE(NULLIF(TRIM(f.service), ''), '${NON_RENSEIGNE}')`;
const DEPUIS = 'FROM formulaires_stage f JOIN residents r ON r.id = f.resident_id';

const n = (v) => Number(v) || 0;

function colonnesAffichees(filtres) {
    return filtres.semestre ? COLONNES_DU_SEMESTRE[filtres.semestre] : Object.keys(COLONNES);
}

// Carte : les hôpitaux les plus chargés, les autres regroupés sur une ligne.
function construireCarte(cellules, colonnes) {
    const parHopital = new Map();
    for (const c of cellules) {
        if (!colonnes.includes(c.colonne)) continue;
        const ligne = parHopital.get(c.hopital) || { hopital: c.hopital, valeurs: {}, total: 0 };
        ligne.valeurs[c.colonne] = (ligne.valeurs[c.colonne] || 0) + n(c.residents);
        ligne.total += n(c.residents);
        parHopital.set(c.hopital, ligne);
    }
    const lignes = [...parHopital.values()].sort((a, b) => b.total - a.total);
    const principales = lignes.slice(0, LIGNES_CARTE);
    const reste = lignes.slice(LIGNES_CARTE);
    if (reste.length > 0) {
        const autres = { hopital: `Autres (${reste.length} hôpitaux)`, autres: true, valeurs: {}, total: 0 };
        for (const l of reste) {
            for (const [col, v] of Object.entries(l.valeurs)) autres.valeurs[col] = (autres.valeurs[col] || 0) + v;
            autres.total += l.total;
        }
        principales.push(autres);
    }
    // Les colonnes de rattrapage vides sont retirées
    const utiles = colonnes.filter((col) => !col.startsWith('R') || principales.some((l) => l.valeurs[col]));
    const max = Math.max(0, ...principales.flatMap((l) => utiles.map((col) => l.valeurs[col] || 0)));
    return {
        colonnes: utiles,
        max,
        lignes: principales.map((l) => ({ ...l, valeurs: Object.fromEntries(utiles.map((col) => [col, l.valeurs[col] || 0])) }))
    };
}

async function evolution(filtres, maintenant) {
    const courant = semestreCourant(maintenant);
    let fin = { semestre: filtres.semestre || 'S2', annee: filtres.annee };
    if (rang(fin) > rang(courant)) fin = courant;
    const serie = derniers(fin, NB_SEMESTRES_EVOLUTION);
    const c = conditionsFiches(filtres, { sansAnnee: true, sansSemestre: true });
    const [rows] = await db.query(
        `SELECT f.annee, IF(f.periode IN (?), 'S1', 'S2') AS semestre, COUNT(*) AS fiches, COUNT(DISTINCT f.resident_id) AS residents
         ${DEPUIS} WHERE ${c.sql} AND f.annee BETWEEN ? AND ? GROUP BY f.annee, semestre`,
        [PERIODES_DU_SEMESTRE.S1, ...c.params, serie[0].annee, fin.annee]
    );
    return serie.map((s) => {
        const l = rows.find((r) => n(r.annee) === s.annee && r.semestre === s.semestre) || {};
        return { ...s, libelle: `${s.semestre} ${s.annee}`, fiches: n(l.fiches), residents: n(l.residents) };
    });
}

async function calculerAffectations(filtres, maintenant = new Date()) {
    const c = conditionsFiches(filtres);
    const requete = (sql, extra = []) => db.query(sql, [...c.params, ...extra]).then(([rows]) => rows);

    const [totaux, hopitaux, services, niveaux, facultes, cellules, serie] = await Promise.all([
        requete(`SELECT COUNT(*) AS fiches, COUNT(DISTINCT f.resident_id) AS residents,
                        COUNT(DISTINCT ${SQL_HOPITAL}) AS hopitaux, COUNT(DISTINCT ${SQL_SERVICE}) AS services
                 ${DEPUIS} WHERE ${c.sql}`),
        requete(`SELECT ${SQL_HOPITAL} AS hopital, COUNT(*) AS fiches, COUNT(DISTINCT f.resident_id) AS residents,
                        SUM(${SQL_TYPE} = 'trimestre') AS trimestres, SUM(${SQL_TYPE} = 'semestre') AS semestres,
                        SUM(${SQL_TYPE} = 'rattrapage') AS rattrapages
                 ${DEPUIS} WHERE ${c.sql} GROUP BY hopital ORDER BY fiches DESC, hopital`),
        requete(`SELECT ${SQL_SERVICE} AS service, COUNT(*) AS fiches, COUNT(DISTINCT ${SQL_HOPITAL}) AS hopitaux
                 ${DEPUIS} WHERE ${c.sql} GROUP BY service ORDER BY fiches DESC, service LIMIT ?`, [NB_SERVICES]),
        requete(`SELECT IF(r.promotion > 0, f.annee - r.promotion + 1, NULL) AS niveau, COUNT(*) AS fiches,
                        COUNT(DISTINCT f.resident_id) AS residents
                 ${DEPUIS} WHERE ${c.sql} GROUP BY niveau ORDER BY niveau`),
        requete(`SELECT COALESCE(NULLIF(TRIM(r.faculte_origine), ''), 'Non renseignée') AS faculte,
                        COUNT(DISTINCT f.resident_id) AS residents, COUNT(*) AS fiches
                 ${DEPUIS} WHERE ${c.sql} GROUP BY faculte ORDER BY residents DESC, faculte`),
        requete(`SELECT ${SQL_HOPITAL} AS hopital, ${SQL_COLONNE} AS colonne, COUNT(DISTINCT f.resident_id) AS residents
                 ${DEPUIS} WHERE ${c.sql} GROUP BY hopital, colonne`),
        evolution(filtres, maintenant)
    ]);

    const t = totaux[0] || {};
    const types = { trimestre: 0, semestre: 0, rattrapage: 0 };
    for (const h of hopitaux) {
        types.trimestre += n(h.trimestres);
        types.semestre += n(h.semestres);
        types.rattrapage += n(h.rattrapages);
    }

    return {
        filtres,
        totaux: { fiches: n(t.fiches), residents: n(t.residents), hopitaux: n(t.hopitaux), services: n(t.services) },
        types,
        parHopital: hopitaux.map((h) => ({
            hopital: h.hopital, fiches: n(h.fiches), residents: n(h.residents),
            trimestres: n(h.trimestres), semestres: n(h.semestres), rattrapages: n(h.rattrapages)
        })),
        parService: services.map((s) => ({ service: s.service, fiches: n(s.fiches), hopitaux: n(s.hopitaux) })),
        parNiveau: niveaux.filter((l) => l.niveau !== null && n(l.niveau) > 0)
            .map((l) => ({ niveau: n(l.niveau), fiches: n(l.fiches), residents: n(l.residents) })),
        parFaculte: facultes.map((l) => ({ faculte: l.faculte, residents: n(l.residents), fiches: n(l.fiches) })),
        carte: construireCarte(cellules, colonnesAffichees(filtres)),
        evolution: serie
    };
}

// Détail d'une case de la carte : services et résidents d'un hôpital sur une période.
async function detailCase(filtres, hopital, colonne) {
    const periodes = COLONNES[colonne];
    if (!periodes) return null;
    const c = conditionsFiches({ ...filtres, hopital: '', semestre: '' });
    const conditionHopital = hopital === NON_RENSEIGNE ? `${SQL_HOPITAL} = ?` : 'f.hopital = ?';
    const [rows] = await db.query(
        `SELECT r.id, r.nom_prenom, r.promotion, f.annee, f.periode, ${SQL_SERVICE} AS service
         ${DEPUIS} WHERE ${c.sql} AND ${conditionHopital} AND f.periode IN (?)
         ORDER BY service, r.nom_prenom`,
        [...c.params, hopital, periodes]
    );
    const services = new Map();
    for (const l of rows) services.set(l.service, (services.get(l.service) || new Set()).add(l.id));
    return {
        hopital, colonne, annee: filtres.annee,
        residents: new Set(rows.map((l) => l.id)).size,
        services: [...services.entries()].map(([service, ids]) => ({ service, residents: ids.size }))
            .sort((a, b) => b.residents - a.residents || a.service.localeCompare(b.service, 'fr')),
        liste: rows.map((l) => ({
            id: l.id, nom_prenom: l.nom_prenom, service: l.service, periode: l.periode,
            niveau: l.promotion > 0 ? l.annee - l.promotion + 1 : null
        }))
    };
}

// Valeurs proposées dans les filtres
async function optionsFiltres() {
    const [[annees], [promotions], [facultes], [hopitaux]] = await Promise.all([
        db.query('SELECT DISTINCT annee FROM formulaires_stage ORDER BY annee DESC'),
        db.query('SELECT DISTINCT promotion FROM residents WHERE promotion > 0 ORDER BY promotion DESC'),
        db.query(`SELECT DISTINCT TRIM(faculte_origine) AS faculte FROM residents
                  WHERE faculte_origine IS NOT NULL AND TRIM(faculte_origine) <> '' ORDER BY faculte`),
        db.query(`SELECT f.hopital, COUNT(*) AS fiches FROM formulaires_stage f
                  WHERE f.hopital IS NOT NULL AND TRIM(f.hopital) <> '' GROUP BY f.hopital ORDER BY f.hopital`)
    ]);
    return {
        annees: annees.map((l) => n(l.annee)),
        promotions: promotions.map((l) => n(l.promotion)),
        facultes: facultes.map((l) => l.faculte),
        hopitaux: hopitaux.map((l) => l.hopital)
    };
}

module.exports = { calculerAffectations, detailCase, optionsFiltres, construireCarte, COLONNES, NON_RENSEIGNE };
