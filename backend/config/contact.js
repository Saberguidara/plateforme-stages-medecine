// Coordonnées du service des stages affichées sur la page d'aide.
// Chaque valeur peut être remplacée dans .env ; une valeur vide n'est pas affichée.
function contact() {
    const valeur = (cle, defaut = '') => (process.env[cle] ?? defaut).trim() || null;
    return {
        email: valeur('CONTACT_EMAIL', 'saber_guidara@medecinesfax.org'),
        telephone: valeur('CONTACT_TELEPHONE'),
        adresse: valeur('CONTACT_ADRESSE'),
        horaires: valeur('CONTACT_HORAIRES')
    };
}

module.exports = { contact };
