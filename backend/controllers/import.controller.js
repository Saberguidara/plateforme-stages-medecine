const fs = require('fs');
const db = require('../config/db');
const logger = require('../utils/logger');
const { normalizeString } = require('../utils/validation');
const { SPECIALITES } = require('../config/specialites');
const { lireClasseur } = require('../services/import/excel');
const { analyserClasseur } = require('../services/import/registres');
const { enregistrerAnalyse } = require('../services/import/enregistrer');
const { journaliser } = require('../utils/journal');

// Semestre le plus représenté dans le rapport (un classeur porte en pratique un seul semestre).
function semestreDuRapport(rapport) {
    const comptes = new Map();
    for (const f of rapport) {
        if (!f.semestre || !f.annee) continue;
        const cle = `${f.semestre}-${f.annee}`;
        comptes.set(cle, (comptes.get(cle) || 0) + (f.retenues || 1));
    }
    const [meilleur] = [...comptes.entries()].sort((a, b) => b[1] - a[1]);
    if (!meilleur) return { semestre: null, annee: null };
    const [semestre, annee] = meilleur[0].split('-');
    return { semestre, annee: parseInt(annee, 10) };
}

// Import d'un registre de choix (faculté ou national) ou d'une liste d'e-mails :
// le format, le semestre et l'année sont déduits du fichier lui-même.
exports.importExcel = async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Aucun fichier reçu.' });

    const codeSpecialite = normalizeString(req.body.specialite);
    const specialite = SPECIALITES[codeSpecialite];
    if (!specialite) {
        return res.status(400).json({ message: 'Spécialité non prise en charge par la plateforme.' });
    }

    let connection;
    try {
        let analyse;
        try {
            analyse = analyserClasseur(await lireClasseur(req.file.path), req.file.originalname || '', codeSpecialite);
        } catch (error) {
            return res.status(400).json({ message: error.message });
        }

        const { residents, emails, rapport, bilan } = analyse;
        if (residents.length === 0 && emails.length === 0) {
            return res.status(400).json({
                message: "Aucune donnée reconnue dans ce fichier : ni registre de choix, ni liste d'e-mails.",
                rapport,
                bilan
            });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            // L'import est enregistré d'abord : son identifiant marque les fiches et les résidents créés.
            const { semestre, annee } = semestreDuRapport(rapport);
            const [historique] = await connection.query(
                'INSERT INTO historique_imports (filename, admin_login, semestre, annee, undo_data) VALUES (?, ?, ?, ?, ?)',
                [req.file.originalname || 'import.xlsx', req.admin ? req.admin.login : null, semestre, annee, '{}']
            );
            const importId = historique.insertId;

            const enregistrement = await enregistrerAnalyse(connection, analyse, { specialite, importId });
            const { residentIdsCrees, residentIdsVus, niveaux, corrections, conflits } = enregistrement;
            const { fichesCreees, fichesCorrigees, emailsAjoutes } = enregistrement.resume;

            // Résidents présents dans le registre et années couvertes : servent à repérer les absents.
            // Les corrections gardent l'ancienne valeur pour pouvoir annuler l'import.
            await connection.query(
                'UPDATE historique_imports SET residents_created = ?, fiches_created = ?, residents_vus = ?, undo_data = ? WHERE id = ?',
                [residentIdsCrees.length, fichesCreees, residentIdsVus.length,
                    JSON.stringify({ residentIds: residentIdsCrees, residentIdsVus, niveaux, corrections }), importId]
            );
            await journaliser(connection, req, {
                action: 'import', entite: 'import', entiteId: importId,
                apres: {
                    fichier: req.file.originalname || 'import.xlsx', semestre, annee,
                    residentsCrees: residentIdsCrees.length, fichesCreees, fichesCorrigees, emailsAjoutes
                }
            });
            await connection.commit();

            const resume = { ...enregistrement.resume, ...bilan };
            res.json({
                message: `Import terminé : ${resume.residentsCrees} nouveaux résidents, ${fichesCreees} fiches créées, ${fichesCorrigees} corrigées, ${emailsAjoutes} e-mails enregistrés.`,
                importId,
                rapport,
                bilan: resume,
                conflits
            });
        } catch (error) {
            await connection.rollback();
            throw error;
        }
    } catch (error) {
        logger.error("Erreur lors de l'import : " + error.stack);
        res.status(500).json({ message: "Erreur lors de l'import : le fichier n'a pas pu être enregistré." });
    } finally {
        if (connection) connection.release();
        if (req.file && req.file.path && fs.existsSync(req.file.path)) {
            fs.unlink(req.file.path, () => { });
        }
    }
};

