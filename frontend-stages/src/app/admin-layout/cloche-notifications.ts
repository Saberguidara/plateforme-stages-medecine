import { Component, computed, DestroyRef, ElementRef, HostListener, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { merge, of, timer } from 'rxjs';
import { catchError, debounceTime, filter, switchMap } from 'rxjs/operators';
import { ApiService, ResumeNotifications } from '../services/api';

export interface AlerteCloche {
  cle: string;
  icone: string;
  titre: string;
  detail: string;
  nombre: number;
  chemin: string;
  queryParams?: Record<string, string>;
  gravite: 'critique' | 'attention';
}

const RAFRAICHISSEMENT = 5 * 60 * 1000;

// Ce qui attend une action, du plus urgent au moins urgent
export function alertesDepuis(r: ResumeNotifications | null): AlerteCloche[] {
  if (!r) return [];
  const alertes: AlerteCloche[] = [];
  if (r.signalements.ouverts > 0) {
    alertes.push({
      cle: 'signalements', icone: 'bi-flag-fill', gravite: 'critique', nombre: r.signalements.ouverts,
      titre: `${r.signalements.ouverts} signalement(s) à traiter`,
      detail: r.signalements.plusAncien ? `Le plus ancien date du ${new Date(r.signalements.plusAncien).toLocaleDateString('fr-FR')}` : '',
      chemin: '/admin/tableau-de-bord'
    });
  }
  if (r.fichesNonAnnoncees.fiches > 0) {
    alertes.push({
      cle: 'annonces', icone: 'bi-envelope-paper', gravite: 'attention', nombre: r.fichesNonAnnoncees.fiches,
      titre: `${r.fichesNonAnnoncees.fiches} fiche(s) pas encore annoncée(s)`,
      detail: `${r.fichesNonAnnoncees.residents} résident(s) à prévenir par e-mail`,
      chemin: '/admin/tableau-de-bord'
    });
  }
  if (r.rappels.disponibles && r.rappels.residents > 0) {
    alertes.push({
      cle: 'rappels', icone: 'bi-bell', gravite: 'attention', nombre: r.rappels.residents,
      titre: `${r.rappels.residents} rappel(s) possible(s)`,
      detail: "Fiches annoncées depuis plus d'une semaine, jamais téléchargées",
      chemin: '/admin/statistiques', queryParams: { onglet: 'diffusion' }
    });
  }
  return alertes;
}

// Cloche de l'administration : signalements ouverts, fiches à annoncer, rappels possibles.
// Relue toutes les 5 minutes et après chaque changement d'écran.
@Component({
  selector: 'app-cloche-notifications',
  standalone: true,
  imports: [RouterLink],
  host: { class: 'cloche' },
  template: `
    <button type="button" class="btn pill-btn-outline-dark cloche-bouton" (click)="ouvert.set(!ouvert())"
      [attr.aria-expanded]="ouvert()" aria-controls="clocheListe"
      [attr.aria-label]="total() > 0 ? total() + ' élément(s) en attente' : 'Aucune notification'">
      <i class="bi" [class.bi-bell-fill]="total() > 0" [class.bi-bell]="total() === 0" aria-hidden="true"></i>
      @if (alertes().length > 0) { <span class="cloche-badge chiffres" [class.critique]="critique()">{{ alertes().length }}</span> }
    </button>
    @if (ouvert()) {
      <div class="cloche-panneau" id="clocheListe" role="region" aria-label="Notifications">
        <div class="cloche-titre">À faire</div>
        @for (a of alertes(); track a.cle) {
          <a class="cloche-item" [attr.data-gravite]="a.gravite" [routerLink]="a.chemin" [queryParams]="a.queryParams" (click)="ouvert.set(false)">
            <i [class]="'bi ' + a.icone" aria-hidden="true"></i>
            <span class="min-w-0"><strong>{{ a.titre }}</strong>@if (a.detail) { <small>{{ a.detail }}</small> }</span>
          </a>
        } @empty {
          <div class="cloche-vide"><i class="bi bi-check2-circle" aria-hidden="true"></i> Rien en attente.</div>
        }
      </div>
    }
  `
})
export class ClocheNotifications {
  private api = inject(ApiService);
  private hote = inject(ElementRef);

  readonly resume = signal<ResumeNotifications | null>(null);
  readonly ouvert = signal(false);
  readonly alertes = computed(() => alertesDepuis(this.resume()));
  readonly total = computed(() => this.alertes().reduce((n, a) => n + a.nombre, 0));
  readonly critique = computed(() => this.alertes().some((a) => a.gravite === 'critique'));

  constructor() {
    const router = inject(Router);
    merge(
      timer(0, RAFRAICHISSEMENT),
      router.events.pipe(filter((e) => e instanceof NavigationEnd), debounceTime(500))
    ).pipe(
      switchMap(() => this.api.getResumeNotifications().pipe(catchError(() => of(null)))),
      takeUntilDestroyed(inject(DestroyRef))
    ).subscribe((r) => { if (r) this.resume.set(r); });
  }

  @HostListener('document:click', ['$event'])
  fermerDehors(e: MouseEvent) {
    if (this.ouvert() && !this.hote.nativeElement.contains(e.target)) this.ouvert.set(false);
  }

  @HostListener('document:keydown.escape')
  fermer() {
    this.ouvert.set(false);
  }
}
