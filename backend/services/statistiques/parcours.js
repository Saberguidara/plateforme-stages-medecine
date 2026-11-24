// Parcours de résidanat : les semestres de chaque résident en cours, de l'entrée en 1re année
// (promotion) à la fin du résidanat, avec l'état de chacun.
//
// Un semestre est « fait » quand ses deux trimestres sont couverts : par un stage semestriel (S1, S2),
// par un stage trimestriel (T1…T4) ou par ses deux moitiés de 45 jours (T1A + T1B…).
// Un semestre incomplet mais rattrapé (R1, R2) est « rattrapé ».
const db = require('../../config/db');
const { PERIODES_DU_SEMESTRE, semestreCourant, dureeDe } = require('../../config/specialites');
const { NIVEAU_COURANT, ACTIF, paramsActif } = require('../filtres-residents');
const { rang } = require('./semestres');

const TRIMESTRES = { S1: ['T1', 'T2'], S2: ['T3', 'T4'] };
const RATTRAPAGE = { S1: 'R1', S2: 'R2' };

function trimestreCouvert(periodes, semestre, trimestre) {
    return periodes.has(semestre) || periodes.has(trimestre) || (periodes.has(`${trimestre}A`) && periodes.has(`${trimestre}B`));
}

/**
 * @param {{ promotion: number|null, niveau: number|null, specialite?: string }} resident
 * @param {{ periode: string, annee: number, service?: string, hopital?: string }[]} fiches
 * @param {{ semestre: string, annee: number }} courant
 */
function construireParcours(resident, fiches, courant) {
    const duree = dureeDe(resident.specialite);
    const promotion = Number(resident.promotion) > 0
        ? Number(resident.promotion)
        : (Number(resident.niveau) > 0 ? courant.annee - Number(resident.niveau) + 1 : null);
    if (!promotion) return null;

    const rangCourant = rang(courant);
    const semestres = [];
    for (let niveau = 1; niveau <= duree; niveau++) {
        const annee = promotion + niveau - 1;
        for (const semestre of ['S1', 'S2']) {
            const ordinaires = fiches.filter((f) => Number(f.annee) === annee && PERIODES_DU_SEMESTRE[semestre].includes(f.periode) && !f.periode.startsWith('R'));
            const rattrapages = fiches.filter((f) => Number(f.annee) === annee && f.periode === RATTRAPAGE[semestre]);
            const periodes = new Set(ordinaires.map((f) => f.periode));
            const complet = TRIMESTRES[semestre].every((t) => trimestreCouvert(periodes, semestre, t));
            const r = rang({ semestre, annee });

            let etat;
            if (r > rangCourant) etat = ordinaires.length > 0 ? 'prevu' : 'a-venir';
            else if (r === rangCourant) etat = ordinaires.length > 0 ? 'en-cours' : 'manquant';
            else if (complet) etat = 'fait';
            else if (rattrapages.length > 0) etat = 'rattrape';
            else etat = ordinaires.length > 0 ? 'partiel' : 'manquant';

            semestres.push({
                niveau, semestre, annee, etat,
                stages: [...ordinaires, ...rattrapages].map((f) => ({ periode: f.periode, service: f.service || null, hopital: f.hopital || null }))
            });
        }
    }

    const passes = semestres.filter((s) => rang(s) < rangCourant);
    const fin = promotion + duree - 1;
    return {
        promotion,
        semestres,
        faits: semestres.filter((s) => s.etat === 'fait' || s.etat === 'rattrape').length,
        total: semestres.length,
        // Semestres déjà terminés sans stage complet ni rattrapage
        incomplets: passes.filter((s) => s.etat === 'manquant' || s.etat === 'partiel').length,
        sansFicheCourant: semestres.some((s) => rang(s) === rangCourant && s.etat === 'manquant'),
        horsParcours: fiches.filter((f) => Number(f.annee) < promotion || Number(f.annee) > fin).length
    };
}

/**
 * @param {{ promotion?: number|null, faculte?: string, etat?: string, search?: string }} options
 */
async function calculerParcours(options = {}, maintenant = new Date()) {
    const courant = semestreCourant(maintenant);
    const conditions = [ACTIF];
    const params = [...paramsActif()];
    if (options.faculte) { conditions.push('r.faculte_origine = ?'); params.push(options.faculte); }

    const [residents] = await db.query(
        `SELECT r.id, r.nom_prenom, r.promotion, r.specialite, r.faculte_origine, ${NIVEAU_COURANT} AS niveau
         FROM residents r WHERE ${conditions.join(' AND ')} ORDER BY r.nom_prenom`,
        params
    );
    const ids = residents.map((r) => r.id);
    const [fiches] = ids.length === 0 ? [[]] : await db.query(
        'SELECT resident_id, periode, annee, service, hopital FROM formulaires_stage WHERE resident_id IN (?)',
        [ids]
    );
    const parResident = new Map();
    for (const f of fiches) {
        if (!parResident.has(f.resident_id)) parResident.set(f.resident_id, []);
        parResident.get(f.resident_id).push(f);
    }

    const tous = residents.map((r) => {
        const p = construireParcours(r, parResident.get(r.id) || [], courant);
        return p && { id: r.id, nom_prenom: r.nom_prenom, faculte: r.faculte_origine || null, niveau: Number(r.niveau), ...p };
    }).filter(Boolean);

    // Synthèse par promotion (avant les filtres de la liste)
    const promotions = new Map();
    for (const r of tous) {
        const p = promotions.get(r.promotion) || { promotion: r.promotion, niveau: r.niveau, residents: 0, aJour: 0, incomplets: 0, sansFicheCourant: 0 };
        p.residents++;
        if (r.incomplets > 0) p.incomplets++; else p.aJour++;
        if (r.sansFicheCourant) p.sansFicheCourant++;
        promotions.set(r.promotion, p);
    }

    const recherche = String(options.search || '').trim().toUpperCase();
    const liste = tous.filter((r) => (!options.promotion || r.promotion === options.promotion)
        && (options.etat !== 'incomplets' || r.incomplets > 0 || r.sansFicheCourant)
        && (!recherche || r.nom_prenom.toUpperCase().includes(recherche)));

    return {
        courant,
        promotions: [...promotions.values()].sort((a, b) => b.promotion - a.promotion),
        residents: liste
    };
}

module.exports = { construireParcours, calculerParcours };
