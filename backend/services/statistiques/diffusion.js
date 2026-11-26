// Diffusion des fiches d'un semestre : délai entre l'e-mail « fiche disponible » et le premier
// téléchargement, taux de récupération par année de résidanat, et résidents à qui envoyer un rappel.
const db = require('../../config/db');
const { PERIODES_DU_SEMESTRE, semestreCourant } = require('../../config/specialites');
const { rang } = require('./semestres');
const { mediane } = require('./synthese');

const HEURE = 60 * 60 * 1000;
const JOUR = 24 * HEURE;
// Un rappel n'est proposé qu'une semaine après l'e-mail, puis au plus une fois par semaine.
const DELAI_AVANT_RAPPEL = 7 * JOUR;

const TRANCHES = [
    { cle: 'avant', libelle: "Avant l'e-mail" },
    { cle: 'moins-24h', libelle: 'Moins de 24 h', max: 24 },
    { cle: '1-3j', libelle: '1 à 3 jours', max: 72 },
    { cle: '3-7j', libelle: '3 à 7 jours', max: 168 },
    { cle: '1-2sem', libelle: '1 à 2 semaines', max: 336 },
    { cle: 'plus-2sem', libelle: 'Plus de 2 semaines', max: Infinity },
    { cle: 'jamais', libelle: 'Jamais téléchargée' }
];

function tranche(heures) {
    if (heures < 0) return 'avant';
    return TRANCHES.find((t) => t.max !== undefined && heures < t.max).cle;
}

// Fiches du semestre avec leur e-mail, leur premier téléchargement et leur dernier rappel.
async function fichesDuSemestre(s) {
    const colonnes = `f.id, f.resident_id, f.periode, f.annee, f.hopital, f.service, r.nom_prenom, r.email,
        IF(r.promotion > 0, f.annee - r.promotion + 1, NULL) AS niveau, n.envoye_le,
        (SELECT MIN(t.telecharge_le) FROM telechargements t WHERE t.fiche_id = f.id) AS premier_telechargement`;
    const depuis = `FROM formulaires_stage f JOIN residents r ON r.id = f.resident_id
        LEFT JOIN notifications_fiches n ON n.fiche_id = f.id
        WHERE f.periode IN (?) AND f.annee = ?`;
    const params = [PERIODES_DU_SEMESTRE[s.semestre], s.annee];
    try {
        const [rows] = await db.query(
            `SELECT ${colonnes}, (SELECT MAX(x.envoye_le) FROM relances_fiches x WHERE x.fiche_id = f.id) AS dernier_rappel ${depuis}`,
            params
        );
        return { fiches: rows, rappelsDisponibles: true };
    } catch (error) {
        // Migration 009 pas encore appliquée : pas de rappels, le reste fonctionne
        if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
        const [rows] = await db.query(`SELECT ${colonnes}, NULL AS dernier_rappel ${depuis}`, params);
        return { fiches: rows, rappelsDisponibles: false };
    }
}

const date = (v) => (v ? new Date(v) : null);

// Fiches annoncées depuis une semaine, jamais téléchargées, sans rappel la semaine passée.
function aRappeler(fiche, maintenant) {
    const envoi = date(fiche.envoye_le);
    const rappel = date(fiche.dernier_rappel);
    return Boolean(envoi && !fiche.premier_telechargement
        && maintenant - envoi >= DELAI_AVANT_RAPPEL
        && (!rappel || maintenant - rappel >= DELAI_AVANT_RAPPEL));
}

function regrouperParResident(fiches) {
    const parResident = new Map();
    for (const f of fiches) {
        if (!parResident.has(f.resident_id)) {
            parResident.set(f.resident_id, { id: f.resident_id, nom_prenom: f.nom_prenom, email: f.email, fiches: [] });
        }
        parResident.get(f.resident_id).fiches.push(f);
    }
    return [...parResident.values()];
}

/** Fiches du semestre en cours pour lesquelles un rappel peut partir, regroupées par résident. */
async function rappelsAEnvoyer(maintenant = new Date()) {
    const { fiches, rappelsDisponibles } = await fichesDuSemestre(semestreCourant(maintenant));
    const candidates = fiches.filter((f) => aRappeler(f, maintenant));
    const residents = regrouperParResident(candidates);
    return {
        rappelsDisponibles,
        avecEmail: residents.filter((r) => r.email),
        sansEmail: residents.filter((r) => !r.email)
    };
}

async function calculerDiffusion(s, maintenant = new Date()) {
    const { fiches, rappelsDisponibles } = await fichesDuSemestre(s);
    const enCours = rang(s) === rang(semestreCourant(maintenant));

    const compte = Object.fromEntries(TRANCHES.map((t) => [t.cle, 0]));
    const delais = [];
    const parNiveau = new Map();
    let annoncees = 0;
    let telechargees = 0;
    for (const f of fiches) {
        const envoi = date(f.envoye_le);
        const premier = date(f.premier_telechargement);
        if (premier) telechargees++;
        if (envoi) {
            annoncees++;
            if (premier) {
                const heures = (premier - envoi) / HEURE;
                compte[tranche(heures)]++;
                if (heures >= 0) delais.push(heures);
            } else {
                compte.jamais++;
            }
        }
        if (f.niveau > 0) {
            const n = parNiveau.get(f.niveau) || { niveau: Number(f.niveau), fiches: 0, telechargees: 0 };
            n.fiches++;
            if (premier) n.telechargees++;
            parNiveau.set(f.niveau, n);
        }
    }

    const medianeHeures = mediane(delais);
    const rappels = enCours ? regrouperParResident(fiches.filter((f) => aRappeler(f, maintenant))) : [];
    const jamaisTelechargees = fiches.filter((f) => !f.premier_telechargement);

    return {
        semestre: { semestre: s.semestre, annee: s.annee, libelle: `${s.semestre} ${s.annee}` },
        enCours,
        totaux: {
            fiches: fiches.length,
            annoncees,
            telechargees,
            residentsPrevenus: new Set(fiches.filter((f) => f.envoye_le).map((f) => f.resident_id)).size,
            jamaisTelechargees: jamaisTelechargees.length,
            jamaisSansEmail: new Set(jamaisTelechargees.filter((f) => !f.email).map((f) => f.resident_id)).size
        },
        delaiMedianHeures: medianeHeures === null ? null : Math.round(medianeHeures * 10) / 10,
        partMoins24h: annoncees > 0 ? Math.round((compte['moins-24h'] / annoncees) * 100) : null,
        tranches: TRANCHES.map((t) => ({ cle: t.cle, libelle: t.libelle, fiches: compte[t.cle] })),
        parNiveau: [...parNiveau.values()].sort((a, b) => a.niveau - b.niveau)
            .map((n) => ({ ...n, taux: n.fiches > 0 ? Math.round((n.telechargees / n.fiches) * 100) : null })),
        rappels: {
            disponibles: rappelsDisponibles && enCours,
            migrationManquante: !rappelsDisponibles,
            residents: rappels.filter((r) => r.email).length,
            fiches: rappels.filter((r) => r.email).reduce((n, r) => n + r.fiches.length, 0),
            sansEmail: rappels.filter((r) => !r.email).length
        }
    };
}

module.exports = { calculerDiffusion, rappelsAEnvoyer, aRappeler, tranche, TRANCHES, DELAI_AVANT_RAPPEL };
