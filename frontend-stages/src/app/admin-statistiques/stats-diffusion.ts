import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, Diffusion, SemestreCivil } from '../services/api';
import { AuthService } from '../services/auth';
import { ToastService } from '../services/toast';
import { Confirmation } from '../admin-shared/confirmation';
import { delaiLisible } from '../admin-shared/graphiques';
import { libelleNiveau } from '../services/residanat';

// Onglet Diffusion : délai entre l'e-mail « fiche disponible » et le téléchargement, et rappels ciblés.
@Component({
  selector: 'app-stats-diffusion',
  standalone: true,
  imports: [RouterLink, Confirmation],
  template: `
    @if (erreur()) {
      <div class="card dashboard-card">
        <div class="etat-vide">
          <i class="bi bi-wifi-off etat-vide-icone" aria-hidden="true"></i>
          <div class="etat-vide-titre">Diffusion indisponible</div>
          <button type="button" class="btn pill-btn-dark" (click)="charger()"><i class="bi bi-arrow-clockwise" aria-hidden="true"></i> Réessayer</button>
        </div>
      </div>
    } @else if (donnees(); as d) {
      <div class="kpi-grille">
        <div class="kpi-carte"><span class="kpi-libelle">Fiches annoncées par e-mail</span>
          <span class="kpi-valeur chiffres">{{ d.totaux.annoncees }}<small> / {{ d.totaux.fiches }}</small></span>
          <span class="kpi-evolution" data-sens="inconnu">{{ d.totaux.residentsPrevenus }} résident(s) prévenu(s)</span></div>
        <div class="kpi-carte"><span class="kpi-libelle">Délai médian de récupération</span>
          <span class="kpi-valeur chiffres">{{ d.delaiMedianHeures === null ? '–' : delai(d.delaiMedianHeures) }}</span>
          <span class="kpi-evolution" data-sens="inconnu">entre l'e-mail et le premier téléchargement</span></div>
        <div class="kpi-carte"><span class="kpi-libelle">Récupérées dans les 24 h</span>
          <span class="kpi-valeur chiffres">@if (d.partMoins24h === null) { – } @else { {{ d.partMoins24h }}<small> %</small> }</span>
          <span class="kpi-evolution" data-sens="inconnu">des fiches annoncées</span></div>
        <div class="kpi-carte"><span class="kpi-libelle">Jamais téléchargées</span>
          <span class="kpi-valeur chiffres" [class.kpi-valeur-alerte]="d.totaux.jamaisTelechargees > 0">{{ d.totaux.jamaisTelechargees }}</span>
          <span class="kpi-evolution" data-sens="inconnu">@if (d.totaux.jamaisSansEmail > 0) { dont {{ d.totaux.jamaisSansEmail }} résident(s) sans e-mail } @else { toutes annoncées ou non }</span></div>
      </div>

      <div class="row g-4 mt-0">
        <div class="col-lg-7 d-flex flex-column">
          <h3 class="section-titre-page"><i class="bi bi-hourglass-split" aria-hidden="true"></i> Délai entre l'e-mail et le premier téléchargement</h3>
          <div class="card dashboard-card flex-grow-1 p-3">
            @if (d.totaux.annoncees === 0) {
              <div class="etat-vide py-4">
                <i class="bi bi-envelope etat-vide-icone" aria-hidden="true"></i>
                <div class="etat-vide-titre">Aucune fiche annoncée pour {{ d.semestre.libelle }}</div>
                <p class="etat-vide-texte mb-0">Les délais apparaîtront après l'envoi des e-mails « fiche disponible » depuis le tableau de bord.</p>
              </div>
            } @else {
              <div class="colonnes-delai" role="img" [attr.aria-label]="resumeTranches()">
                @for (t of d.tranches; track t.cle) {
                  <div class="colonne-delai" [attr.data-tranche]="t.cle">
                    <strong class="chiffres">{{ t.fiches }}</strong>
                    <span class="colonne-delai-barre" [style.height.%]="hauteur(t.fiches)"></span>
                    <small>{{ t.libelle }}</small>
                  </div>
                }
              </div>
            }
          </div>
        </div>

        <div class="col-lg-5 d-flex flex-column">
          <h3 class="section-titre-page"><i class="bi bi-mortarboard" aria-hidden="true"></i> Récupération par année</h3>
          <div class="card dashboard-card flex-grow-1 p-3">
            <ul class="barres-h">
              @for (n of d.parNiveau; track n.niveau) {
                <li>
                  <span class="barres-h-libelle">{{ libelleNiveau(n.niveau) }}</span>
                  <span class="barres-h-piste"><span class="barres-h-valeur" [class.barres-h-alerte]="(n.taux ?? 0) < 50" [style.width.%]="n.taux ?? 0"></span></span>
                  <span class="barres-h-chiffre chiffres"><strong>{{ n.taux ?? 0 }} %</strong> · {{ n.telechargees }}/{{ n.fiches }}</span>
                </li>
              }
            </ul>
            <p class="small text-muted mb-0 mt-3">Part des fiches du semestre téléchargées au moins une fois.</p>
          </div>
        </div>
      </div>

      <!-- Rappels -->
      <h3 class="section-titre-page"><i class="bi bi-bell" aria-hidden="true"></i> Rappels</h3>
      <div class="bandeau-notification">
        <i class="bi bi-envelope-exclamation" aria-hidden="true"></i>
        <div class="flex-grow-1 min-w-0">
          @if (d.rappels.migrationManquante) {
            <strong>Rappels pas encore activés</strong>
            <div class="small text-muted">La base doit recevoir la migration 009 (table des rappels) avant le premier envoi.</div>
          } @else if (!d.enCours) {
            <strong>Les rappels concernent le semestre en cours</strong>
            <div class="small text-muted">Choisissez le semestre en cours pour relancer les résidents.</div>
          } @else if (d.rappels.residents === 0) {
            <strong>Aucun rappel à envoyer</strong>
            <div class="small text-muted">Un rappel est proposé une semaine après l'e-mail « fiche disponible », puis au plus une fois par semaine.</div>
          } @else {
            <strong>{{ d.rappels.residents }} résident(s) n'ont pas téléchargé leur fiche annoncée depuis plus d'une semaine</strong>
            <div class="small text-muted">Chacun recevra un e-mail de rappel listant ses {{ d.rappels.fiches }} fiche(s) concernée(s).</div>
          }
          @if (d.enCours && d.totaux.jamaisSansEmail > 0) {
            <div class="small mt-1"><a routerLink="/admin/residents" [queryParams]="{ alerte: 'a-relancer', email: 'sans' }">
              {{ d.totaux.jamaisSansEmail }} résident(s) sans e-mail à prévenir autrement</a></div>
          }
        </div>
        @if (peutModifier && d.rappels.disponibles && d.rappels.residents > 0) {
          <button type="button" class="btn pill-btn-orange flex-shrink-0" (click)="aConfirmer.set(true)" [disabled]="envoiEnCours()">
            <i class="bi bi-send" aria-hidden="true"></i> Envoyer {{ d.rappels.residents }} rappel(s)</button>
        }
      </div>

      @if (aConfirmer()) {
        <app-confirmation titre="Envoyer les rappels ?" icone="bi-send" libelleConfirmer="Envoyer" [danger]="false"
          [message]="d.rappels.residents + ' résident(s) recevront un e-mail de rappel. Ils ne seront pas relancés avant une semaine.'"
          [enCours]="envoiEnCours()" (confirmer)="envoyer()" (annuler)="aConfirmer.set(false)"></app-confirmation>
      }
    } @else {
      <div class="kpi-grille" aria-busy="true" aria-label="Chargement de la diffusion">
        @for (n of [1, 2, 3, 4]; track n) { <span class="skeleton skeleton-carte"></span> }
      </div>
    }
  `
})
export class StatsDiffusion {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  readonly peutModifier = inject(AuthService).peutModifier();
  readonly libelleNiveau = libelleNiveau;
  readonly delai = delaiLisible;

