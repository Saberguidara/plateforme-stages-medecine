// Synthèse d'un semestre pour le tableau de bord : indicateurs comparés au même semestre
// de l'année précédente, évolution sur six semestres, diffusion des fiches et téléchargements par semaine.
// Tout se calcule à partir des fiches du semestre (périodes rattachées au semestre civil) :
// les chiffres d'un semestre passé restent donc justes même après la fin du résidanat des résidents.
const db = require('../../config/db');
const { PERIODES_DU_SEMESTRE, semestreCourant } = require('../../config/specialites');
const { decaler, derniers, bornes, memeSemestre, rang } = require('./semestres');

const NB_SEMESTRES = 6;
const SEMAINES_AVANT = 4; // les fiches sont souvent publiées quelques semaines avant le début du semestre
const JOUR = 24 * 60 * 60 * 1000;

const libelle = ({ semestre, annee }) => `${semestre} ${annee}`;

function jourLocal(date) {
    const p = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

function lundi(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
}

function pourcentage(n, total) {
    return total > 0 ? Math.round((n / total) * 100) : null;
}

function mediane(valeurs) {
    if (valeurs.length === 0) return null;
    const tri = [...valeurs].sort((a, b) => a - b);
    const milieu = Math.floor(tri.length / 2);
    return tri.length % 2 ? tri[milieu] : (tri[milieu - 1] + tri[milieu]) / 2;
}

// Fiches, résidents, fiches annoncées par e-mail et fiches téléchargées, pour chaque semestre.
async function parSemestre(liste) {
    const annees = liste.map((s) => s.annee);
    const [rows] = await db.query(
        `SELECT f.annee, IF(f.periode IN (?), 'S1', 'S2') AS semestre,
                COUNT(*) AS fiches, COUNT(DISTINCT f.resident_id) AS residents,
                SUM(EXISTS (SELECT 1 FROM notifications_fiches n WHERE n.fiche_id = f.id)) AS annoncees,
                SUM(EXISTS (SELECT 1 FROM telechargements t WHERE t.fiche_id = f.id)) AS telechargees
         FROM formulaires_stage f
         WHERE f.annee BETWEEN ? AND ? AND f.periode IN (?)
         GROUP BY f.annee, semestre`,
        [PERIODES_DU_SEMESTRE.S1, Math.min(...annees), Math.max(...annees),
            [...PERIODES_DU_SEMESTRE.S1, ...PERIODES_DU_SEMESTRE.S2]]
    );
    return liste.map((s) => {
        const ligne = rows.find((r) => Number(r.annee) === s.annee && r.semestre === s.semestre) || {};
        const fiches = Number(ligne.fiches) || 0;
        const telechargees = Number(ligne.telechargees) || 0;
        return {
            ...s,
            fiches,
            residents: Number(ligne.residents) || 0,
            annoncees: Number(ligne.annoncees) || 0,
            telechargees,
            tauxRecuperation: pourcentage(telechargees, fiches)
        };
    });
}

// Téléchargements et e-mails « fiche disponible » des fiches du semestre, regroupés par semaine (lundi).
async function parSemaine(s, maintenant) {
    const { debut, fin } = bornes(s);
    const premier = lundi(new Date(debut.getTime() - SEMAINES_AVANT * 7 * JOUR));
    const dernier = new Date(Math.min(fin.getTime(), maintenant.getTime() + JOUR));
    const periodes = PERIODES_DU_SEMESTRE[s.semestre];

    const compterParJour = async (table, colonne) => {
        const [rows] = await db.query(
            `SELECT DATE_FORMAT(x.${colonne}, '%Y-%m-%d') AS jour, COUNT(*) AS n
             FROM ${table} x JOIN formulaires_stage f ON f.id = x.fiche_id
             WHERE f.periode IN (?) AND f.annee = ? AND x.${colonne} >= ? AND x.${colonne} < ?
             GROUP BY jour`,
            [periodes, s.annee, premier, dernier]
        );
        return rows;
    };
    const [telechargements, envois] = await Promise.all([
        compterParJour('telechargements', 'telecharge_le'),
        compterParJour('notifications_fiches', 'envoye_le')
    ]);

    const semaines = [];
    for (let d = new Date(premier); d < dernier; d.setDate(d.getDate() + 7)) {
        semaines.push({ debut: jourLocal(d), telechargements: 0, envois: 0 });
    }
    const ajouter = (rows, champ) => {
        for (const { jour, n } of rows) {
            const [a, m, j] = String(jour).split('-').map(Number);
            const cle = jourLocal(lundi(new Date(a, m - 1, j)));
            const semaine = semaines.find((x) => x.debut === cle);
            if (semaine) semaine[champ] += Number(n) || 0;
        }
    };
    ajouter(telechargements, 'telechargements');
    ajouter(envois, 'envois');
    return semaines;
}

// Signalements encore ouverts (aujourd'hui) et délai de traitement de ceux reçus pendant le semestre.
async function signalements(s) {
    const { debut, fin } = bornes(s);
    const [[ouverts], [recus]] = await Promise.all([
        db.query('SELECT COUNT(*) AS n, MIN(cree_le) AS plus_ancien FROM signalements WHERE traite_le IS NULL'),
        db.query(
            `SELECT TIMESTAMPDIFF(MINUTE, cree_le, traite_le) AS minutes FROM signalements
             WHERE cree_le >= ? AND cree_le < ?`,
            [debut, fin]
        )
    ]);
    const delais = recus.map((r) => r.minutes).filter((m) => m !== null && m !== undefined).map(Number);
    const minutes = mediane(delais);
    return {
        ouverts: Number(ouverts[0]?.n) || 0,
        plusAncien: ouverts[0]?.plus_ancien || null,
        recus: recus.length,
        traites: delais.length,
        delaiMedianHeures: minutes === null ? null : Math.round((minutes / 60) * 10) / 10
    };
}

async function calculerSynthese(s, maintenant = new Date()) {
    const comparaison = decaler(s, -2);
    const serie = derniers(s, NB_SEMESTRES);
    const [semestres, semaines, sig] = await Promise.all([
        parSemestre(serie),
        parSemaine(s, maintenant),
        signalements(s)
    ]);
    const actuel = semestres[semestres.length - 1];
    const precedent = semestres.find((x) => memeSemestre(x, comparaison));
    const indicateur = (champ) => ({ valeur: actuel[champ], precedent: precedent ? precedent[champ] : null });

    return {
        semestre: { semestre: s.semestre, annee: s.annee, libelle: libelle(s) },
        comparaison: { ...comparaison, libelle: libelle(comparaison) },
        enCours: rang(s) === rang(semestreCourant(maintenant)),
        indicateurs: {
            residents: indicateur('residents'),
            fiches: indicateur('fiches'),
            tauxRecuperation: indicateur('tauxRecuperation'),
            signalements: sig
        },
        diffusion: { creees: actuel.fiches, annoncees: actuel.annoncees, telechargees: actuel.telechargees },
        semestres: semestres.map((x) => ({ ...x, libelle: libelle(x) })),
        semaines
    };
}

module.exports = { calculerSynthese, mediane, lundi, jourLocal };
