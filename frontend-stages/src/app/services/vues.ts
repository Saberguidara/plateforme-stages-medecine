import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService, EcranVue, VueEnregistree } from './api';

export const CHEMINS_ECRANS: Record<EcranVue, string> = {
  residents: '/admin/residents',
  statistiques: '/admin/statistiques',
  parcours: '/admin/parcours'
};

export const LIBELLES_ECRANS: Record<EcranVue, string> = {
  residents: 'Résidents',
  statistiques: 'Statistiques',
  parcours: 'Parcours'
};

// Vues enregistrées de l'équipe, chargées une fois et partagées par le menu, la palette et les écrans.
@Injectable({ providedIn: 'root' })
export class VuesService {
  private api = inject(ApiService);
  private router = inject(Router);

  readonly vues = signal<VueEnregistree[]>([]);
  // false tant que la base n'a pas reçu la migration 010
  readonly disponible = signal(true);
  private chargee = false;

  charger(forcer = false) {
    if (this.chargee && !forcer) return;
    this.chargee = true;
    this.api.getVues().subscribe({
      next: (r) => { this.disponible.set(r.disponible); this.vues.set(r.vues); },
      error: () => { this.chargee = false; }
    });
  }

  ajouter(vue: VueEnregistree) {
    this.vues.update((liste) => [...liste, vue].sort((a, b) => a.ecran.localeCompare(b.ecran) || a.nom.localeCompare(b.nom, 'fr')));
  }

  retirer(id: number) {
    this.vues.update((liste) => liste.filter((v) => v.id !== id));
  }

  ouvrir(vue: VueEnregistree) {
    this.router.navigate([CHEMINS_ECRANS[vue.ecran]], { queryParams: vue.parametres });
  }
}
