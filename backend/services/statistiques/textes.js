// Mise en forme de durées pour les textes générés (rapport PDF).
const nombre = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

/** Délai en heures, écrit en heures jusqu'à deux jours, puis en jours. */
function delaiTexte(heures) {
    if (heures === null || heures === undefined) return '';
    if (heures < 1) return "moins d'une heure";
    if (heures < 48) return `${nombre.format(Math.round(heures))} h`;
    return `${nombre.format(Math.round((heures / 24) * 10) / 10)} jours`.replace(/\u202f|\u00a0/g, ' ');
}

module.exports = { delaiTexte };
