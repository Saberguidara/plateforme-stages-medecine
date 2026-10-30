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
    S2: ['01/07', '31/12']
};

const SPECIALITES = {
    'medecine-famille': {
        libelle: 'Médecine de famille',
        // Valeurs acceptées dans la colonne « specialite » des résidents
        alias: ['MEDECINE DE FAMILLE', 'MÉDECINE DE FAMILLE', 'MED DE FAMILLE', 'MF'],
        modele: 'medecine-famille',
        // Semestres (S1, S2) : stages aux urgences et en 1re / 2e ligne.
        // Trimestres (T1 à T4) : les autres stages, deux par semestre.
        periodes: ['S1', 'S2', 'T1', 'T2', 'T3', 'T4', 'R1', 'R2'],
        // Rattrapages : R1 couvre le 1er semestre, R2 le 2nd
        datesPeriodes: { ...DATES_PERIODES, R1: DATES_PERIODES.S1, R2: DATES_PERIODES.S2 }
    }
};

const SPECIALITE_PAR_DEFAUT = 'medecine-famille';

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

function libellePeriode(specialite, periode, annee) {
    const dates = specialite.datesPeriodes[periode];
    if (!dates) return periode;
    return `Du ${dates[0]}/${annee} au ${dates[1]}/${annee}`;
}

module.exports = { SPECIALITES, SPECIALITE_PAR_DEFAUT, specialiteDe, libellePeriode };
