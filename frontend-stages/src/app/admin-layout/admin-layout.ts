import { Component, DestroyRef, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';
import { AuthService } from '../services/auth';
import { RechercheGlobale } from './recherche-globale';

interface LienMenu {
  chemin: string;
  libelle: string;
  icone: string;
}

// Mise en page de l'administration : menu permanent (replié en bouton sur mobile)
// et barre de recherche globale au-dessus de chaque écran.
@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, RechercheGlobale],
  // Occupe toute la hauteur entre l'en-tête et le pied de page
  host: { class: 'd-flex flex-grow-1' },
  template: `
    <div class="admin-shell">
      <aside class="admin-nav" [class.ouvert]="menuOuvert()" id="menuAdmin">
        <nav class="admin-nav-liens" aria-label="Administration">
          @for (lien of liensPrincipaux; track lien.chemin) {
            <a class="admin-nav-lien" [routerLink]="lien.chemin" routerLinkActive="actif" ariaCurrentWhenActive="page">
              <i [class]="'bi ' + lien.icone" aria-hidden="true"></i> {{ lien.libelle }}
            </a>
          }
          <div class="admin-nav-groupe">Outils</div>
          @for (lien of outils; track lien.chemin) {
            <a class="admin-nav-lien" [routerLink]="lien.chemin" routerLinkActive="actif" ariaCurrentWhenActive="page">
              <i [class]="'bi ' + lien.icone" aria-hidden="true"></i> {{ lien.libelle }}
            </a>
          }
        </nav>
      </aside>

      <div class="admin-contenu">
        <div class="admin-barre">
          <button type="button" class="btn pill-btn-outline-dark admin-menu-bouton" (click)="menuOuvert.set(!menuOuvert())"
            aria-controls="menuAdmin" [attr.aria-expanded]="menuOuvert()">
            <i class="bi" [class.bi-list]="!menuOuvert()" [class.bi-x-lg]="menuOuvert()" aria-hidden="true"></i> Menu
          </button>
          <app-recherche-globale class="flex-grow-1 d-flex"></app-recherche-globale>
          @if (lectureSeule) {
            <span class="pastille pastille-sombre" title="Votre compte permet de consulter, pas de modifier">
              <i class="bi bi-eye" aria-hidden="true"></i> Lecture seule
            </span>
          }
        </div>
        <router-outlet></router-outlet>
      </div>
    </div>
  `
})
export class AdminLayout {
  private auth = inject(AuthService);
  readonly menuOuvert = signal(false);
  readonly lectureSeule = !this.auth.peutModifier();

  readonly liensPrincipaux: LienMenu[] = [
    { chemin: 'tableau-de-bord', libelle: 'Tableau de bord', icone: 'bi-speedometer2' },
    { chemin: 'residents', libelle: 'Résidents', icone: 'bi-people' },
    { chemin: 'imports', libelle: 'Imports', icone: 'bi-cloud-arrow-up' },
    { chemin: 'historique', libelle: 'Historique', icone: 'bi-clock-history' }
  ];

  readonly outils: LienMenu[] = [
    { chemin: 'referentiels', libelle: 'Hôpitaux et services', icone: 'bi-hospital' },
    { chemin: 'exports', libelle: 'Exports', icone: 'bi-download' },
    ...(this.lectureSeule ? [] : [{ chemin: 'comptes', libelle: 'Comptes', icone: 'bi-person-gear' }])
  ];

  constructor() {
    // Sur mobile, le menu se referme dès qu'on change d'écran.
    inject(Router).events.pipe(
      filter((e) => e instanceof NavigationEnd),
      takeUntilDestroyed(inject(DestroyRef))
    ).subscribe(() => this.menuOuvert.set(false));
  }
}
