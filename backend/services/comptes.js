// Comptes administrateurs : le rôle et l'état actif sont relus en base (avec un court cache),
// pour qu'une désactivation ou un passage en lecture seule s'applique sans attendre l'expiration du jeton.
const db = require('../config/db');

const DUREE_CACHE_MS = 30 * 1000;
const cache = new Map();

async function compteActif(id) {
    const cle = parseInt(id, 10);
    if (!cle) return null;
    const enCache = cache.get(cle);
    if (enCache && enCache.expire > Date.now()) return enCache.compte;

    const [rows] = await db.query('SELECT id, login, nom, role, actif FROM administrateurs WHERE id = ?', [cle]);
    const compte = rows[0] && rows[0].actif ? { id: rows[0].id, login: rows[0].login, nom: rows[0].nom, role: rows[0].role } : null;
    cache.set(cle, { compte, expire: Date.now() + DUREE_CACHE_MS });
    return compte;
}

function invalider(id) {
    if (id === undefined) cache.clear();
    else cache.delete(parseInt(id, 10));
}

module.exports = { compteActif, invalider };
