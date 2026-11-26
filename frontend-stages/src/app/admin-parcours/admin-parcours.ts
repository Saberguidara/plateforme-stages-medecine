import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService, EtatSemestre, Parcours, ParcoursResident, SemestreParcours } from '../services/api';
import { libelleNiveau } from '../services/residanat';
import { EnregistrerVue } from '../admin-shared/enregistrer-vue';

export const LIBELLES_ETATS: Record<EtatSemestre, string> = {
  fait: 'Stage enregistré',
  rattrape: 'Rattrapé',
  partiel: 'Incomplet',
  manquant: 'Aucune fiche',
  'en-cours': 'En cours',
  prevu: 'Prévu',
  'a-venir': 'À venir'
};

const ETATS_LEGENDE: EtatSemestre[] = ['fait', 'en-cours', 'rattrape', 'partiel', 'manquant', 'a-venir'];

// Texte court d'une case : les services du semestre, ou son état s'il n'y en a pas.
export function resumeSemestre(s: SemestreParcours): string {
  const services = [...new Set(s.stages.filter((x) => !x.periode.startsWith('R')).map((x) => x.service || 'Service non renseigné'))];
  const rattrapage = s.stages.find((x) => x.periode.startsWith('R'));
  if (services.length === 0 && !rattrapage) return LIBELLES_ETATS[s.etat];
  const texte = services.length > 2 ? `${services.slice(0, 2).join(' · ')} +${services.length - 2}` : services.join(' · ');
  return rattrapage ? `${texte}${texte ? ' · ' : ''}${rattrapage.periode} ${rattrapage.service ?? ''}`.trim() : texte;
}

// Info-bulle : chaque stage avec sa période et son hôpital
export function detailSemestre(s: SemestreParcours): string {
  const entete = `Année ${s.niveau} · ${s.semestre} ${s.annee} · ${LIBELLES_ETATS[s.etat]}`;
  return [entete, ...s.stages.map((x) => `${x.periode} : ${x.service ?? '?'} (${x.hopital ?? 'hôpital non renseigné'})`)].join('\n');
}

// Parcours des résidents en cours : leurs six semestres côte à côte, par promotion.
@Component({
  selector: 'app-admin-parcours',
  standalone: true,
  imports: [RouterLink, EnregistrerVue],
  templateUrl: './admin-parcours.html'
})
export class AdminParcours implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  readonly libelleNiveau = libelleNiveau;
  readonly libellesEtats = LIBELLES_ETATS;
  readonly etatsLegende = ETATS_LEGENDE;
  readonly resumeSemestre = resumeSemestre;
  readonly detailSemestre = detailSemestre;

  readonly donnees = signal<Parcours | null>(null);
  readonly erreur = signal(false);
  readonly promotion = signal<number | null>(null);
  readonly incompletsSeulement = signal(false);
  readonly recherche = signal('');

  // Promotion affichée : celle de l'adresse, sinon la première qui a des parcours à reprendre
  readonly promotionAffichee = computed(() => {
    const d = this.donnees();
    if (!d || d.promotions.length === 0) return null;
    const demandee = this.promotion();
    if (demandee && d.promotions.some((p) => p.promotion === demandee)) return demandee;
    return (d.promotions.find((p) => p.incomplets > 0) ?? d.promotions[0]).promotion;
  });

  readonly resumePromotion = computed(() => this.donnees()?.promotions.find((p) => p.promotion === this.promotionAffichee()) ?? null);

  readonly residents = computed<ParcoursResident[]>(() => {
    const d = this.donnees();
    if (!d) return [];
    const promo = this.promotionAffichee();
    const texte = this.recherche().trim().toUpperCase();
    return d.residents
      .filter((r) => r.promotion === promo)
      .filter((r) => !this.incompletsSeulement() || r.incomplets > 0 || r.sansFicheCourant)
      .filter((r) => !texte || r.nom_prenom.toUpperCase().includes(texte));
  });

  // Colonnes : les semestres de résidanat de la promotion affichée
  readonly colonnes = computed(() => {
    const r = this.donnees()?.residents.find((x) => x.promotion === this.promotionAffichee());
    return r ? r.semestres.map((s) => ({ niveau: s.niveau, semestre: s.semestre, annee: s.annee })) : [];
  });

  ngOnInit() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((p) => {
      const promo = Number(p.get('promotion'));
      this.promotion.set(promo >= 2000 ? promo : null);
      this.incompletsSeulement.set(p.get('incomplets') === '1');
      this.recherche.set(p.get('search') ?? '');
    });
    this.charger();
  }

  charger() {
    this.erreur.set(false);
    this.donnees.set(null);
    this.api.getParcours({}).subscribe({
      next: (d) => this.donnees.set(d),
      error: () => this.erreur.set(true)
    });
  }

  private majAdresse(changement: { promotion?: number | null; incomplets?: boolean; search?: string }) {
    const params = {
      promotion: changement.promotion !== undefined ? changement.promotion : this.promotion(),
      incomplets: (changement.incomplets ?? this.incompletsSeulement()) ? '1' : null,
      search: (changement.search ?? this.recherche()) || null
    };
    this.router.navigate([], { relativeTo: this.route, replaceUrl: true, queryParams: params });
  }

  choisirPromotion(promotion: number) {
    this.majAdresse({ promotion });
  }

  basculerIncomplets() {
    this.majAdresse({ incomplets: !this.incompletsSeulement() });
  }

  chercher(evenement: Event) {
    const texte = (evenement.target as HTMLInputElement).value;
    this.recherche.set(texte);
    this.majAdresse({ search: texte });
  }

  part(n: number, total: number): number {
    return total > 0 ? Math.round((n / total) * 100) : 0;
  }
}
