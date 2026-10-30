// Comptes administrateurs nominatifs : rôle « admin » (tout) ou « lecture » (consultation seule).
const bcrypt = require('bcrypt');
const db = require('../config/db');
const logger = require('../utils/logger');
const comptes = require('../services/comptes');
const { normalizeString } = require('../utils/validation');
const { journaliser } = require('../utils/journal');

const ROLES = ['admin', 'lecture'];
const MOT_DE_PASSE_MIN = 12;

const publier = (c) => ({
    id: c.id, login: c.login, nom: c.nom, role: c.role, actif: Boolean(c.actif),
    cree_le: c.cree_le, derniere_connexion: c.derniere_connexion
});

exports.moi = (req, res) => {
    res.json({ id: req.admin.id, login: req.admin.login, droits: req.admin.droits });
};

exports.lister = async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT id, login, nom, role, actif, cree_le, derniere_connexion FROM administrateurs ORDER BY actif DESC, login ASC'
        );
        res.json(rows.map(publier));
    } catch (error) {
        logger.error('Liste des comptes : ' + error);
        res.status(500).json({ message: 'Erreur lors du chargement des comptes.' });
    }
};

exports.creer = async (req, res) => {
    const login = normalizeString(req.body.login).toLowerCase();
    const nom = normalizeString(req.body.nom) || null;
    const motDePasse = String(req.body.mot_de_passe || '');
    const role = ROLES.includes(req.body.role) ? req.body.role : 'lecture';

    if (!/^[a-z0-9._-]{3,50}$/.test(login)) {
        return res.status(400).json({ message: 'Identifiant : 3 à 50 caractères (lettres, chiffres, point, tiret).' });
    }
    if (motDePasse.length < MOT_DE_PASSE_MIN) {
        return res.status(400).json({ message: `Le mot de passe doit comporter au moins ${MOT_DE_PASSE_MIN} caractères.` });
    }

    try {
        const [existe] = await db.query('SELECT id FROM administrateurs WHERE login = ?', [login]);
        if (existe.length) return res.status(409).json({ message: 'Cet identifiant est déjà utilisé.' });

        const hash = await bcrypt.hash(motDePasse, 12);
        const [resultat] = await db.query(
            'INSERT INTO administrateurs (login, nom, mot_de_passe, role) VALUES (?, ?, ?, ?)',
            [login, nom, hash, role]
        );
        await journaliser(db, req, {
            action: 'creation', entite: 'administrateur', entiteId: resultat.insertId, apres: { login, nom, role }
        });
        res.json({ success: true, id: resultat.insertId, message: `Compte « ${login} » créé.` });
    } catch (error) {
        logger.error('Création de compte : ' + error);
        res.status(500).json({ message: 'Erreur lors de la création du compte.' });
    }
};

exports.modifier = async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (!id) return res.status(400).json({ message: 'Identifiant de compte invalide.' });

    try {
        const [rows] = await db.query('SELECT id, login, nom, role, actif FROM administrateurs WHERE id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({ message: 'Compte introuvable.' });
        const avant = rows[0];

        const nom = req.body.nom === undefined ? avant.nom : (normalizeString(req.body.nom) || null);
        const role = ROLES.includes(req.body.role) ? req.body.role : avant.role;
        const actif = req.body.actif === undefined ? Boolean(avant.actif) : Boolean(req.body.actif);
        const motDePasse = req.body.mot_de_passe ? String(req.body.mot_de_passe) : '';

        if (id === req.admin.id && (!actif || role !== 'admin')) {
            return res.status(400).json({ message: 'Vous ne pouvez ni désactiver votre propre compte, ni lui retirer le rôle administrateur.' });
        }
        if (motDePasse && motDePasse.length < MOT_DE_PASSE_MIN) {
            return res.status(400).json({ message: `Le mot de passe doit comporter au moins ${MOT_DE_PASSE_MIN} caractères.` });
        }
        // Il doit toujours rester un administrateur actif capable de gérer les comptes.
        if (avant.role === 'admin' && avant.actif && (!actif || role !== 'admin')) {
            const [autres] = await db.query("SELECT COUNT(*) AS n FROM administrateurs WHERE role = 'admin' AND actif = 1 AND id <> ?", [id]);
            if (autres[0].n === 0) return res.status(400).json({ message: 'Il doit rester au moins un administrateur actif.' });
        }

        const champs = ['nom = ?', 'role = ?', 'actif = ?'];
        const valeurs = [nom, role, actif ? 1 : 0];
        if (motDePasse) { champs.push('mot_de_passe = ?'); valeurs.push(await bcrypt.hash(motDePasse, 12)); }
        await db.query(`UPDATE administrateurs SET ${champs.join(', ')} WHERE id = ?`, [...valeurs, id]);
        comptes.invalider(id);

        await journaliser(db, req, {
            action: 'modification', entite: 'administrateur', entiteId: id,
            avant: { login: avant.login, nom: avant.nom, role: avant.role, actif: Boolean(avant.actif) },
            apres: { login: avant.login, nom, role, actif, ...(motDePasse ? { motDePasse: 'modifié' } : {}) }
        });
        res.json({ success: true, message: `Compte « ${avant.login} » mis à jour.` });
    } catch (error) {
        logger.error('Modification de compte : ' + error);
        res.status(500).json({ message: 'Erreur lors de la mise à jour du compte.' });
    }
};
