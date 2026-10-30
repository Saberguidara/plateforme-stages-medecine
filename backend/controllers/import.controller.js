const ExcelJS = require('exceljs');
const fs = require('fs');
const db = require('../config/db');
const logger = require('../utils/logger');
const { parseBoundedYear, normalizeString, validateEmail } = require('../utils/validation');
const { SPECIALITES } = require('../config/specialites');

// Format Excel de la médecine de famille : deux stages par semestre (un par trimestre).
const SPECIALITE_IMPORT = SPECIALITES['medecine-famille'].libelle;

// Valeur lisible d'une cellule exceljs : texte riche, lien (mailto:…), formule ou date.
function valeurCellule(valeur) {
    if (valeur === null || valeur === undefined) return undefined;
    if (valeur instanceof Date) return valeur.getFullYear();
    if (typeof valeur !== 'object') return valeur;
    if (valeur.richText) return valeur.richText.map((morceau) => morceau.text).join('');
    if (valeur.text !== undefined) return typeof valeur.text === 'object' ? valeurCellule(valeur.text) : valeur.text;
    if (valeur.result !== undefined) return valeurCellule(valeur.result);
    return undefined;
}

// Première feuille du classeur sous forme d'objets { ENTÊTE: valeur }, comme sheet_to_json.
async function lireLignesExcel(chemin) {
    const classeur = new ExcelJS.Workbook();
    await classeur.xlsx.readFile(chemin);
    const feuille = classeur.worksheets[0];
    if (!feuille) return [];

    const entetes = [];
    feuille.getRow(1).eachCell({ includeEmpty: true }, (cellule, colonne) => {
        entetes[colonne] = String(valeurCellule(cellule.value) ?? '').trim();
    });

    const lignes = [];
    feuille.eachRow((ligne, numero) => {
        if (numero === 1) return;
        const objet = {};
        ligne.eachCell((cellule, colonne) => {
            if (entetes[colonne]) objet[entetes[colonne]] = valeurCellule(cellule.value);
        });
        if (Object.keys(objet).length > 0) lignes.push(objet);
    });
    return lignes;
}

function texteCellule(valeur) {
    return valeur === undefined || valeur === null ? '' : String(valeur).trim();
}

// Une ligne Excel donne soit un stage semestriel (urgences, 1re / 2e ligne : Hôpital 2 et
// Service 2 vides), soit deux stages trimestriels (T1+T2 pour S1, T3+T4 pour S2).
function stagesDeLigne(data, semestre) {
    const stage1 = { service: texteCellule(data.service1), hopital: texteCellule(data.hopital1) };
    const stage2 = { service: texteCellule(data.service2), hopital: texteCellule(data.hopital2) };

    if (!stage2.service && !stage2.hopital) {
        return [{ periode: semestre, ...stage1 }];
    }
    return [
        { periode: semestre === 'S1' ? 'T1' : 'T3', ...stage1 },
        { periode: semestre === 'S1' ? 'T2' : 'T4', ...stage2 }
    ];
}

