// Tableau de bord de l'administration : chiffres du semestre en cours et alertes.
// Chaque chiffre correspond à un filtre de la liste des résidents (services/filtres-residents.js).
const db = require('../config/db');
const logger = require('../utils/logger');
const { DUREE_MAX, semestreCourant } = require('../config/specialites');
const {
    NIVEAU_COURANT, ACTIF, paramsActif, fichesDuSemestre, dernierRegistre, conditionAbsents, construireFiltres
} = require('../services/filtres-residents');

async function compter(query) {
    const { where, params } = await construireFiltres(query);
    const [rows] = await db.query(`SELECT COUNT(*) AS n FROM residents r ${where}`, params);
    return rows[0].n;
}

exports.getStatistiques = async (req, res) => {
    try {
        const { semestre, annee } = semestreCourant();

        const [parNiveau] = await db.query(
            `SELECT ${NIVEAU_COURANT} AS niveau, COUNT(*) AS total FROM residents r WHERE ${ACTIF} GROUP BY niveau`,
            paramsActif()
        );
        const promotions = Array.from({ length: DUREE_MAX }, (_, i) => {
            const niveau = i + 1;
            const ligne = parNiveau.find((l) => Number(l.niveau) === niveau);
            return { niveau, promotion: annee - niveau + 1, total: ligne ? ligne.total : 0 };
        });
        const actifs = promotions.reduce((somme, p) => somme + p.total, 0);

        const f = fichesDuSemestre();
        const [fiches] = await db.query(
            `SELECT COUNT(*) AS n, COUNT(DISTINCT f.resident_id) AS residents FROM formulaires_stage f
             JOIN residents r ON r.id = f.resident_id WHERE ${f.sql} AND ${ACTIF}`,
            [...f.params, ...paramsActif()]
        );

        const registre = await dernierRegistre();
        let absents = 0;
        if (registre) {
            const condition = await conditionAbsents(registre);
            const [rows] = await db.query(`SELECT COUNT(*) AS n FROM residents r WHERE ${condition.sql}`, condition.params);
            absents = rows[0].n;
        }

        const [derniersImports] = await db.query(
            `SELECT id, filename, imported_at, admin_login, semestre, annee, residents_created, fiches_created, undone
             FROM historique_imports ORDER BY id DESC LIMIT 5`
        );

        res.json({
            semestre: { semestre, annee },
            promotions,
            actifs,
            fichesSemestre: fiches[0].n,
            residentsAvecFiche: fiches[0].residents,
            sansFicheSemestre: await compter({ alerte: 'sans-fiche-semestre' }),
            sansEmail: await compter({ email: 'sans', actifs: '1' }),
            sansStage: await compter({ alerte: 'sans-stage' }),
            ficheRecuperee: await compter({ alerte: 'fiche-recuperee', actifs: '1' }),
            aRelancer: await compter({ alerte: 'a-relancer' }),
            absentsRegistre: registre
                ? { total: absents, import: { id: registre.id, filename: registre.filename, semestre: registre.semestre, annee: registre.annee } }
                : null,
            derniersImports: derniersImports.map((i) => ({ ...i, undone: Boolean(i.undone) }))
        });
    } catch (error) {
        logger.error('Statistiques : ' + error.stack);
        res.status(500).json({ error: 'Erreur lors du calcul des statistiques' });
    }
};
