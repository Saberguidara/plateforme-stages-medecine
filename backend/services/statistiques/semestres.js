// Semestres civils (S1 : janvier à juin, S2 : juillet à décembre) manipulés par les statistiques.
const { semestreCourant } = require('../../config/specialites');

const ANNEE_MIN = 2000;

function rang({ semestre, annee }) {
    return annee * 2 + (semestre === 'S2' ? 1 : 0);
}

function depuisRang(r) {
    return { semestre: r % 2 === 1 ? 'S2' : 'S1', annee: Math.floor(r / 2) };
}

// Semestre demandé dans la requête (?semestre=S1&annee=2026), le semestre en cours par défaut.
// Un semestre futur est refusé : il n'a encore aucune donnée.
function lireSemestre(query = {}, maintenant = new Date()) {
    const courant = semestreCourant(maintenant);
    if (query.semestre === undefined && query.annee === undefined) return { valid: true, ...courant };

    const semestre = String(query.semestre || '');
    const annee = /^\d{4}$/.test(String(query.annee || '')) ? parseInt(query.annee, 10) : NaN;
    if (!['S1', 'S2'].includes(semestre) || !(annee >= ANNEE_MIN)) {
        return { valid: false, message: 'Semestre invalide : semestre=S1 ou S2 et annee sur 4 chiffres.' };
    }
    if (rang({ semestre, annee }) > rang(courant)) {
        return { valid: false, message: 'Ce semestre n\'a pas encore commencé.' };
    }
    return { valid: true, semestre, annee };
}

function decaler(s, nombre) {
    return depuisRang(rang(s) + nombre);
}

// Les « nombre » derniers semestres, du plus ancien au semestre donné inclus.
function derniers(s, nombre) {
    return Array.from({ length: nombre }, (_, i) => decaler(s, i - nombre + 1));
}

// Premier jour du semestre et premier jour du semestre suivant (borne exclue), en heure locale.
function bornes({ semestre, annee }) {
    const debut = new Date(annee, semestre === 'S1' ? 0 : 6, 1);
    const fin = new Date(annee, semestre === 'S1' ? 6 : 12, 1);
    return { debut, fin };
}

function memeSemestre(a, b) {
    return a.semestre === b.semestre && a.annee === b.annee;
}

module.exports = { lireSemestre, decaler, derniers, bornes, memeSemestre, rang };