exports.importExcel = async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Aucun fichier reçu.' });

    const anneeSelectionnee = parseBoundedYear(req.body.annee);
    if (anneeSelectionnee === null) {
        return res.status(400).json({ message: 'Année invalide (doit être entre 2000 et 2100).' });
    }

    const semestreChoisi = normalizeString(req.body.semestre).toUpperCase();
    const typeSpecialite = normalizeString(req.body.typeSpecialite);

    if (!['S1', 'S2'].includes(semestreChoisi)) {
        return res.status(400).json({ message: 'Semestre invalide (S1 ou S2).' });
    }
    if (typeSpecialite !== 'famille') {
        return res.status(400).json({ message: 'Seul le format Médecine de famille est pris en charge.' });
    }

    let connection;
    try {
        const lignesExcel = await lireLignesExcel(req.file.path);

        let lignesInserees = 0;
        let residentsCrees = 0;

        connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            const validData = [];
            const cinsSet = new Set();

            for (const rawLigne of lignesExcel) {
                const ligne = {};
                for (const key in rawLigne) {
                    ligne[key.trim().toUpperCase()] = rawLigne[key];
                }

                let cin;
                let nomPrenom;
                let specialite;
                let faculteOrigine;
                let hopital1;
                let service1;
                let hopital2;
                let service2;
                let niveauExcel;

                cin = ligne['CIN'] ? String(ligne['CIN']).trim() : null;
                nomPrenom = ligne['NOM ET PRÉNOM'] || ligne['NOM ET PRENOM'] || 'Non renseigné';
                specialite = SPECIALITE_IMPORT;

                const facStr = (ligne["FACULTÉ D'ORIGINE"] || ligne["FACULTE D'ORIGINE"] || '').toUpperCase();
                if (facStr.includes('SFAX')) faculteOrigine = 'FMSfax';
                else if (facStr.includes('SOUSSE')) faculteOrigine = 'FMSousse';
                else if (facStr.includes('MONASTIR')) faculteOrigine = 'FMMonastir';
                else if (facStr.includes('TUNIS')) faculteOrigine = 'FMTunis';
                else faculteOrigine = 'Autre';

                hopital1 = ligne['HOPITAL 1'] || ligne['HÔPITAL 1'];
                service1 = ligne['SERVICE 1'];
                hopital2 = ligne['HOPITAL 2'] || ligne['HÔPITAL 2'];
                service2 = ligne['SERVICE 2'];
                niveauExcel = parseInt(String(ligne['ANNÉE'] || ligne['ANNEE']).replace(/[^0-9]/g, ''), 10) || 1;
                const emailBrut = normalizeString(ligne['EMAIL'] || ligne['E-MAIL'] || ligne['MAIL'] || ligne['ADRESSE MAIL'] || ligne['ADRESSE E-MAIL']).toLowerCase();
                const email = validateEmail(emailBrut).valid ? emailBrut : null;

                if (!cin || cin === 'undefined' || cin === 'null') continue;
                cin = String(cin).toUpperCase();
                cinsSet.add(cin);
                validData.push({ cin, nomPrenom, email, specialite, faculteOrigine, hopital1, service1, hopital2, service2, niveauExcel });
            }

            let importId = null;
            let fichesIgnorees = 0;

            if (validData.length > 0) {
                // L'import est enregistré d'abord : son identifiant marque les fiches et les résidents créés.
                const [historique] = await connection.query(
                    'INSERT INTO historique_imports (filename, undo_data) VALUES (?, ?)',
                    [req.file.originalname || 'import.xlsx', '{}']
                );
                importId = historique.insertId;

                const cinsArray = Array.from(cinsSet);
                const [existingResidentsRows] = await connection.query('SELECT id, cin, email FROM residents WHERE cin IN (?) FOR UPDATE', [cinsArray]);
                const existingMap = new Map();
                for (const resident of existingResidentsRows) {
                    existingMap.set(String(resident.cin).toUpperCase(), resident);
                }

                const newResidents = new Map();
                for (const data of validData) {
                    if (existingMap.has(data.cin) || newResidents.has(data.cin)) continue;
                    const promotion = anneeSelectionnee - (data.niveauExcel || 1) + 1;
                    newResidents.set(data.cin, [
                        data.cin,
                        data.nomPrenom || 'Non renseigné',
                        data.email,
                        data.specialite,
                        data.faculteOrigine || 'Inconnue',
                        promotion,
                        data.niveauExcel || 1
                    ]);
                }

                let residentIdsCrees = [];
                if (newResidents.size > 0) {
                    await connection.query(
                        'INSERT INTO residents (cin, nom_prenom, email, specialite, faculte_origine, promotion, niveau) VALUES ?',
                        [Array.from(newResidents.values())]
                    );
                    const [insertedRows] = await connection.query('SELECT id, cin FROM residents WHERE cin IN (?)', [Array.from(newResidents.keys())]);
                    for (const resident of insertedRows) {
                        existingMap.set(String(resident.cin).toUpperCase(), { id: resident.id, email: null, cree: true });
                    }
                    residentIdsCrees = insertedRows.map((resident) => resident.id);
                    residentsCrees = residentIdsCrees.length;
                }

                // Un résident déjà inscrit sans e-mail reçoit celui du fichier ; un e-mail existant n'est jamais écrasé.
                for (const data of validData) {
                    const resident = existingMap.get(data.cin);
                    if (resident && !resident.cree && !resident.email && data.email) {
                        await connection.query('UPDATE residents SET email = ? WHERE id = ? AND email IS NULL', [data.email, resident.id]);
                        resident.email = data.email;
                    }
                }

                const newStages = [];
                for (const data of validData) {
                    const resident = existingMap.get(data.cin);
                    if (!resident) continue;
                    for (const stage of stagesDeLigne(data, semestreChoisi)) {
                        newStages.push([resident.id, stage.periode, anneeSelectionnee, stage.service, stage.hopital, importId]);
                    }
                }

                if (newStages.length > 0) {
                    // Une fiche déjà présente (même résident, période et année) est conservée telle quelle.
                    const [resultat] = await connection.query(
                        'INSERT IGNORE INTO formulaires_stage (resident_id, periode, annee, service, hopital, import_id) VALUES ?',
                        [newStages]
                    );
                    lignesInserees = resultat.affectedRows;
                    fichesIgnorees = newStages.length - resultat.affectedRows;
                }

                await connection.query(
                    'UPDATE historique_imports SET residents_created = ?, fiches_created = ?, undo_data = ? WHERE id = ?',
                    [residentsCrees, lignesInserees, JSON.stringify({ residentIds: residentIdsCrees }), importId]
                );
            }

            await connection.commit();
            connection.release();

            const doublons = fichesIgnorees > 0 ? ` ${fichesIgnorees} fiche(s) existaient déjà et n'ont pas été modifiées.` : '';
            res.json({
                message: `Succès : ${residentsCrees} nouveaux résidents et ${lignesInserees} fiches générés.${doublons}`,
                importId
            });
        } catch (error) {
            if (connection) {
                await connection.rollback();
                connection.release();
            }
            throw error;
        }
    } catch (error) {
        logger.error("Erreur lors de l'import : " + error.stack);
        res.status(500).json({ message: "Erreur lors de l'import : vérifiez les entêtes et le contenu de votre fichier Excel." });
    } finally {
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

        const [rows] = await connection.query('SELECT undo_data, undone FROM historique_imports WHERE id = ? FOR UPDATE', [importId]);
        if (rows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Import introuvable.' });
        }
        if (rows[0].undone) {
            await connection.rollback();
            return res.status(409).json({ message: 'Cet import a déjà été annulé.' });
        }

        const { residentIds = [] } = JSON.parse(rows[0].undo_data || '{}');
        const [fiches] = await connection.query('DELETE FROM formulaires_stage WHERE import_id = ?', [importId]);
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
        await connection.commit();

        res.json({ message: `Import annulé : ${fiches.affectedRows} fiches et ${residentsSupprimes} résidents supprimés.` });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => { });
        logger.error("Erreur lors de l'annulation de l'import : " + error.stack);
        res.status(500).json({ message: 'Erreur serveur lors de la suppression des données.' });
    } finally {
        if (connection) connection.release();
    }
};
exports.stagesDeLigne = stagesDeLigne;
exports.lireLignesExcel = lireLignesExcel;
