import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  Affectations, ApiService, DetailAffectation, enregistrerFichier, FiltresStatistiques, OptionsStatistiques
} from '../services/api';
import { CourbeSemestres } from '../admin-shared/graphiques';
import { ToastService } from '../services/toast';
import { libelleNiveau } from '../services/residanat';

export type Onglet = 'ensemble' | 'affectations';

export const LIBELLES_COLONNES: Record<string, string> = {
  T1: '1er trim.', T2: '2e trim.', S1: '1er sem.', T3: '3e trim.', T4: '4e trim.', S2: '2nd sem.',
  R1: 'Rattr. S1', R2: 'Rattr. S2'
};

const NB_HOPITAUX_REDUIT = 10;

// Filtres lus dans l'adresse : une vue se partage par simple lien.
export function filtresDepuis(params: ParamMap, anneeParDefaut = new Date().getFullYear()): FiltresStatistiques {
  const annee = Number(params.get('annee'));
  const promotion = Number(params.get('promotion'));
  const semestre = params.get('semestre');
  return {
    annee: annee >= 2000 ? annee : anneeParDefaut,
    semestre: semestre === 'S1' || semestre === 'S2' ? semestre : '',
    promotion: promotion >= 2000 ? promotion : null,
    faculte: params.get('faculte') ?? '',
    hopital: params.get('hopital') ?? ''
  };
}

// Intensité d'une case de la carte (0 à 4), proportionnelle au maximum de la carte
export function intensite(valeur: number, max: number): number {
  if (valeur <= 0 || max <= 0) return 0;
  const part = valeur / max;
  return part <= 0.2 ? 1 : part <= 0.45 ? 2 : part <= 0.75 ? 3 : 4;
}

