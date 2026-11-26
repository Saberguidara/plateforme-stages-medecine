// Calculs liés au résidanat, identiques à ceux du serveur (config/specialites.js) :
// l'année imprimée sur une fiche est déduite de la promotion (année d'entrée en 1re année).

// Durée du résidanat en médecine de famille ; les autres spécialités seront configurées plus tard.
export const DUREE_RESIDANAT = 3;

// Même ordre que le serveur : dans un trimestre, ses deux moitiés de 45 jours (T1A, T1B) d'abord.
export const ORDRE_PERIODES = [
  'T1A', 'T1B', 'T1', 'T2A', 'T2B', 'T2', 'S1',
  'T3A', 'T3B', 'T3', 'T4A', 'T4B', 'T4', 'S2', 'R1', 'R2'
];

export const LIBELLES_PERIODES: Record<string, string> = {
  T1: '1er trimestre · janvier à mars',
  T2: '2e trimestre · avril à juin',
  T3: '3e trimestre · juillet à septembre',
  T4: '4e trimestre · octobre à décembre',
  S1: '1er semestre · janvier à juin',
  S2: '2nd semestre · juillet à décembre',
  T1A: '45 jours · 1er janvier au 15 février',
  T1B: '45 jours · 16 février au 31 mars',
  T2A: '45 jours · 1er avril au 15 mai',
  T2B: '45 jours · 16 mai au 30 juin',
  T3A: '45 jours · 1er juillet au 15 août',
  T3B: '45 jours · 16 août au 30 septembre',
  T4A: '45 jours · 1er octobre au 15 novembre',
  T4B: '45 jours · 16 novembre au 31 décembre',
  R1: 'Rattrapage du 1er semestre',
  R2: 'Rattrapage du 2nd semestre'
};

// Périodes qui couvrent des mois en commun : un semestre, ses trimestres et leurs moitiés de 45 jours.
const CONTENU: Record<string, string[]> = {
  S1: ['T1', 'T2', 'T1A', 'T1B', 'T2A', 'T2B'], S2: ['T3', 'T4', 'T3A', 'T3B', 'T4A', 'T4B'],
  T1: ['T1A', 'T1B'], T2: ['T2A', 'T2B'], T3: ['T3A', 'T3B'], T4: ['T4A', 'T4B']
};
const CHEVAUCHEMENTS: Record<string, string[]> = {};
for (const [grande, petites] of Object.entries(CONTENU)) {
  for (const petite of petites) {
    (CHEVAUCHEMENTS[grande] ??= []).push(petite);
    (CHEVAUCHEMENTS[petite] ??= []).push(grande);
  }
}

export interface StageDate {
  periode: string;
  annee: number;
}

export interface StageLieu extends StageDate {
  service?: string | null;
  hopital?: string | null;
}

const cleLieu = (v: string | null | undefined) =>
  (v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();

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

// « Promotion 2024 → 3ème année en 2026 », ou « parcours terminé » après la dernière année
export function descriptionPromotion(promotion: number | null | undefined, annee = new Date().getFullYear(), duree = DUREE_RESIDANAT): string {
  const niveau = niveauEn(promotion, annee);
  if (!promotion) return '';
  if (!niveau) return `Promotion ${promotion} → résidanat pas encore commencé en ${annee}`;
  if (niveau > duree) return `Promotion ${promotion} → parcours terminé en ${Number(promotion) + duree - 1}`;
  return `Promotion ${promotion} → ${libelleNiveau(niveau)} en ${annee}`;
}

// Année de résidanat imprimée sur une fiche : jamais au-delà de la dernière année (comme le serveur)
export function niveauImprime(promotion: number | null | undefined, annee: number, duree = DUREE_RESIDANAT): number | null {
  const niveau = niveauEn(promotion, annee);
  return niveau ? Math.min(niveau, duree) : null;
}

// Libellé court d'un résident renvoyé par le serveur : « 2A » ou « Terminé »
export function anneeCourte(r: { niveau?: number | string | null; parcours_termine?: boolean }): string {
  return r.parcours_termine ? 'Terminé' : libelleNiveauCourt(r.niveau);
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
      S2: { periode: 'S1', annee: dernier.annee + 1 },
      T1A: { periode: 'T1B', annee: dernier.annee },
      T1B: { periode: 'T2', annee: dernier.annee },
      T2A: { periode: 'T2B', annee: dernier.annee },
      T2B: { periode: 'T3', annee: dernier.annee },
      T3A: { periode: 'T3B', annee: dernier.annee },
      T3B: { periode: 'T4', annee: dernier.annee },
      T4A: { periode: 'T4B', annee: dernier.annee },
      T4B: { periode: 'T1', annee: dernier.annee + 1 }
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

// Même stage déjà enregistré sur la période (bloquant) ; autre stage sur la même période ou sur des mois
// en commun (simple avertissement : les stages en parallèle existent, deux CSB sur un semestre par exemple).
export function conflitsPeriode<T extends StageLieu & { id?: number }>(stages: T[], cible: StageLieu, ignorerId?: number): ConflitPeriode<T> {
  const autres = stages.filter((s) => s.id !== ignorerId && Number(s.annee) === Number(cible.annee));
  const memeLieu = (s: T) => cleLieu(s.service) === cleLieu(cible.service) && cleLieu(s.hopital) === cleLieu(cible.hopital);
  return {
    occupee: autres.find((s) => s.periode === cible.periode && memeLieu(s)) ?? null,
    chevauchements: autres.filter((s) => (s.periode === cible.periode && !memeLieu(s))
      || (CHEVAUCHEMENTS[cible.periode] ?? []).includes(s.periode))
  };
}

// CIN tunisien : 8 chiffres ; passeport : 5 à 20 lettres ou chiffres (contrôle repris par le serveur).
export function erreurIdentifiant(valeur: string, type: 'cin' | 'passeport'): string {
  const v = (valeur || '').replace(/\s/g, '').toUpperCase();
  if (!v) return '';
  if (type === 'cin') return /^\d{8}$/.test(v) ? '' : 'Un CIN tunisien comporte exactement 8 chiffres.';
  return /^[A-Z0-9]{5,20}$/.test(v) ? '' : 'Un numéro de passeport comporte 5 à 20 lettres ou chiffres.';
}
