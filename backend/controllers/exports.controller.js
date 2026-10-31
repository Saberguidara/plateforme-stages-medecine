// Exports de l'administration : liste filtrée des résidents (Excel) et fiches d'un semestre (ZIP de PDF).
const ExcelJS = require('exceljs');
const archiver = require('archiver');
const db = require('../config/db');
const logger = require('../utils/logger');
const { listerResidents } = require('./residents.controller');
const { preparerFiche } = require('./pdf.controller');
const { genererFiche } = require('../services/pdf.service');
const { PERIODES_DU_SEMESTRE, semestreCourant } = require('../config/specialites');
const { normalizeString, parseBoundedYear } = require('../utils/validation');

const MAX_FICHES_ZIP = 1500;

function horodatage() {
    return new Date().toISOString().slice(0, 10);
}

exports.exporterResidents = async (req, res) => {
    try {
        const { rows } = await listerResidents(req.query, { pagination: false });

        const classeur = new ExcelJS.Workbook();
        classeur.creator = 'Plateforme des stages - FMSfax';
        const feuille = classeur.addWorksheet('Résidents', { views: [{ state: 'frozen', ySplit: 1 }] });
        feuille.columns = [
            { header: 'CIN', key: 'cin', width: 14 },
            { header: 'Nom et prénom', key: 'nom_prenom', width: 34 },
            { header: 'E-mail', key: 'email', width: 32 },
            { header: 'Spécialité', key: 'specialite', width: 22 },
            { header: 'Faculté', key: 'faculte_origine', width: 14 },
            { header: 'Promotion', key: 'promotion', width: 11 },
            { header: 'Année de résidanat', key: 'niveau', width: 16 },
            { header: 'Fiches', key: 'nb_fiches', width: 9 },
            { header: 'Fiches du semestre', key: 'fiches_semestre', width: 12 },
            { header: 'Fiche récupérée', key: 'recuperee', width: 12 }
        ];
        feuille.getRow(1).font = { bold: true };
        for (const r of rows) {
            feuille.addRow({
                ...r,
                email: r.email || '',
                niveau: r.parcours_termine ? 'Parcours terminé' : (r.niveau > 0 ? `${r.niveau}A` : ''),
                recuperee: r.fiches_semestre > 0 ? (r.telechargements_semestre > 0 ? 'Oui' : 'Non') : ''
            });
        }
        feuille.autoFilter = { from: 'A1', to: 'J1' };

        const contenu = await classeur.xlsx.writeBuffer();
        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="residents-${horodatage()}.xlsx"`,
            'Content-Length': contenu.length
        });
        res.send(Buffer.from(contenu));
    } catch (error) {
        logger.error('Export Excel des résidents : ' + error.stack);
        res.status(500).json({ message: "Erreur lors de l'export Excel." });
    }
};

// Fiches d'un semestre, filtrables par promotion ou par hôpital.
function filtresFiches(query) {
    const courant = semestreCourant();
    const semestre = ['S1', 'S2'].includes(query.semestre) ? query.semestre : courant.semestre;
    const annee = parseBoundedYear(query.annee) || courant.annee;
    const conditions = ['f.periode IN (?)', 'f.annee = ?'];
    const params = [PERIODES_DU_SEMESTRE[semestre], annee];
    const promo = parseInt(query.promo, 10);
    if (promo) { conditions.push('r.promotion = ?'); params.push(promo); }
    const hopital = normalizeString(query.hopital);
    if (hopital) { conditions.push('f.hopital = ?'); params.push(hopital); }
    return { semestre, annee, where: conditions.join(' AND '), params };
}

exports.compterFiches = async (req, res) => {
    const { semestre, annee, where, params } = filtresFiches(req.query);
    try {
        const [rows] = await db.query(
            `SELECT COUNT(*) AS n FROM formulaires_stage f JOIN residents r ON r.id = f.resident_id WHERE ${where}`,
            params
        );
        res.json({ semestre, annee, total: rows[0].n, maximum: MAX_FICHES_ZIP });
    } catch (error) {
        logger.error('Comptage des fiches : ' + error);
        res.status(500).json({ message: 'Erreur lors du comptage des fiches.' });
    }
};

exports.exporterFichesZip = async (req, res) => {
    const { semestre, annee, where, params } = filtresFiches(req.query);
    let fiches;
    try {
        [fiches] = await db.query(
            `SELECT f.id, f.periode, f.annee, f.service, f.hopital,
                    r.cin, r.nom_prenom, r.specialite, r.niveau, r.promotion
             FROM formulaires_stage f JOIN residents r ON r.id = f.resident_id
             WHERE ${where}
             ORDER BY r.promotion DESC, r.nom_prenom ASC, FIELD(f.periode,'T1','T2','S1','T3','T4','S2','R1','R2')`,
            params
        );
    } catch (error) {
        logger.error('Export ZIP des fiches : ' + error);
        return res.status(500).json({ message: "Erreur lors de l'export des fiches." });
    }
    if (fiches.length === 0) return res.status(404).json({ message: 'Aucune fiche pour ces critères.' });
    if (fiches.length > MAX_FICHES_ZIP) {
        return res.status(413).json({ message: `Trop de fiches (${fiches.length}) : affinez par promotion ou par hôpital.` });
    }

    res.set({
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="fiches-${semestre}-${annee}.zip"`
    });
    // Les PDF sont déjà compressés : on les range sans les recompresser.
    const archive = archiver('zip', { store: true });
    archive.on('error', (err) => {
        logger.error('Archive ZIP : ' + err);
        res.destroy(err);
    });
    archive.pipe(res);

    let ignorees = 0;
    try {
        for (const fiche of fiches) {
            const preparation = preparerFiche(fiche, fiche);
            if (!preparation) { ignorees++; continue; }
            const niveau = preparation.donnees.niveau;
            const dossier = niveau ? `${niveau}A` : 'autres';
            const pdf = await genererFiche(preparation.modele, preparation.donnees);
            archive.append(Buffer.from(pdf), { name: `${dossier}/${preparation.nomFichier}` });
        }
        if (ignorees > 0) {
            archive.append(`${ignorees} fiche(s) sans modèle de spécialité n'ont pas été générées.\n`, { name: 'LISEZMOI.txt' });
        }
        await archive.finalize();
    } catch (error) {
        logger.error('Génération du ZIP : ' + error.stack);
        archive.abort();
        res.destroy(error);
    }
};
