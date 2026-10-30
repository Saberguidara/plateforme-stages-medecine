// Calculs liés au résidanat, identiques à ceux du serveur (config/specialites.js) :
// l'année imprimée sur une fiche est déduite de la promotion (année d'entrée en 1re année).

export const ORDRE_PERIODES = ['T1', 'T2', 'S1', 'T3', 'T4', 'S2', 'R1', 'R2'];

export const LIBELLES_PERIODES: Record<string, string> = {
  T1: '1er trimestre · janvier à mars',
  T2: '2e trimestre · avril à juin',
  T3: '3e trimestre · juillet à septembre',
  T4: '4e trimestre · octobre à décembre',
  S1: '1er semestre · janvier à juin',
  S2: '2nd semestre · juillet à décembre',
  R1: 'Rattrapage du 1er semestre',
  R2: 'Rattrapage du 2nd semestre'
};

// Périodes qui couvrent les mêmes mois (un semestre et ses deux trimestres)
const CHEVAUCHEMENTS: Record<string, string[]> = {
  S1: ['T1', 'T2'], T1: ['S1'], T2: ['S1'],
  S2: ['T3', 'T4'], T3: ['S2'], T4: ['S2']
};

export interface StageDate {
  periode: string;
  annee: number;
}

export function semestreCourant(date = new Date()) {
  return { semestre: date.getMonth() < 6 ? 'S1' : 'S2', annee: date.getFullYear() };
}

export function niveauEn(promotion: number | null | undefined, annee: number): number | null {
  const promo = Number(promotion);
  if (!promo) return null;
  const niveau = annee - promo + 1;
  return niveau > 0 ? niveau : null;
}

export function libelleNiveau(niveau: number | string | null | undefined): string {
  const n = Number(niveau);
  if (!n || n < 1) return '';
  return n === 1 ? '1ère année' : `${n}ème année`;
}

export function libelleNiveauCourt(niveau: number | string | null | undefined): string {
  const n = Number(niveau);
  return n > 0 ? `${n}A` : '—';
}

// « Promotion 2024 → 3ème année en 2026 »
export function descriptionPromotion(promotion: number | null | undefined, annee = new Date().getFullYear()): string {
  const niveau = niveauEn(promotion, annee);
  if (!promotion) return '';
  if (!niveau) return `Promotion ${promotion} → résidanat pas encore commencé en ${annee}`;
  return `Promotion ${promotion} → ${libelleNiveau(niveau)} en ${annee}`;
}

function rang(stage: StageDate) {
  return stage.annee * 10 + ORDRE_PERIODES.indexOf(stage.periode);
}

export function trierStages<T extends StageDate>(stages: T[]): T[] {
  return [...stages].sort((a, b) => rang(a) - rang(b));
}

// Période suivant le dernier stage : trimestre suivant, semestre suivant, ou semestre en cours si aucun stage.
export function periodeSuivante(stages: StageDate[], periodesAutorisees: string[]): StageDate {
  const ordinaires = stages.filter((s) => !s.periode.startsWith('R'));
  const dernier = trierStages(ordinaires).at(-1);
  let suivant: StageDate;
  if (!dernier) {
    const courant = semestreCourant();
    suivant = { periode: courant.semestre, annee: courant.annee };
  } else {
    const suite: Record<string, StageDate> = {
      T1: { periode: 'T2', annee: dernier.annee },
      T2: { periode: 'T3', annee: dernier.annee },
      S1: { periode: 'S2', annee: dernier.annee },
      T3: { periode: 'T4', annee: dernier.annee },
      T4: { periode: 'T1', annee: dernier.annee + 1 },
      S2: { periode: 'S1', annee: dernier.annee + 1 }
    };
    suivant = suite[dernier.periode] ?? { periode: semestreCourant().semestre, annee: dernier.annee };
  }
  if (!periodesAutorisees.includes(suivant.periode)) suivant.periode = periodesAutorisees[0] ?? suivant.periode;
  return suivant;
}

export interface ConflitPeriode<T> {
  occupee: T | null;
  chevauchements: T[];
}

// Même période déjà enregistrée (bloquant) ou période qui couvre les mêmes mois (simple avertissement).
export function conflitsPeriode<T extends StageDate & { id?: number }>(stages: T[], cible: StageDate, ignorerId?: number): ConflitPeriode<T> {
  const autres = stages.filter((s) => s.id !== ignorerId && Number(s.annee) === Number(cible.annee));
  return {
    occupee: autres.find((s) => s.periode === cible.periode) ?? null,
    chevauchements: autres.filter((s) => (CHEVAUCHEMENTS[cible.periode] ?? []).includes(s.periode))
  };
}

// CIN tunisien : 8 chiffres ; passeport : 5 à 20 lettres ou chiffres (contrôle repris par le serveur).
export function erreurIdentifiant(valeur: string, type: 'cin' | 'passeport'): string {
  const v = (valeur || '').replace(/\s/g, '').toUpperCase();
  if (!v) return '';
  if (type === 'cin') return /^\d{8}$/.test(v) ? '' : 'Un CIN tunisien comporte exactement 8 chiffres.';
  return /^[A-Z0-9]{5,20}$/.test(v) ? '' : 'Un numéro de passeport comporte 5 à 20 lettres ou chiffres.';
}
