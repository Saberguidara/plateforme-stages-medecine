const {
    analyserClasseur, stagesDeLigne, stagesNationaux, periodeDeFeuille, normaliserCin, faculteDe
} = require('../services/import/registres');

// Feuille au format renvoyé par lireClasseur (entêtes normalisés dans `valeurs`).
function feuille(nom, entetes, lignes) {
    const cle = (e) => e.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
    return {
        nom,
        entetes,
        lignes: lignes.map((valeurs, i) => ({
            numero: i + 2,
            valeurs: Object.fromEntries(entetes.map((e, j) => [cle(e), valeurs[j] ?? '']))
        }))
    };
}

const ENTETES_REGISTRE = ['N°', 'CLASS', 'IDENTIFIANT', 'NOM_PRENOM', 'NATIONALITE', 'FAC', 'MSP/MIL', 'SPECIALITE',
    'SERVICE 1', 'HOPITAL 1', 'SERVICE 2', 'HOPITAL 2', 'REMARQUES', 'ANNEE'];

describe('Registre faculté - découpage des stages', () => {
    it('crée une fiche semestrielle quand Hôpital 2 et Service 2 sont vides', () => {
        const ligne = { hopital1: 'HOP REG MAHRES', service1: 'URGENCES', hopital2: '', service2: undefined };

        expect(stagesDeLigne(ligne, 'S1')).toEqual([{ periode: 'S1', hopital: 'HOP REG MAHRES', service: 'URGENCES' }]);
        expect(stagesDeLigne(ligne, 'S2')[0].periode).toBe('S2');
    });

    it('traite des cellules ne contenant que des espaces comme vides', () => {
        expect(stagesDeLigne({ hopital1: 'H1', service1: 'S', hopital2: '  ', service2: ' ' }, 'S1')).toHaveLength(1);
    });

    it('crée T1 + T2 pour S1 et T3 + T4 pour S2 quand deux stages sont renseignés', () => {
        const ligne = { hopital1: 'H1', service1: 'A', hopital2: 'H2', service2: 'B' };

        expect(stagesDeLigne(ligne, 'S1').map((s) => s.periode)).toEqual(['T1', 'T2']);
        expect(stagesDeLigne(ligne, 'S2').map((s) => s.periode)).toEqual(['T3', 'T4']);
    });

    it("ne crée aucune fiche sans service (mutation, mobilité à l'étranger…)", () => {
        expect(stagesDeLigne({ hopital1: '', service1: '', hopital2: '', service2: '' }, 'S2')).toEqual([]);
    });
});

describe('Choix national - lots et rattrapages', () => {
    const cols = { service: 'SERVICE', hopital: 'HOPITAL', details: 'DETAILS', session: 'SESSION' };
    const ligne = (details, session = 'Normale') => ({
        SERVICE: 'Cardiologie', HOPITAL: 'Hôpital X', DETAILS: details, SESSION: session
    });

    it('stage sans lot (urgences) : une fiche semestrielle', () => {
        expect(stagesNationaux(ligne(''), cols, 'S2')).toEqual([{ periode: 'S2', service: 'Cardiologie', hopital: 'Hôpital X' }]);
    });

    it('lot de deux services : le premier en T3, le second en T4', () => {
        const details = 'Période 1 - Lot lot 44\nHôpital X - Cardiologie\nHôpital X - Psychiatrie';

        expect(stagesNationaux(ligne(details), cols, 'S2')).toEqual([
            { periode: 'T3', service: 'Cardiologie', hopital: 'Hôpital X' },
            { periode: 'T4', service: 'Psychiatrie', hopital: 'Hôpital X' }
        ]);
    });

    it('lot en deux périodes : les services d\'une même période sont réunis', () => {
        const details = 'Période 1 - Lot 133.1\nHôpital A - Dermatologie\nHôpital B - ORL\n\nPériode 2 - Lot 133.2\nHôpital C - Psychiatrie C';

        expect(stagesNationaux(ligne(details), cols, 'S2')).toEqual([
            { periode: 'T3', service: 'Dermatologie / ORL', hopital: 'Hôpital A / Hôpital B' },
            { periode: 'T4', service: 'Psychiatrie C', hopital: 'Hôpital C' }
        ]);
    });

    it('session de rattrapage : une seule fiche R1 ou R2', () => {
        const details = 'Période 1 - Lot 94\nHôpital X - Pneumologie\nHôpital X - Neurologie';

        expect(stagesNationaux(ligne(details, 'Rattrapage'), cols, 'S2')).toEqual([
            { periode: 'R2', service: 'Pneumologie / Neurologie', hopital: 'Hôpital X' }
        ]);
        expect(stagesNationaux(ligne('', 'Rattrapage'), cols, 'S1')[0].periode).toBe('R1');
    });
});

