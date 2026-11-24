import { Component, DestroyRef, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';
import { AuthService } from '../services/auth';
import { RechercheGlobale } from './recherche-globale';
import { PaletteCommandes } from './palette-commandes';
import { ApiService, VueEnregistree } from '../services/api';
import { ToastService } from '../services/toast';
import { VuesService, LIBELLES_ECRANS } from '../services/vues';

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
  imports: [RouterOutlet, RouterLink, RouterLinkActive, RechercheGlobale, PaletteCommandes],
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
          @if (vues.vues().length > 0) {
            <div class="admin-nav-groupe">Vues enregistrées</div>
            @for (v of vues.vues(); track v.id) {
              <div class="admin-nav-vue">
                <button type="button" class="admin-nav-lien" (click)="vues.ouvrir(v)" [title]="libellesEcrans[v.ecran] + (v.cree_par ? ' · enregistrée par ' + v.cree_par : '')">
                  <i class="bi bi-bookmark" aria-hidden="true"></i> <span class="texte-tronque">{{ v.nom }}</span>
                </button>
                @if (!lectureSeule) {
                  <button type="button" class="admin-nav-vue-supprimer" (click)="supprimerVue(v)" [attr.aria-label]="'Supprimer la vue ' + v.nom">
                    <i class="bi bi-x" aria-hidden="true"></i></button>
                }
              </div>
            }
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
          <app-palette-commandes></app-palette-commandes>
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
  private api = inject(ApiService);
  private toast = inject(ToastService);
  readonly vues = inject(VuesService);
  readonly libellesEcrans = LIBELLES_ECRANS;
  readonly menuOuvert = signal(false);
  readonly lectureSeule = !this.auth.peutModifier();

  readonly liensPrincipaux: LienMenu[] = [
    { chemin: 'tableau-de-bord', libelle: 'Tableau de bord', icone: 'bi-speedometer2' },
    { chemin: 'statistiques', libelle: 'Statistiques', icone: 'bi-graph-up' },
    { chemin: 'residents', libelle: 'Résidents', icone: 'bi-people' },
    { chemin: 'parcours', libelle: 'Parcours', icone: 'bi-diagram-3' },
    { chemin: 'imports', libelle: 'Imports', icone: 'bi-cloud-arrow-up' },
    { chemin: 'historique', libelle: 'Historique', icone: 'bi-clock-history' }
  ];

  readonly outils: LienMenu[] = [
    { chemin: 'referentiels', libelle: 'Hôpitaux et services', icone: 'bi-hospital' },
    { chemin: 'exports', libelle: 'Exports', icone: 'bi-download' },
    ...(this.lectureSeule ? [] : [{ chemin: 'comptes', libelle: 'Comptes', icone: 'bi-person-gear' }])
  ];

  constructor() {
    this.vues.charger();
    // Sur mobile, le menu se referme dès qu'on change d'écran.
    inject(Router).events.pipe(
      filter((e) => e instanceof NavigationEnd),
      takeUntilDestroyed(inject(DestroyRef))
    ).subscribe(() => this.menuOuvert.set(false));
  }

  // La vue disparaît du menu, de la palette et pour toute l'équipe
  supprimerVue(v: VueEnregistree) {
    this.api.supprimerVue(v.id).subscribe({
      next: (res) => { this.vues.retirer(v.id); this.toast.succes(res.message); },
      error: (err) => this.toast.erreur(err.error?.message || "La vue n'a pas pu être supprimée.")
    });
  }
}
