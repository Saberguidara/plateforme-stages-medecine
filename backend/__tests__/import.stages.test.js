jest.mock('../config/db', () => ({
    query: jest.fn()
}));

jest.mock('../utils/logger', () => ({
    error: jest.fn(),
    info: jest.fn()
}));

const { stagesDeLigne } = require('../controllers/import.controller');

describe('Import Excel - découpage des stages', () => {
    it('crée une fiche semestrielle quand Hôpital 2 et Service 2 sont vides', () => {
        const ligne = { hopital1: 'CHU Habib Bourguiba', service1: 'Urgences', hopital2: '', service2: undefined };

        expect(stagesDeLigne(ligne, 'S1')).toEqual([
            { periode: 'S1', hopital: 'CHU Habib Bourguiba', service: 'Urgences' }
        ]);
        expect(stagesDeLigne(ligne, 'S2')[0].periode).toBe('S2');
    });

    it('traite des cellules ne contenant que des espaces comme vides', () => {
        const ligne = { hopital1: 'DIR REG SFAX', service1: 'CSB Sakiet Eddayer', hopital2: '  ', service2: ' ' };

        expect(stagesDeLigne(ligne, 'S1')).toHaveLength(1);
    });

    it('crée T1 + T2 pour S1 quand deux stages sont renseignés', () => {
        const ligne = { hopital1: 'H1', service1: 'S1', hopital2: 'H2', service2: 'S2' };

        expect(stagesDeLigne(ligne, 'S1')).toEqual([
            { periode: 'T1', hopital: 'H1', service: 'S1' },
            { periode: 'T2', hopital: 'H2', service: 'S2' }
        ]);
    });

    it('crée T3 + T4 pour S2 dès qu\'un champ du stage 2 est renseigné', () => {
        const ligne = { hopital1: 'H1', service1: 'S1', hopital2: '', service2: 'Pédiatrie' };

        expect(stagesDeLigne(ligne, 'S2').map((s) => s.periode)).toEqual(['T3', 'T4']);
    });
});
