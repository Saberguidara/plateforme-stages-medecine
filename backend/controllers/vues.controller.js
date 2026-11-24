// Vues enregistrées : un écran de l'administration avec ses filtres (paramètres de l'adresse),
// nommé et partagé par toute l'équipe. Chacun peut supprimer les siennes ; un administrateur complet,
// toutes. Les comptes en lecture seule les consultent sans en créer.
const db = require('../config/db');
const logger = require('../utils/logger');

const ECRANS = ['residents', 'statistiques', 'parcours'];
const NOM_MAX = 80;
const PARAMETRES_MAX = 2000;

const tableAbsente = (error) => error && error.code === 'ER_NO_SUCH_TABLE';

/** Paramètres d'adresse acceptés : un objet de chaînes ou de nombres, sans valeur vide. */
function lireParametres(valeur) {
    if (!valeur || typeof valeur !== 'object' || Array.isArray(valeur)) return null;
    const propres = {};
    for (const [cle, v] of Object.entries(valeur)) {
        if (!/^[a-zA-Z_]{1,30}$/.test(cle)) return null;
        if (v === null || v === undefined || v === '') continue;
        if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') return null;
        propres[cle] = String(v).slice(0, 200);
    }
    const json = JSON.stringify(propres);
    return json.length <= PARAMETRES_MAX ? propres : null;
}

function versVue(ligne) {
    let parametres = {};
    try { parametres = JSON.parse(ligne.parametres || '{}'); } catch { parametres = {}; }
    return { id: ligne.id, nom: ligne.nom, ecran: ligne.ecran, parametres, cree_par: ligne.cree_par, cree_le: ligne.cree_le };
}

exports.lister = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT id, nom, ecran, parametres, cree_par, cree_le FROM vues_enregistrees ORDER BY ecran, nom');
        res.json({ disponible: true, vues: rows.map(versVue) });
    } catch (error) {
        if (tableAbsente(error)) return res.json({ disponible: false, vues: [] });
        logger.error('Vues enregistrées : ' + error);
        res.status(500).json({ message: 'Erreur lors du chargement des vues enregistrées.' });
    }
};

exports.creer = async (req, res) => {
    const nom = String(req.body?.nom ?? '').trim().replace(/\s+/g, ' ');
    const ecran = String(req.body?.ecran ?? '');
    const parametres = lireParametres(req.body?.parametres ?? {});
    if (!nom || nom.length > NOM_MAX) return res.status(400).json({ message: `Donnez un nom de 1 à ${NOM_MAX} caractères.` });
    if (!ECRANS.includes(ecran)) return res.status(400).json({ message: 'Écran inconnu.' });
    if (!parametres) return res.status(400).json({ message: 'Filtres invalides.' });
    try {
        const [resultat] = await db.query(
            'INSERT INTO vues_enregistrees (nom, ecran, parametres, cree_par) VALUES (?, ?, ?, ?)',
            [nom, ecran, JSON.stringify(parametres), req.admin?.login || null]
        );
        res.status(201).json({ id: resultat.insertId, nom, ecran, parametres, cree_par: req.admin?.login || null, message: `Vue « ${nom} » enregistrée.` });
    } catch (error) {
        if (tableAbsente(error)) return res.status(503).json({ message: "Les vues enregistrées ne sont pas encore activées sur la base (migration 010)." });
        logger.error('Création d\'une vue : ' + error);
        res.status(500).json({ message: "La vue n'a pas pu être enregistrée." });
    }
};

exports.supprimer = async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (!id) return res.status(400).json({ message: 'Vue invalide.' });
    try {
        const [rows] = await db.query('SELECT id, nom, cree_par FROM vues_enregistrees WHERE id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({ message: 'Vue introuvable.' });
        const auteur = rows[0].cree_par && rows[0].cree_par === req.admin?.login;
        if (!auteur && req.admin?.droits !== 'admin') {
            return res.status(403).json({ message: 'Seul son auteur ou un administrateur peut supprimer cette vue.' });
        }
        await db.query('DELETE FROM vues_enregistrees WHERE id = ?', [id]);
        res.json({ message: `Vue « ${rows[0].nom} » supprimée.` });
    } catch (error) {
        logger.error('Suppression d\'une vue : ' + error);
        res.status(500).json({ message: "La vue n'a pas pu être supprimée." });
    }
};

exports.lireParametres = lireParametres;