describe('Détection automatique', () => {
    it('lit le semestre dans les entêtes, puis le nom de la feuille, puis le nom du fichier', () => {
        expect(periodeDeFeuille({ nom: 'GLOBALE', entetes: ['SERVICE 1 : Du 01/01/2026 au 31/03/2026'] }, 'x.xlsx'))
            .toMatchObject({ annee: 2026, semestre: 'S1' });
        expect(periodeDeFeuille({ nom: 'Choix MF 01-07-2026 au 31-12-20', entetes: [] }, 'x.xlsx'))
            .toMatchObject({ annee: 2026, semestre: 'S2' });
        expect(periodeDeFeuille({ nom: '3A', entetes: [] }, 'CHOIX JANVIER 2027.xlsx')).toMatchObject({ annee: 2027, semestre: 'S1' });
        expect(periodeDeFeuille({ nom: 'Feuil1', entetes: [] }, 'Choix-stages MF juin 2026.xlsx')).toMatchObject({ annee: 2026, semestre: 'S2' });
        expect(periodeDeFeuille({ nom: 'Feuil1', entetes: [] }, 'liste.xlsx')).toBeNull();
    });

    it('rétablit le zéro initial d\'un CIN tunisien lu comme nombre', () => {
        expect(normaliserCin(7984449, 'TUNISIENNE')).toBe('07984449');
        expect(normaliserCin(4597031, 'PALESTINIENNE')).toBe('4597031');
        expect(normaliserCin('07984449')).toBe('07984449');
    });

    it('reconnaît les différentes écritures des facultés', () => {
        expect(['SFAX', 'FMSFAX', 'Sfax'].map(faculteDe)).toEqual(['FMSfax', 'FMSfax', 'FMSfax']);
        expect(['FMM', 'FMMONASTIR', 'TUNIS', 'FMSOUSSE'].map(faculteDe)).toEqual(['FMMonastir', 'FMMonastir', 'FMTunis', 'FMSousse']);
    });
});

describe('Analyse d\'un classeur', () => {
    it('registre faculté : garde les mobilités entrantes d\'autres facultés', () => {
        const f = feuille('LISTE GLOBALE', ENTETES_REGISTRE, [
            [1, 10, '11111111', 'RESIDENT SFAX', 'TUNISIENNE', 'FMSFAX', '', 'MED DE FAMILLE', 'URGENCES', 'HOP REG MAHRES', '', '', '', '2A'],
            [2, 11, '22222222', 'RESIDENT MOBILITE', 'TUNISIENNE', 'FMTUNIS', '', 'MED DE FAMILLE', 'CSB AMRA', 'DIR REG SFAX', '', '', 'MOBILITE TOTALE SFAX', '2A'],
            [3, 12, '33333333', 'RESIDENT FRANCE', 'TUNISIENNE', 'SFAX', '', 'MED DE FAMILLE', '', '', '', '', 'France', '3A']
        ]);
        const { residents, bilan, rapport } = analyserClasseur([f], 'CHOIX JUILLET 2026.xlsx', 'medecine-famille');

        expect(rapport[0]).toMatchObject({ format: 'registre faculté', annee: 2026, semestre: 'S2' });
        expect(residents.map((r) => r.cin)).toEqual(['11111111', '22222222', '33333333']);
        expect(residents[2].stages).toEqual([]);
        expect(bilan.sansStage).toBe(1);
        expect(residents[0]).toMatchObject({ niveau: 2, annee: 2026, faculte: 'FMSfax' });
    });

    it('choix national : ne garde que les résidents de la faculté de Sfax et dédoublonne les feuilles', () => {
        const lignes = [
            [1, 5, '44444444', 'RESIDENT SFAX', 'TUNISIENNE', 'FMSFAX', '', 'MED DE FAMILLE', 'Psychiatrie', 'Hôpital A', 'Cardiologie', 'Hôpital A', '', '1A'],
            [2, 6, '55555555', 'RESIDENT SOUSSE', 'TUNISIENNE', 'FMSOUSSE', '', 'MED DE FAMILLE', 'Urgences', 'Hôpital B', '', '', '', '1A'],
            [3, 7, '66666666', 'RESIDENT TUNIS', 'TUNISIENNE', 'FMTUNIS', '', 'MED DE FAMILLE', 'Urgences', 'Hôpital C', '', '', '', '1A']
        ];
        const entetes = ENTETES_REGISTRE.map((e) => (e === 'SERVICE 1' ? 'SERVICE 1 : Du 01/01/2026 au 31/03/2026' : e));
        const globale = feuille('GLOBALE', entetes, lignes);
        const sfax = feuille('FMSf - SFAX', entetes, [lignes[0]]);
        const { residents, bilan } = analyserClasseur([globale, sfax], 'choix.xlsx', 'medecine-famille');

        expect(residents.map((r) => r.cin)).toEqual(['44444444']);
        expect(residents[0].stages.map((s) => `${s.periode} ${s.annee}`)).toEqual(['T1 2026', 'T2 2026']);
        expect(bilan).toMatchObject({ autresFacultes: 2, doublons: 1 });
    });

    it('reconnaît une liste CIN + e-mail', () => {
        const f = feuille('Feuil1', ['CIN', 'Email'], [['11111111', 'A@Exemple.tn'], ['22222222', 'pas-un-email']]);
        const { emails, residents } = analyserClasseur([f], 'emails.xlsx', 'medecine-famille');

        expect(residents).toEqual([]);
        expect(emails).toEqual([{ cin: '11111111', email: 'a@exemple.tn' }]);
    });

    it('signale clairement un fichier dont le semestre est introuvable', () => {
        const f = feuille('Feuil1', ENTETES_REGISTRE, [[1, 1, '11111111', 'X', '', 'SFAX', '', 'MED DE FAMILLE', 'S', 'H', '', '', '', '2A']]);

        expect(() => analyserClasseur([f], 'registre.xlsx', 'medecine-famille')).toThrow(/semestre/);
    });
});
