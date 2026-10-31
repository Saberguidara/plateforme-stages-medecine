import { Injectable, computed, signal } from '@angular/core';

// L'hébergement gratuit met le serveur en veille après 15 min sans visite ;
// la première requête peut alors attendre jusqu'à une minute. On le signale plutôt que de laisser croire à une panne.
@Injectable({ providedIn: 'root' })
export class ReveilServeurService {
  static readonly DELAI_MS = 5000;

  private readonly lentes = signal(0);
  readonly enAttente = computed(() => this.lentes() > 0);

  debut() { this.lentes.update((n) => n + 1); }
  fin() { this.lentes.update((n) => Math.max(0, n - 1)); }
}
