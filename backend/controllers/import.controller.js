const xlsx = require('xlsx');
const fs = require('fs');
const db = require('../config/db');
const logger = require('../utils/logger');
const { parseBoundedYear, normalizeString, VALID_PERIODES } = require('../utils/validation');

exports.importExcel = async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Aucun fichier reçu.' });

    const anneeSelectionnee = parseBoundedYear(req.body.annee);
    if (anneeSelectionnee === null) {
        return res.status(400).json({ message: 'Année invalide (doit être entre 2000 et 2100).' });
    }

    const semestreChoisi = normalizeString(req.body.semestre).toUpperCase();
    const typeSpecialite = normalizeString(req.body.typeSpecialite);

    if (!VALID_PERIODES.includes(semestreChoisi)) {
        return res.status(400).json({ message: 'Période invalide.' });
    }
    if (!typeSpecialite) {
        return res.status(400).json({ message: 'typeSpecialite est obligatoire.' });
    }

    let connection;
    try {
        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const lignesExcel = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

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

                if (typeSpecialite === 'standard') {
                    cin = ligne['CIN'] ? String(ligne['CIN']).trim() : null;
                    nomPrenom = ligne['NOM ET PPRENOM'] || ligne['NOM ET PRENOM'] || ligne['NOM'] || 'Non renseigné';
                    specialite = ligne['SP.'] || ligne['SP'] || ligne['SPECIALITE'] || 'Non renseignée';

                    const facStr = (ligne["FAC D'ORIGINE"] || ligne['FACULTE'] || '').toUpperCase();
                    if (facStr.includes('SFAX')) faculteOrigine = 'FMSfax';
                    else if (facStr.includes('SOUSSE')) faculteOrigine = 'FMSousse';
                    else if (facStr.includes('MONASTIR')) faculteOrigine = 'FMMonastir';
                    else if (facStr.includes('TUNIS')) faculteOrigine = 'FMTunis';
                    else faculteOrigine = 'Autre';

                    hopital1 = ligne['HOPITAL'];
                    service1 = ligne['SERVICE'];
                    hopital2 = null;
                    service2 = null;
                    niveauExcel = parseInt(String(ligne['ANNEE']).replace(/[^0-9]/g, ''), 10) || 1;
                } else {
                    cin = ligne['CIN'] ? String(ligne['CIN']).trim() : null;
                    nomPrenom = ligne['NOM ET PRÉNOM'] || ligne['NOM ET PRENOM'] || 'Non renseigné';
                    specialite = ligne['SPÉCIALITÉ'] || ligne['SPECIALITE'] || 'Médecine de famille';

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
                }

                if (!cin || cin === 'undefined' || cin === 'null') continue;
                cin = String(cin).toUpperCase();
                cinsSet.add(cin);
                validData.push({ cin, nomPrenom, specialite, faculteOrigine, hopital1, service1, hopital2, service2, niveauExcel });
            }

            let newCinsList = [];
            let insertedFicheIds = [];

            if (validData.length > 0) {
                const cinsArray = Array.from(cinsSet);
                const [existingResidentsRows] = await connection.query('SELECT id, cin, niveau FROM residents WHERE cin IN (?) FOR UPDATE', [cinsArray]);
                const existingMap = new Map();
                for (const resident of existingResidentsRows) {
                    existingMap.set(String(resident.cin).toUpperCase(), resident);
                }

                const newResidents = [];
                for (const data of validData) {
                    if (!existingMap.has(data.cin) && !newResidents.find((resident) => resident[0] === data.cin)) {
                        const promotion = anneeSelectionnee - (data.niveauExcel || 1) + 1;
                        newResidents.push([
                            data.cin,
                            data.nomPrenom || 'Non renseigné',
                            data.specialite || 'Non renseignée',
                            data.faculteOrigine || 'Inconnue',
                            promotion,
                            data.niveauExcel || 1
                        ]);
                    }
                }

                if (newResidents.length > 0) {
                    await connection.query('INSERT IGNORE INTO residents (cin, nom_prenom, specialite, faculte_origine, promotion, niveau) VALUES ?', [newResidents]);
                    residentsCrees += newResidents.length;

                    const newCins = newResidents.map((resident) => resident[0]);
                    newCinsList.push(...newCins);
                    const [insertedRows] = await connection.query('SELECT id, cin FROM residents WHERE cin IN (?)', [newCins]);
                    for (const resident of insertedRows) {
                        existingMap.set(String(resident.cin).toUpperCase(), { id: resident.id });
                    }
                }

                const importId = 'import_' + Date.now();
                const newStages = [];
                for (const data of validData) {
                    const existingData = existingMap.get(data.cin);
                    if (!existingData) continue;
                    const residentId = existingData.id;

                    if (typeSpecialite === 'famille') {
                        const periodeA = semestreChoisi === 'S1' ? 'T1' : 'T3';
                        const periodeB = semestreChoisi === 'S1' ? 'T2' : 'T4';
                        newStages.push([residentId, periodeA, anneeSelectionnee, data.service1 || '', data.hopital1 || '', importId]);
                        newStages.push([residentId, periodeB, anneeSelectionnee, data.service2 || '', data.hopital2 || '', importId]);
                    } else {
                        newStages.push([residentId, semestreChoisi, anneeSelectionnee, data.service1 || '', data.hopital1 || '', importId]);
                    }
                }

                if (newStages.length > 0) {
                    await connection.query('INSERT IGNORE INTO formulaires_stage (resident_id, periode, annee, service, hopital, url_pdf) VALUES ?', [newStages]);
                    lignesInserees += newStages.length;

                    const [fichesRows] = await connection.query('SELECT id FROM formulaires_stage WHERE url_pdf = ?', [importId]);
                    insertedFicheIds = fichesRows.map((fiche) => fiche.id);
                    await connection.query('UPDATE formulaires_stage SET url_pdf = "" WHERE url_pdf = ?', [importId]);
                }
            }

            await connection.commit();
            connection.release();

            res.json({
                message: `Succès : ${residentsCrees} nouveaux résidents et ${lignesInserees} fiches générés.`,
                undoData: {
                    newResidentCins: newCinsList,
                    ficheIds: insertedFicheIds
                }
            });
        } catch (error) {
            if (connection) {
                await connection.rollback();
                connection.release();
            }
            throw error;
        }
    } catch (error) {
        logger.error("Erreur lors de l'import : " + error);
        res.status(500).json({ message: 'Erreur serveur : Vérifiez les entêtes de votre fichier Excel. ' + (error.message || '') });
    } finally {
        if (req.file && req.file.path && fs.existsSync(req.file.path)) {
            fs.unlink(req.file.path, () => { });
        }
    }
};

exports.undoImport = async (req, res) => {
    const { newResidentCins, ficheIds } = req.body;
    try {
        if (ficheIds && ficheIds.length > 0) {
            const chunkSize = 200;
            for (let i = 0; i < ficheIds.length; i += chunkSize) {
                const chunk = ficheIds.slice(i, i + chunkSize);
                await db.query('DELETE FROM formulaires_stage WHERE id IN (?)', [chunk]);
            }
        }
        if (newResidentCins && newResidentCins.length > 0) {
            const chunkSize = 200;
            for (let i = 0; i < newResidentCins.length; i += chunkSize) {
                const chunk = newResidentCins.slice(i, i + chunkSize);
                await db.query('DELETE FROM residents WHERE cin IN (?)', [chunk]);
            }
        }
        res.json({ message: 'Importation annulée et données supprimées avec succès.' });
    } catch (error) {
        logger.error("Erreur lors de l'annulation de l'import : " + error);
        res.status(500).json({ message: 'Erreur serveur lors de la suppression des données.' });
    }
};
