// Filtres communs du module Statistiques : ?annee=2026&semestre=S2&promotion=2025&faculte=FMSfax&hopital=…
// Ils s'appliquent aux fiches (f) et à leurs résidents (r).
const { PERIODES_DU_SEMESTRE } = require('../../config/specialites');

const LONGUEUR_MAX = 150;

function texte(valeur) {
    return String(valeur ?? '').trim().slice(0, LONGUEUR_MAX);
}

function lireFiltres(query = {}, maintenant = new Date()) {
    const anneeCourante = maintenant.getFullYear();
    const filtres = { annee: anneeCourante, semestre: '', promotion: null, faculte: '', hopital: '' };

    if (query.annee !== undefined && query.annee !== '') {
        if (!/^\d{4}$/.test(String(query.annee))) return { valid: false, message: 'Année invalide (4 chiffres).' };
        filtres.annee = parseInt(query.annee, 10);
        if (filtres.annee > anneeCourante + 1) return { valid: false, message: 'Année trop lointaine.' };
    }
    if (query.semestre) {
        if (!['S1', 'S2'].includes(String(query.semestre))) return { valid: false, message: 'Semestre invalide : S1 ou S2.' };
        filtres.semestre = String(query.semestre);
    }
    if (query.promotion !== undefined && query.promotion !== '') {
        if (!/^\d{4}$/.test(String(query.promotion))) return { valid: false, message: 'Promotion invalide (4 chiffres).' };
        filtres.promotion = parseInt(query.promotion, 10);
    }
    filtres.faculte = texte(query.faculte);
    filtres.hopital = texte(query.hopital);
    return { valid: true, filtres };
}

// Conditions SQL sur les fiches. « sansAnnee » sert aux séries d'évolution sur plusieurs années.
function conditionsFiches(filtres, { sansAnnee = false, sansSemestre = false } = {}) {
    const conditions = [];
    const params = [];
    if (!sansAnnee) { conditions.push('f.annee = ?'); params.push(filtres.annee); }
    if (filtres.semestre && !sansSemestre) { conditions.push('f.periode IN (?)'); params.push(PERIODES_DU_SEMESTRE[filtres.semestre]); }
    if (filtres.promotion) { conditions.push('r.promotion = ?'); params.push(filtres.promotion); }
    if (filtres.faculte) { conditions.push('r.faculte_origine = ?'); params.push(filtres.faculte); }
    if (filtres.hopital) { conditions.push('f.hopital = ?'); params.push(filtres.hopital); }
    return { sql: conditions.length ? conditions.join(' AND ') : '1=1', params };
}

function cle(filtres) {
    return [filtres.annee, filtres.semestre, filtres.promotion || '', filtres.faculte, filtres.hopital].join('|');
}

module.exports = { lireFiltres, conditionsFiches, cle };
