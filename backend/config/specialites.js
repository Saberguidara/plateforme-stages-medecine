// Spécialités gérées par la plateforme. Pour en ouvrir une nouvelle :
// 1. déposer son modèle Word dans templates/<modele>/modele.docx
// 2. lancer `node scripts/build-fiche-template.js <modele>` (Windows + Word)
// 3. ajouter une entrée ci-dessous.
const DATES_PERIODES = {
    T1: ['01/01', '31/03'],
    T2: ['01/04', '30/06'],
    T3: ['01/07', '30/09'],
    T4: ['01/10', '31/12'],
    S1: ['01/01', '30/06'],
    S2: ['01/07', '31/12'],
    // Stages de 45 jours (ORL et dermatologie à Tunis, à partir de la promotion 2026) :
    // le trimestre est coupé en deux moitiés, une fiche par moitié.
    T1A: ['01/01', '15/02'],
    T1B: ['16/02', '31/03'],
    T2A: ['01/04', '15/05'],
    T2B: ['16/05', '30/06'],
    T3A: ['01/07', '15/08'],
    T3B: ['16/08', '30/09'],
    T4A: ['01/10', '15/11'],
    T4B: ['16/11', '31/12']
};

const SPECIALITES = {
    'medecine-famille': {
        libelle: 'Médecine de famille',
        // Valeurs acceptées dans la colonne « specialite » des résidents
        alias: ['MEDECINE DE FAMILLE', 'MÉDECINE DE FAMILLE', 'MED DE FAMILLE', 'MF'],
        modele: 'medecine-famille',
        // Semestres (S1, S2) : stages aux urgences et en 1re / 2e ligne.
        // Trimestres (T1 à T4) : les autres stages, deux par semestre.
        // Demi-trimestres (T1A à T4B) : stages de 45 jours.
        periodes: ['S1', 'S2', 'T1', 'T2', 'T3', 'T4', 'T1A', 'T1B', 'T2A', 'T2B', 'T3A', 'T3B', 'T4A', 'T4B', 'R1', 'R2'],
        // Durée du résidanat : 1re à 3e année
        duree: 3,
        // Rattrapages : R1 couvre le 1er semestre, R2 le 2nd
        datesPeriodes: { ...DATES_PERIODES, R1: DATES_PERIODES.S1, R2: DATES_PERIODES.S2 }
    }
};

const SPECIALITE_PAR_DEFAUT = 'medecine-famille';

// Ordre d'affichage des périodes dans une année de résidanat (rattrapages en dernier)
const ORDRE_PERIODES = ['T1A', 'T1B', 'T1', 'T2A', 'T2B', 'T2', 'S1', 'T3A', 'T3B', 'T3', 'T4A', 'T4B', 'T4', 'S2', 'R1', 'R2'];

// Même ordre, pour les clauses SQL « ORDER BY FIELD(f.periode, …) »
const ORDRE_PERIODES_SQL = ORDRE_PERIODES.map((p) => `'${p}'`).join(',');

// Périodes rattachées à chaque semestre civil
const PERIODES_DU_SEMESTRE = {
    S1: ['S1', 'T1', 'T2', 'T1A', 'T1B', 'T2A', 'T2B', 'R1'],
    S2: ['S2', 'T3', 'T4', 'T3A', 'T3B', 'T4A', 'T4B', 'R2']
};

function semestreCourant(date = new Date()) {
    return { semestre: date.getMonth() < 6 ? 'S1' : 'S2', annee: date.getFullYear() };
}

const LIBELLES_SPECIALITES = Object.values(SPECIALITES).map((s) => s.libelle);
const DUREE_MAX = Math.max(...Object.values(SPECIALITES).map((s) => s.duree));

function normaliser(valeur) {
    return String(valeur || '').trim().toUpperCase();
}

// Retrouve la configuration d'un résident à partir de sa colonne « specialite ».
function specialiteDe(libelleResident) {
    const cle = normaliser(libelleResident);
    for (const [code, conf] of Object.entries(SPECIALITES)) {
        if (normaliser(conf.libelle) === cle || conf.alias.includes(cle)) return { code, ...conf };
    }
    return null;
}

// Durée du résidanat d'un résident. En attendant la configuration des autres spécialités,
// celle de la médecine de famille s'applique à tous.
function dureeDe(libelleResident) {
    const specialite = specialiteDe(libelleResident);
    return (specialite && specialite.duree) || SPECIALITES[SPECIALITE_PAR_DEFAUT].duree;
}

// Année de résidanat affichable : au-delà de la durée du résidanat, le parcours est terminé.
function etatResidanat(libelleResident, niveau) {
    const n = parseInt(niveau, 10);
    const duree = dureeDe(libelleResident);
    if (!n || n < 1) return { niveau: null, parcours_termine: false, duree };
    if (n > duree) return { niveau: null, parcours_termine: true, duree };
    return { niveau: n, parcours_termine: false, duree };
}

function libellePeriode(specialite, periode, annee) {
    const dates = specialite.datesPeriodes[periode];
    if (!dates) return periode;
    return `Du ${dates[0]}/${annee} au ${dates[1]}/${annee}`;
}

module.exports = {
    SPECIALITES, SPECIALITE_PAR_DEFAUT, ORDRE_PERIODES, ORDRE_PERIODES_SQL, PERIODES_DU_SEMESTRE, LIBELLES_SPECIALITES, DUREE_MAX,
    specialiteDe, libellePeriode, semestreCourant, dureeDe, etatResidanat
};