// Annule un import à partir de son historique côté serveur : supprime ses fiches,
// puis les résidents qu'il a créés et qui n'ont pas reçu d'autres fiches depuis.
exports.undoImport = async (req, res) => {
    const importId = parseInt(String(req.body.importId), 10);
    if (Number.isNaN(importId) || importId <= 0) {
        return res.status(400).json({ message: "Identifiant d'import invalide." });
    }

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const [rows] = await connection.query('SELECT filename, undo_data, undone FROM historique_imports WHERE id = ? FOR UPDATE', [importId]);
        if (rows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Import introuvable.' });
        }
        if (rows[0].undone) {
            await connection.rollback();
            return res.status(409).json({ message: 'Cet import a déjà été annulé.' });
        }

        // Une fiche modifiée depuis l'import (correction manuelle, fusion d'hôpitaux…) ne doit pas être perdue.
        const [modifiees] = await connection.query(
            'SELECT COUNT(*) AS n FROM formulaires_stage WHERE import_id = ? AND modifie_le IS NOT NULL',
            [importId]
        );
        if (modifiees[0].n > 0) {
            await connection.rollback();
            return res.status(409).json({
                message: `Annulation impossible : ${modifiees[0].n} fiche(s) de cet import ont été modifiées depuis.`,
                fichesModifiees: modifiees[0].n
            });
        }

        const { residentIds = [], corrections = [] } = JSON.parse(rows[0].undo_data || '{}');
        const [fiches] = await connection.query('DELETE FROM formulaires_stage WHERE import_id = ?', [importId]);
        // Fiches corrigées par l'import : ancienne valeur rétablie, sauf si la fiche a été retouchée depuis.
        let fichesRetablies = 0;
        for (const c of corrections) {
            const [retour] = await connection.query(
                'UPDATE formulaires_stage SET service = ?, hopital = ?, modifie_le = modifie_le WHERE id = ? AND modifie_le IS NULL',
                [c.service, c.hopital, c.id]
            );
            fichesRetablies += retour.affectedRows;
        }
        let residentsSupprimes = 0;
        if (residentIds.length > 0) {
            const [resultat] = await connection.query(
                `DELETE FROM residents WHERE id IN (?)
                 AND NOT EXISTS (SELECT 1 FROM formulaires_stage f WHERE f.resident_id = residents.id)`,
                [residentIds]
            );
            residentsSupprimes = resultat.affectedRows;
        }
        await connection.query('UPDATE historique_imports SET undone = 1 WHERE id = ?', [importId]);
        await journaliser(connection, req, {
            action: 'annulation', entite: 'import', entiteId: importId,
            avant: { fichier: rows[0].filename, fichesSupprimees: fiches.affectedRows, fichesRetablies, residentsSupprimes }
        });
        await connection.commit();

        res.json({ message: `Import annulé : ${fiches.affectedRows} fiches et ${residentsSupprimes} résidents supprimés${fichesRetablies ? `, ${fichesRetablies} fiches rétablies` : ''}.` });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => { });
        logger.error("Erreur lors de l'annulation de l'import : " + error.stack);
        res.status(500).json({ message: 'Erreur serveur lors de la suppression des données.' });
    } finally {
        if (connection) connection.release();
    }
};

// Historique des imports, du plus récent au plus ancien, avec ce qui empêche l'annulation.
exports.listerImports = async (req, res) => {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    try {
        const [rows] = await db.query(
            `SELECT h.id, h.filename, h.imported_at, h.admin_login, h.semestre, h.annee,
                    h.residents_created, h.fiches_created, h.residents_vus, h.undone,
                    (SELECT COUNT(*) FROM formulaires_stage f WHERE f.import_id = h.id) AS fiches_restantes,
                    (SELECT COUNT(*) FROM formulaires_stage f WHERE f.import_id = h.id AND f.modifie_le IS NOT NULL) AS fiches_modifiees
             FROM historique_imports h
             ORDER BY h.id DESC
             LIMIT ?`,
            [limit]
        );
        res.json(rows.map((r) => ({ ...r, undone: Boolean(r.undone), annulable: !r.undone && r.fiches_modifiees === 0 })));
    } catch (error) {
        logger.error('Historique des imports : ' + error);
        res.status(500).json({ message: "Erreur lors du chargement de l'historique." });
    }
};
