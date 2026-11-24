// Module Statistiques : affectations (hôpitaux, services, périodes), parcours des résidents et exports.
// Consultation seulement : accessible aussi aux comptes en lecture seule.
const ExcelJS = require('exceljs');
const logger = require('../utils/logger');
const { memoriser } = require('../services/statistiques/cache');
const { lireFiltres, cle } = require('../services/statistiques/filtres');
const { calculerAffectations, detailCase, optionsFiltres, COLONNES } = require('../services/statistiques/affectations');
const { calculerParcours } = require('../services/statistiques/parcours');
const { calculerDiffusion, rappelsAEnvoyer } = require('../services/statistiques/diffusion');
const { calculerQualite } = require('../services/statistiques/qualite');
const { semestreCourant } = require('../config/specialites');
const { lireSemestre } = require('../services/statistiques/semestres');
const db = require('../config/db');
const { journaliser } = require('../utils/journal');
const { envoyerMail, gabarit, echapper } = require('../services/mail');

function erreurServeur(res, contexte, error) {
    logger.error(`${contexte} : ${error.stack || error}`);
    res.status(500).json({ error: `Erreur lors du calcul : ${contexte.toLowerCase()}` });
}

exports.getOptions = async (req, res) => {
    try {
        res.json(await memoriser('statistiques:options', optionsFiltres));
    } catch (error) {
        erreurServeur(res, 'Options des filtres', error);
    }
};

exports.getAffectations = async (req, res) => {
    const lecture = lireFiltres(req.query);
    if (!lecture.valid) return res.status(400).json({ error: lecture.message });
    try {
        res.json(await memoriser(`affectations:${cle(lecture.filtres)}`, () => calculerAffectations(lecture.filtres)));
    } catch (error) {
        erreurServeur(res, 'Affectations', error);
    }
};

// Une case de la carte : ?hopital=…&colonne=T3 (+ filtres communs)
exports.getDetailAffectation = async (req, res) => {
    const lecture = lireFiltres(req.query);
    if (!lecture.valid) return res.status(400).json({ error: lecture.message });
    const hopital = String(req.query.hopital || '').trim();
    const colonne = String(req.query.colonne || '');
    if (!hopital || !COLONNES[colonne]) return res.status(400).json({ error: 'Hôpital et période (T1…T4, S1, S2, R1, R2) requis.' });
    try {
        res.json(await detailCase(lecture.filtres, hopital, colonne));
    } catch (error) {
        erreurServeur(res, 'Détail des affectations', error);
    }
};

exports.getParcours = async (req, res) => {
    const promotion = req.query.promotion ? String(req.query.promotion) : '';
    if (promotion && !/^\d{4}$/.test(promotion)) return res.status(400).json({ error: 'Promotion invalide (4 chiffres).' });
    const options = {
        promotion: promotion ? parseInt(promotion, 10) : null,
        faculte: String(req.query.faculte || '').trim().slice(0, 150),
        etat: req.query.etat === 'incomplets' ? 'incomplets' : '',
        search: String(req.query.search || '').trim().slice(0, 100)
    };
    try {
        res.json(await calculerParcours(options));
    } catch (error) {
        erreurServeur(res, 'Parcours', error);
    }
};

function libelleFiltres(f) {
    return [
        `Année ${f.annee}`, f.semestre || 'année entière',
        f.promotion ? `promotion ${f.promotion}` : 'toutes promotions',
        f.faculte || 'toutes facultés', f.hopital || 'tous hôpitaux'
    ].join(' · ');
}

// Les tableaux de l'onglet Affectations dans un classeur Excel, une feuille par tableau.
exports.exporterAffectations = async (req, res) => {
    const lecture = lireFiltres(req.query);
    if (!lecture.valid) return res.status(400).json({ error: lecture.message });
    try {
        const a = await calculerAffectations(lecture.filtres);
        const classeur = new ExcelJS.Workbook();
        classeur.creator = 'Plateforme des stages - FMSfax';

        const feuille = (nom, colonnes, lignes) => {
            const f = classeur.addWorksheet(nom, { views: [{ state: 'frozen', ySplit: 2 }] });
            f.addRow([libelleFiltres(lecture.filtres)]).font = { italic: true };
            f.addRow(colonnes.map((c) => c.titre)).font = { bold: true };
            colonnes.forEach((c, i) => { f.getColumn(i + 1).width = c.largeur; });
            for (const l of lignes) f.addRow(colonnes.map((c) => l[c.cle]));
        };

        feuille('Par hôpital', [
            { titre: 'Hôpital', cle: 'hopital', largeur: 44 }, { titre: 'Fiches', cle: 'fiches', largeur: 10 },
            { titre: 'Résidents', cle: 'residents', largeur: 11 }, { titre: 'Trimestres', cle: 'trimestres', largeur: 11 },
            { titre: 'Semestres', cle: 'semestres', largeur: 11 }, { titre: 'Rattrapages', cle: 'rattrapages', largeur: 12 }
        ], a.parHopital);
        feuille('Par service', [
            { titre: 'Service', cle: 'service', largeur: 50 }, { titre: 'Fiches', cle: 'fiches', largeur: 10 },
            { titre: 'Hôpitaux', cle: 'hopitaux', largeur: 10 }
        ], a.parService);
        feuille('Carte', [
            { titre: 'Hôpital', cle: 'hopital', largeur: 44 },
            ...a.carte.colonnes.map((col) => ({ titre: `${col} (résidents)`, cle: col, largeur: 14 }))
        ], a.carte.lignes.map((l) => ({ hopital: l.hopital, ...l.valeurs })));
        feuille('Évolution', [
            { titre: 'Semestre', cle: 'libelle', largeur: 12 }, { titre: 'Fiches', cle: 'fiches', largeur: 10 },
            { titre: 'Résidents', cle: 'residents', largeur: 11 }
        ], a.evolution);

        const nom = `statistiques-affectations-${lecture.filtres.annee}${lecture.filtres.semestre ? '-' + lecture.filtres.semestre : ''}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${nom}"`);
        await classeur.xlsx.write(res);
        res.end();
    } catch (error) {
        erreurServeur(res, 'Export des affectations', error);
    }
};

