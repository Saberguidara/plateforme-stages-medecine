// Tableau de bord de l'administration : chiffres du semestre en cours et alertes.
// Chaque chiffre correspond à un filtre de la liste des résidents (services/filtres-residents.js).
const db = require('../config/db');
const logger = require('../utils/logger');
const { DUREE_MAX, semestreCourant } = require('../config/specialites');
const {
    NIVEAU_COURANT, ACTIF, paramsActif, fichesDuSemestre, dernierRegistre, conditionAbsents, construireFiltres
} = require('../services/filtres-residents');
const { memoriser } = require('../services/statistiques/cache');
const { lireSemestre } = require('../services/statistiques/semestres');
const { calculerSynthese } = require('../services/statistiques/synthese');

async function compter(query) {
    const { where, params } = await construireFiltres(query);
    const [rows] = await db.query(`SELECT COUNT(*) AS n FROM residents r ${where}`, params);
    return rows[0].n;
}

async function calculerStatistiques() {
    const { semestre, annee } = semestreCourant();
    const f = fichesDuSemestre();

    const absentsDuRegistre = async () => {
        const registre = await dernierRegistre();
        if (!registre) return null;
        const condition = await conditionAbsents(registre);
        const [rows] = await db.query(`SELECT COUNT(*) AS n FROM residents r WHERE ${condition.sql}`, condition.params);
        return { total: rows[0].n, import: { id: registre.id, filename: registre.filename, semestre: registre.semestre, annee: registre.annee } };
    };

    // Requêtes indépendantes : lancées ensemble plutôt qu'une par une
    const [
        [parNiveau], [fiches], absentsRegistre, [derniersImports],
        sansFicheSemestre, sansEmail, sansStage, ficheRecuperee, aRelancer
    ] = await Promise.all([
        db.query(
            `SELECT ${NIVEAU_COURANT} AS niveau, COUNT(*) AS total FROM residents r WHERE ${ACTIF} GROUP BY ${NIVEAU_COURANT}`,
            paramsActif()
        ),
        db.query(
            `SELECT COUNT(*) AS n, COUNT(DISTINCT f.resident_id) AS residents FROM formulaires_stage f
             JOIN residents r ON r.id = f.resident_id WHERE ${f.sql} AND ${ACTIF}`,
            [...f.params, ...paramsActif()]
        ),
        absentsDuRegistre(),
        db.query(
            `SELECT id, filename, imported_at, admin_login, semestre, annee, residents_created, fiches_created, undone
             FROM historique_imports ORDER BY id DESC LIMIT 5`
        ),
        compter({ alerte: 'sans-fiche-semestre' }),
        compter({ email: 'sans', actifs: '1' }),
        compter({ alerte: 'sans-stage' }),
        compter({ alerte: 'fiche-recuperee', actifs: '1' }),
        compter({ alerte: 'a-relancer' })
    ]);

    const promotions = Array.from({ length: DUREE_MAX }, (_, i) => {
        const niveau = i + 1;
        const ligne = parNiveau.find((l) => Number(l.niveau) === niveau);
        return { niveau, promotion: annee - niveau + 1, total: ligne ? ligne.total : 0 };
    });

    return {
        semestre: { semestre, annee },
        promotions,
        actifs: promotions.reduce((somme, p) => somme + p.total, 0),
        fichesSemestre: fiches[0].n,
        residentsAvecFiche: fiches[0].residents,
        sansFicheSemestre,
        sansEmail,
        sansStage,
        ficheRecuperee,
        aRelancer,
        absentsRegistre,
        derniersImports: derniersImports.map((i) => ({ ...i, undone: Boolean(i.undone) }))
    };
}

exports.getStatistiques = async (req, res) => {
    try {
        res.json(await memoriser('tableau-de-bord', calculerStatistiques));
    } catch (error) {
        logger.error('Statistiques : ' + error.stack);
        res.status(500).json({ error: 'Erreur lors du calcul des statistiques' });
    }
};

// Synthèse d'un semestre : ?semestre=S1|S2&annee=AAAA (le semestre en cours par défaut).
exports.getSynthese = async (req, res) => {
    const s = lireSemestre(req.query);
    if (!s.valid) return res.status(400).json({ error: s.message });
    try {
        const cle = `synthese:${s.semestre}:${s.annee}`;
        res.json(await memoriser(cle, () => calculerSynthese({ semestre: s.semestre, annee: s.annee })));
    } catch (error) {
        logger.error('Synthèse des statistiques : ' + error.stack);
        res.status(500).json({ error: 'Erreur lors du calcul de la synthèse' });
    }
};