// Module Statistiques : vue d'ensemble et affectations, avec des filtres communs gardés dans l'adresse.
@Component({
  selector: 'app-admin-statistiques',
  standalone: true,
  imports: [RouterLink, CourbeSemestres],
  templateUrl: './admin-statistiques.html'
})
export class AdminStatistiques implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  readonly libelleNiveau = libelleNiveau;
  readonly libellesColonnes = LIBELLES_COLONNES;
  readonly intensite = intensite;

  readonly filtres = signal<FiltresStatistiques>(filtresDepuis(this.route.snapshot.queryParamMap));
  readonly onglet = signal<Onglet>('ensemble');
  readonly options = signal<OptionsStatistiques | null>(null);
  readonly donnees = signal<Affectations | null>(null);
  readonly erreur = signal(false);
  readonly exportEnCours = signal(false);
  readonly tousLesHopitaux = signal(false);

  readonly caseChoisie = signal<{ hopital: string; colonne: string } | null>(null);
  readonly detail = signal<DetailAffectation | null>(null);
  readonly erreurDetail = signal(false);

  readonly anneesProposees = computed(() => {
    const annees = new Set(this.options()?.annees ?? []);
    annees.add(new Date().getFullYear());
    annees.add(this.filtres().annee);
    return [...annees].sort((a, b) => b - a);
  });

  readonly filtresActifs = computed(() => {
    const f = this.filtres();
    return [f.semestre, f.promotion, f.faculte, f.hopital].filter(Boolean).length;
  });

  readonly hopitauxAffiches = computed(() => {
    const liste = this.donnees()?.parHopital ?? [];
    return this.tousLesHopitaux() ? liste : liste.slice(0, NB_HOPITAUX_REDUIT);
  });

  readonly maxHopital = computed(() => Math.max(1, ...(this.donnees()?.parHopital ?? []).map((h) => h.fiches)));
  readonly maxService = computed(() => Math.max(1, ...(this.donnees()?.parService ?? []).map((s) => s.fiches)));
  readonly maxNiveau = computed(() => Math.max(1, ...(this.donnees()?.parNiveau ?? []).map((n) => n.residents)));
  readonly maxFaculte = computed(() => Math.max(1, ...(this.donnees()?.parFaculte ?? []).map((n) => n.residents)));

  // Répartition par type de période, pour l'anneau
  readonly types = computed(() => {
    const t = this.donnees()?.types;
    if (!t) return null;
    const total = t.trimestre + t.semestre + t.rattrapage;
    const part = (n: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);
    const a = part(t.trimestre);
    const b = a + part(t.semestre);
    return {
      total,
      degrade: `conic-gradient(var(--fms-orange) 0 ${a}%, var(--fms-noir) 0 ${b}%, #d8b49d 0 100%)`,
      lignes: [
        { libelle: 'Trimestres et 45 jours', valeur: t.trimestre, part: part(t.trimestre), classe: 'couleur-trimestre' },
        { libelle: 'Semestres', valeur: t.semestre, part: part(t.semestre), classe: 'couleur-semestre' },
        { libelle: 'Rattrapages', valeur: t.rattrapage, part: part(t.rattrapage), classe: 'couleur-rattrapage' }
      ]
    };
  });

  // Les semestres vides du début (avant les premières fiches) sont retirés de la courbe
  readonly evolution = computed(() => {
    const serie = this.donnees()?.evolution ?? [];
    const debut = serie.findIndex((e) => e.fiches > 0);
    return (debut < 0 ? serie : serie.slice(debut)).map((e) => ({ libelle: e.libelle, valeur: e.fiches }));
  });

  ngOnInit() {
    this.api.getOptionsStatistiques().subscribe({ next: (o) => this.options.set(o), error: () => this.options.set(null) });
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.onglet.set(params.get('onglet') === 'affectations' ? 'affectations' : 'ensemble');
      this.filtres.set(filtresDepuis(params));
      this.charger();
    });
  }

  charger() {
    this.erreur.set(false);
    this.donnees.set(null);
    this.fermerDetail();
    const demande = this.filtres();
    this.api.getAffectations(demande).subscribe({
      next: (d) => { if (JSON.stringify(this.filtres()) === JSON.stringify(demande)) this.donnees.set(d); },
      error: () => this.erreur.set(true)
    });
  }

  // Met à jour l'adresse ; le rechargement suit le changement de paramètres
  modifier(changement: Partial<FiltresStatistiques> & { onglet?: Onglet }) {
    const f = { ...this.filtres(), ...changement };
    const onglet = changement.onglet ?? this.onglet();
    this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: {
        onglet: onglet === 'ensemble' ? null : onglet,
        annee: f.annee === new Date().getFullYear() ? null : f.annee,
        semestre: f.semestre || null,
        promotion: f.promotion || null,
        faculte: f.faculte || null,
        hopital: f.hopital || null
      }
    });
  }

  choisirOnglet(onglet: Onglet) {
    if (onglet !== this.onglet()) this.modifier({ onglet });
  }

  valeur(evenement: Event): string {
    return (evenement.target as HTMLSelectElement).value;
  }

  reinitialiser() {
    this.modifier({ semestre: '', promotion: null, faculte: '', hopital: '' });
  }

  ouvrirCase(hopital: string, colonne: string, valeur: number) {
    if (valeur <= 0) return;
    this.caseChoisie.set({ hopital, colonne });
    this.detail.set(null);
    this.erreurDetail.set(false);
    this.api.getDetailAffectation(this.filtres(), hopital, colonne).subscribe({
      next: (d) => {
        const c = this.caseChoisie();
        if (c && c.hopital === hopital && c.colonne === colonne) this.detail.set(d);
      },
      error: () => this.erreurDetail.set(true)
    });
  }

  fermerDetail() {
    this.caseChoisie.set(null);
    this.detail.set(null);
  }

  exporter() {
    this.exportEnCours.set(true);
    const f = this.filtres();
    this.api.exporterAffectations(f).subscribe({
      next: (blob) => {
        this.exportEnCours.set(false);
        enregistrerFichier(blob, `statistiques-affectations-${f.annee}${f.semestre ? '-' + f.semestre : ''}.xlsx`);
      },
      error: () => {
        this.exportEnCours.set(false);
        this.toast.erreur("L'export Excel n'a pas pu être généré.");
      }
    });
  }

  part(valeur: number, max: number): number {
    return max > 0 ? Math.round((valeur / max) * 1000) / 10 : 0;
  }

  // Paramètres de la liste des résidents pour un hôpital
  lienResidents(hopital: string) {
    return { hopital, ...(this.filtres().promotion ? { promo: this.filtres().promotion } : {}) };
  }
}
