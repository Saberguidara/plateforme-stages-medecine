// Cache mémoire des statistiques : les agrégats sont recalculés au plus toutes les 5 minutes,
// et tout de suite après une modification (import, fiche, signalement, envoi d'e-mails…) :
// server.js vide le cache après chaque requête d'écriture réussie.
const DUREE_PAR_DEFAUT = 5 * 60 * 1000;

const entrees = new Map();
// Désactivé pendant les tests : chaque test fournit ses propres réponses de la base.
let actif = process.env.NODE_ENV !== 'test';

async function memoriser(cle, calcul, duree = DUREE_PAR_DEFAUT) {
    if (!actif) return calcul();
    const entree = entrees.get(cle);
    if (entree && entree.expire > Date.now()) return entree.promesse;

    const promesse = calcul();
    entrees.set(cle, { promesse, expire: Date.now() + duree });
    // Une erreur n'est pas mémorisée : la requête suivante recalcule.
    promesse.catch(() => entrees.delete(cle));
    return promesse;
}

function vider() {
    entrees.clear();
}

// Vide le cache après chaque requête d'écriture qui a abouti.
function viderApresEcriture(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
        res.on('finish', () => { if (res.statusCode < 400) vider(); });
    }
    next();
}

function configurer(options = {}) {
    if (typeof options.actif === 'boolean') actif = options.actif;
}

module.exports = { memoriser, vider, viderApresEcriture, configurer };