// Diffusion d'un semestre : ?semestre=S1|S2&annee=AAAA (le semestre en cours par défaut)
exports.getDiffusion = async (req, res) => {
    const s = lireSemestre(req.query);
    if (!s.valid) return res.status(400).json({ error: s.message });
    try {
        res.json(await memoriser(`diffusion:${s.semestre}:${s.annee}`, () => calculerDiffusion({ semestre: s.semestre, annee: s.annee })));
    } catch (error) {
        erreurServeur(res, 'Diffusion des fiches', error);
    }
};

exports.getQualite = async (req, res) => {
    try {
        res.json(await memoriser('qualite', () => calculerQualite()));
    } catch (error) {
        erreurServeur(res, 'Qualité des données', error);
    }
};

function messageRappel(resident) {
    const lignes = resident.fiches.map((f) =>
        `<strong>${echapper(f.periode)} ${f.annee}</strong> : ${echapper(f.hopital || 'hôpital non renseigné')}, ${echapper(f.service || 'service non renseigné')}`);
    return {
        to: resident.email,
        subject: resident.fiches.length > 1 ? 'Rappel : vos fiches de stage vous attendent' : 'Rappel : votre fiche de stage vous attend',
        html: gabarit({
            titre: `Bonjour ${echapper(resident.nom_prenom)},`,
            paragraphes: [
                resident.fiches.length > 1
                    ? "Vos fiches de validation de stage sont disponibles sur la plateforme, mais vous ne les avez pas encore téléchargées :"
                    : "Votre fiche de validation de stage est disponible sur la plateforme, mais vous ne l'avez pas encore téléchargée :",
                lignes.join('<br>'),
                'Connectez-vous avec votre CIN et votre e-mail pour la récupérer. Si une information est fausse, signalez-la depuis votre espace.'
            ]
        })
    };
}

// Rappel aux résidents du semestre en cours qui n'ont pas téléchargé une fiche annoncée depuis une semaine.
exports.envoyerRappels = async (req, res) => {
    try {
        const { rappelsDisponibles, avecEmail } = await rappelsAEnvoyer();
        if (!rappelsDisponibles) {
            return res.status(503).json({ message: 'Les rappels ne sont pas encore activés sur la base (migration 009).' });
        }
        if (avecEmail.length === 0) return res.json({ success: true, envoyes: 0, fiches: 0, echecs: 0, message: 'Aucun rappel à envoyer.' });

        let envoyes = 0;
        let fiches = 0;
        let echecs = 0;
        for (const resident of avecEmail) {
            try {
                await envoyerMail(messageRappel(resident));
                await db.query('INSERT INTO relances_fiches (fiche_id, resident_id) VALUES ?', [resident.fiches.map((f) => [f.id, resident.id])]);
                envoyes++;
                fiches += resident.fiches.length;
            } catch (err) {
                logger.error(`Rappel au résident ${resident.id} : ${err}`);
                echecs++;
            }
        }
        if (envoyes > 0) {
            const { semestre, annee } = semestreCourant();
            await journaliser(null, req, { action: 'notification', entite: 'relance', apres: { semestre, annee, residents: envoyes, fiches, echecs } });
        }
        res.json({
            success: echecs === 0, envoyes, fiches, echecs,
            message: echecs === 0
                ? `Rappel envoyé à ${envoyes} résident(s).`
                : `Rappel envoyé à ${envoyes} résident(s) ; ${echecs} envoi(s) en échec, à relancer plus tard.`
        });
    } catch (error) {
        logger.error('Envoi des rappels : ' + error.stack);
        res.status(500).json({ message: "Erreur lors de l'envoi des rappels." });
    }
};
