import { DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, of } from 'rxjs';
import { catchError, debounceTime, switchMap } from 'rxjs/operators';
import { ApiService } from '../services/api';

// Suggestions d'hôpitaux ou de services déjà utilisés, pour une liste <datalist> sous un champ.
// À créer dans le contexte d'injection d'un composant.
export class SuggestionsReferentiel {
  readonly valeurs = signal<string[]>([]);
  private readonly demandes = new Subject<{ q: string; hopital: string }>();

  constructor(type: 'hopital' | 'service') {
    const api = inject(ApiService);
    this.demandes.pipe(
      debounceTime(200),
      switchMap(({ q, hopital }) => api.suggestions(type, q, hopital).pipe(catchError(() => of([] as string[])))),
      takeUntilDestroyed(inject(DestroyRef))
    ).subscribe((liste) => this.valeurs.set(liste));
  }

  chercher(q: string, hopital = '') {
    this.demandes.next({ q: (q || '').trim(), hopital: (hopital || '').trim() });
  }
}
