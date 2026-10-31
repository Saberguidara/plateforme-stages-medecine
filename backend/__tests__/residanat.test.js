const { etatResidanat, dureeDe } = require('../config/specialites');

describe('Année de résidanat', () => {
    it('compte de la 1re à la 3e année en médecine de famille', () => {
        expect(etatResidanat('Médecine de famille', 1)).toEqual({ niveau: 1, parcours_termine: false, duree: 3 });
        expect(etatResidanat('Médecine de famille', 3)).toEqual({ niveau: 3, parcours_termine: false, duree: 3 });
    });

    it("indique « parcours terminé » l'année suivant la 3e", () => {
        expect(etatResidanat('Médecine de famille', 4)).toEqual({ niveau: null, parcours_termine: true, duree: 3 });
        expect(etatResidanat('Médecine de famille', 7).parcours_termine).toBe(true);
    });

    it("applique la durée de la médecine de famille aux spécialités pas encore configurées", () => {
        expect(dureeDe('RADIO')).toBe(3);
        expect(etatResidanat('RADIO', 5).parcours_termine).toBe(true);
    });

    it('ne donne pas d\'année avant le début du résidanat', () => {
        expect(etatResidanat('Médecine de famille', 0)).toEqual({ niveau: null, parcours_termine: false, duree: 3 });
    });
});
