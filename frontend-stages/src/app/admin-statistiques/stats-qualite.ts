import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, ControleQualite, LIBELLES_MOTIFS, Qualite } from '../services/api';
import { delaiLisible } from '../admin-shared/graphiques';

const FORMAT_MOIS = new Intl.DateTimeFormat('fr-FR', { month: 'short' });

// Écran où se corrige chaque contrôle, quand il en existe un
export const LIENS_CONTROLES: Record<string, { chemin: string; queryParams?: Record<string, string | number>; libelle: string }> = {
  'sans-email': { chemin: '/admin/residents', queryParams: { email: 'sans', actifs: 1 }, libelle: 'Compléter' },
  'variantes': { chemin: '/admin/referentiels', libelle: 'Vérifier' },
  'absents-registre': { chemin: '/admin/residents', queryParams: { alerte: 'absents-registre' }, libelle: 'Vérifier' }
};

export function libelleMois(mois: string): string {
  const [a, m] = mois.split('-').map(Number);
  return FORMAT_MOIS.format(new Date(a, m - 1, 1));
}

// Onglet Qualité : score de la base, contrôles à corriger et suivi des signalements.
@Component({
  selector: 'app-stats-qualite',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (erreur()) {
      <div class="card dashboard-card">
        <div class="etat-vide">
          <i class="bi bi-wifi-off etat-vide-icone" aria-hidden="true"></i>
          <div class="etat-vide-titre">Contrôles indisponibles</div>
          <button type="button" class="btn pill-btn-dark" (click)="charger()"><i class="bi bi-arrow-clockwise" aria-hidden="true"></i> Réessayer</button>
        </div>
      </div>
    } @else if (donnees(); as q) {
      <div class="row g-4">
        <div class="col-lg-4 d-flex flex-column">
          <h3 class="section-titre-page mt-0"><i class="bi bi-shield-check" aria-hidden="true"></i> Score de qualité</h3>
          <div class="card dashboard-card flex-grow-1 p-3 text-center">
            <div class="jauge" [style.background]="degradeJauge()" role="img" [attr.aria-label]="'Score de qualité : ' + q.score + ' sur 100'">
              <span class="jauge-centre"><strong class="chiffres">{{ q.score }}</strong><small>sur 100</small></span>
            </div>
            <p class="small text-muted mt-3 mb-2">{{ q.anomalies }} élément(s) à revoir · {{ q.residentsActifs }} résidents en cours</p>
            <details class="text-start small">
              <summary>Comment le score est calculé</summary>
              <p class="mt-2 mb-1">Chaque contrôle retire son poids multiplié par la part d'éléments concernés :</p>
              <ul class="mb-0 ps-3">
                @for (c of q.controles; track c.cle) { <li>{{ c.titre }} : {{ pourcent(q.poids[c.cle]) }} points au plus</li> }
              </ul>
            </details>
          </div>
        </div>

        <div class="col-lg-8 d-flex flex-column">
          <h3 class="section-titre-page mt-0"><i class="bi bi-list-check" aria-hidden="true"></i> Contrôles</h3>
          <div class="card dashboard-card flex-grow-1">
            <ul class="liste-sujets">
              @for (c of controlesTries(); track c.cle) {
                <li class="sujet" [attr.data-gravite]="c.nombre > 0 ? c.gravite : 'ok'">
                  <div class="sujet-corps">
                    <i [class]="'bi sujet-icone ' + (c.nombre > 0 ? 'bi-exclamation-circle' : 'bi-check-circle')" aria-hidden="true"></i>
                    <span class="sujet-texte"><strong>{{ c.titre }}</strong><small>{{ c.detail }}</small>
                      @if (c.exemples.length > 0) {
                        <details class="controle-exemples">
                          <summary>Voir {{ c.exemples.length < c.nombre ? 'les ' + c.exemples.length + ' premiers' : 'le détail' }}</summary>
                          <ul>
                            @for (e of c.exemples; track $index) {
                              <li>
                                @if (e.id) { <a [routerLink]="['/admin/residents', e.id]">{{ e.nom_prenom }}</a> }
                                @if (e.ids) {
                                  @for (id of e.ids; track id; let dernier = $last) { <a [routerLink]="['/admin/residents', id]">dossier {{ id }}</a>@if (!dernier) { · } }
                                  <small class="d-block text-muted">{{ e.precision }}</small>
                                } @else if (e.precision) { <span>{{ e.id ? ' · ' : '' }}{{ e.precision }}</span> }
                              </li>
                            }
                          </ul>
                        </details>
                      }
                    </span>
                    <span class="sujet-nombre chiffres">{{ c.nombre }}</span>
                    @let l = liens[c.cle];
                    @if (c.nombre > 0 && l) {
                      <a class="btn btn-sm pill-btn-outline-dark flex-shrink-0" [routerLink]="l.chemin" [queryParams]="l.queryParams">{{ l.libelle }}</a>
                    }
                  </div>
                </li>
              }
            </ul>
          </div>
        </div>
      </div>

      <!-- Signalements des résidents -->
      <h3 class="section-titre-page"><i class="bi bi-flag" aria-hidden="true"></i> Signalements des résidents
        <small class="text-muted fw-normal fs-6">{{ q.signalements.recus12Mois }} sur 12 mois · {{ q.signalements.ouverts }} ouvert(s)</small></h3>
      @if (q.signalements.recus12Mois === 0 && q.signalements.ouverts === 0) {
        <div class="card dashboard-card">
          <div class="etat-vide py-4">
            <i class="bi bi-flag etat-vide-icone" aria-hidden="true"></i>
            <div class="etat-vide-titre">Aucun signalement sur les 12 derniers mois</div>
            <p class="etat-vide-texte mb-0">Les motifs, délais de traitement et hôpitaux concernés apparaîtront ici.</p>
          </div>
        </div>
      } @else {
        <div class="row g-4">
          <div class="col-lg-4 d-flex flex-column">
            <div class="card dashboard-card flex-grow-1 p-3">
              <div class="fw-semibold mb-2">Par motif</div>
              <ul class="barres-h">
                @for (m of q.signalements.parMotif; track m.motif) {
                  <li><span class="barres-h-libelle">{{ libellesMotifs[m.motif] || m.motif }}</span>
                    <span class="barres-h-piste"><span class="barres-h-valeur" [style.width.%]="part(m.signalements, maxMotif())"></span></span>
                    <span class="barres-h-chiffre chiffres"><strong>{{ m.signalements }}</strong></span></li>
                }
              </ul>
            </div>
          </div>
          <div class="col-lg-4 d-flex flex-column">
            <div class="card dashboard-card flex-grow-1 p-3">
              <div class="fw-semibold mb-2">Délai de traitement <small class="text-muted fw-normal">médiane par mois</small></div>
              <div class="colonnes-delai colonnes-mois" role="img" [attr.aria-label]="resumeMois()">
                @for (m of q.signalements.parMois; track m.mois) {
                  <div class="colonne-delai">
                    <strong class="chiffres">{{ m.delaiMedianHeures === null ? '–' : delai(m.delaiMedianHeures) }}</strong>
                    <span class="colonne-delai-barre barres-h-sombre" [style.height.%]="hauteurMois(m.delaiMedianHeures)"></span>
                    <small>{{ libelleMois(m.mois) }}</small>
                  </div>
                }
              </div>
            </div>
          </div>
          <div class="col-lg-4 d-flex flex-column">
            <div class="card dashboard-card flex-grow-1 p-3">
              <div class="fw-semibold mb-2">Hôpitaux les plus signalés</div>
              <ul class="barres-h">
                @for (h of q.signalements.parHopital; track h.hopital) {
                  <li><span class="barres-h-libelle" [title]="h.hopital">{{ h.hopital }}</span>
                    <span class="barres-h-piste"><span class="barres-h-valeur barres-h-alerte" [style.width.%]="part(h.signalements, maxHopital())"></span></span>
                    <span class="barres-h-chiffre chiffres"><strong>{{ h.signalements }}</strong></span></li>
                }
              </ul>
              <p class="small text-muted mb-0 mt-3">Souvent le signe d'un nom mal écrit dans les registres.</p>
            </div>
          </div>
        </div>
      }
    } @else {
      <span class="skeleton skeleton-carte skeleton-bloc" aria-busy="true" aria-label="Chargement des contrôles"></span>
    }
  `
})
export class StatsQualite implements OnInit {
  private api = inject(ApiService);
  readonly libellesMotifs: Record<string, string> = LIBELLES_MOTIFS;
  readonly liens = LIENS_CONTROLES;
  readonly delai = delaiLisible;
  readonly libelleMois = libelleMois;

  readonly donnees = signal<Qualite | null>(null);
  readonly erreur = signal(false);

  // Les contrôles qui trouvent quelque chose d'abord, puis par gravité
  readonly controlesTries = computed<ControleQualite[]>(() => {
    const ordre = { critique: 0, attention: 1, info: 2 };
    return [...(this.donnees()?.controles ?? [])]
      .sort((a, b) => Number(b.nombre > 0) - Number(a.nombre > 0) || ordre[a.gravite] - ordre[b.gravite]);
  });

  readonly degradeJauge = computed(() => {
    const score = this.donnees()?.score ?? 0;
    const couleur = score >= 90 ? 'var(--fms-succes)' : score >= 70 ? 'var(--fms-orange)' : 'var(--fms-erreur)';
    return `conic-gradient(${couleur} 0 ${score}%, #f0ebe2 0 100%)`;
  });

  readonly maxMotif = computed(() => Math.max(1, ...(this.donnees()?.signalements.parMotif ?? []).map((m) => m.signalements)));
  readonly maxHopital = computed(() => Math.max(1, ...(this.donnees()?.signalements.parHopital ?? []).map((m) => m.signalements)));
  private readonly maxDelai = computed(() => Math.max(1, ...(this.donnees()?.signalements.parMois ?? []).map((m) => m.delaiMedianHeures ?? 0)));

  readonly resumeMois = computed(() => (this.donnees()?.signalements.parMois ?? [])
    .map((m) => `${libelleMois(m.mois)} : ${m.delaiMedianHeures === null ? 'aucun signalement traité' : delaiLisible(m.delaiMedianHeures)}`).join(', '));

  ngOnInit() {
    this.charger();
  }

  charger() {
    this.erreur.set(false);
    this.donnees.set(null);
    this.api.getQualite().subscribe({ next: (q) => this.donnees.set(q), error: () => this.erreur.set(true) });
  }

  part(n: number, max: number): number {
    return max > 0 ? Math.round((n / max) * 100) : 0;
  }

  pourcent(poids: number): number {
    return Math.round(poids * 100);
  }

  hauteurMois(heures: number | null): number {
    return heures ? Math.max(3, Math.round((heures / this.maxDelai()) * 100)) : 0;
  }
}
