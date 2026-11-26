import { conflitsPeriode, descriptionPromotion, erreurIdentifiant, niveauEn, periodeSuivante } from './residanat';

describe('Calculs du résidanat', () => {
  it("déduit l'année de résidanat de la promotion", () => {
    expect(niveauEn(2024, 2026)).toBe(3);
    expect(descriptionPromotion(2024, 2026)).toBe('Promotion 2024 → 3ème année en 2026');
    expect(descriptionPromotion(2026, 2026)).toBe('Promotion 2026 → 1ère année en 2026');
  });

  it('propose la période suivant le dernier stage', () => {
    const periodes = ['S1', 'S2', 'T1', 'T2', 'T3', 'T4', 'R1', 'R2'];
    expect(periodeSuivante([{ periode: 'T1', annee: 2026 }], periodes)).toEqual({ periode: 'T2', annee: 2026 });
    expect(periodeSuivante([{ periode: 'T3', annee: 2026 }, { periode: 'T4', annee: 2026 }], periodes)).toEqual({ periode: 'T1', annee: 2027 });
    expect(periodeSuivante([{ periode: 'S2', annee: 2025 }, { periode: 'R2', annee: 2025 }], periodes)).toEqual({ periode: 'S1', annee: 2026 });
    // Stage de 45 jours : la seconde moitié du trimestre, puis le trimestre suivant
    const avec45 = [...periodes, 'T4A', 'T4B'];
    expect(periodeSuivante([{ periode: 'T4A', annee: 2026 }], avec45)).toEqual({ periode: 'T4B', annee: 2026 });
    expect(periodeSuivante([{ periode: 'T4A', annee: 2026 }, { periode: 'T4B', annee: 2026 }], avec45)).toEqual({ periode: 'T1', annee: 2027 });
  });

  it('signale un stage en double et les chevauchements', () => {
    const stages = [
      { id: 1, periode: 'T3', annee: 2026, service: 'Psychiatrie', hopital: 'Hédi Chaker - Sfax' },
      { id: 2, periode: 'S1', annee: 2026, service: 'SAMU', hopital: 'Habib Bourguiba - Sfax' }
    ];
    expect(conflitsPeriode(stages, { periode: 'T3', annee: 2026, service: 'psychiatrie', hopital: 'Hedi Chaker - Sfax' }).occupee?.id).toBe(1);
    expect(conflitsPeriode(stages, { periode: 'T3', annee: 2026, service: 'Psychiatrie', hopital: 'Hédi Chaker - Sfax' }, 1).occupee).toBeNull();
    // Autre stage sur la même période : stage en parallèle, simple avertissement
    const parallele = conflitsPeriode(stages, { periode: 'T3', annee: 2026, service: 'Pneumologie', hopital: 'Hédi Chaker - Sfax' });
    expect(parallele.occupee).toBeNull();
    expect(parallele.chevauchements.map((s) => s.id)).toEqual([1]);
    expect(conflitsPeriode(stages, { periode: 'S2', annee: 2026 }).chevauchements.map((s) => s.id)).toEqual([1]);
    expect(conflitsPeriode(stages, { periode: 'T3B', annee: 2026 }).chevauchements.map((s) => s.id)).toEqual([1]);
  });

  it('contrôle le format du CIN et du passeport', () => {
    expect(erreurIdentifiant('07984449', 'cin')).toBe('');
    expect(erreurIdentifiant('7984449', 'cin')).toContain('8 chiffres');
    expect(erreurIdentifiant('AB12345', 'passeport')).toBe('');
    expect(erreurIdentifiant('A1', 'passeport')).toContain('5 à 20');
  });
});