  readonly semestre = input.required<SemestreCivil>();
  readonly donnees = signal<Diffusion | null>(null);
  readonly erreur = signal(false);
  readonly aConfirmer = signal(false);
  readonly envoiEnCours = signal(false);

  private readonly maxTranche = computed(() => Math.max(1, ...(this.donnees()?.tranches ?? []).map((t) => t.fiches)));

  readonly resumeTranches = computed(() =>
    (this.donnees()?.tranches ?? []).map((t) => `${t.libelle} : ${t.fiches}`).join(', '));

  constructor() {
    effect(() => {
      this.semestre();
      this.charger();
    });
  }

  charger() {
    const demande = this.semestre();
    this.erreur.set(false);
    this.donnees.set(null);
    this.api.getDiffusion(demande).subscribe({
      next: (d) => { if (d.semestre.semestre === this.semestre().semestre && d.semestre.annee === this.semestre().annee) this.donnees.set(d); },
      error: () => this.erreur.set(true)
    });
  }

  hauteur(n: number): number {
    return Math.max(n > 0 ? 3 : 0, Math.round((n / this.maxTranche()) * 100));
  }

  envoyer() {
    this.envoiEnCours.set(true);
    this.api.envoyerRappels().subscribe({
      next: (res) => {
        this.envoiEnCours.set(false);
        this.aConfirmer.set(false);
        if (res.echecs > 0) this.toast.erreur(res.message); else this.toast.succes(res.message);
        this.charger();
      },
      error: (err) => {
        this.envoiEnCours.set(false);
        this.aConfirmer.set(false);
        this.toast.erreur(err.error?.message || "Les rappels n'ont pas pu être envoyés.");
      }
    });
  }
}
