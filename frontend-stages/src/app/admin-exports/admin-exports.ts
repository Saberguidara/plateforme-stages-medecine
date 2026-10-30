import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, of } from 'rxjs';
import { catchError, debounceTime, switchMap } from 'rxjs/operators';
import { ApiService, enregistrerFichier } from '../services/api';
import { ToastService } from '../services/toast';
import { semestreCourant } from '../services/residanat';
import { SuggestionsReferentiel } from '../admin-shared/suggestions-referentiel';

// Exports : liste des résidents en Excel et fiches PDF d'un semestre dans un ZIP.
@Component({
  selector: 'app-admin-exports',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './admin-exports.html'
})
export class AdminExports implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private destroyRef = inject(DestroyRef);

  readonly promos = signal<number[]>([]);
  readonly hopitaux = new SuggestionsReferentiel('hopital');
  readonly exportExcel = signal(false);
  readonly exportZip = signal(false);
  readonly compte = signal<{ total: number; maximum: number } | null>(null);
  private readonly compte$ = new Subject<void>();

  excel = { promo: '', population: 'actifs', email: false };
  readonly populations = [
    { valeur: 'actifs', libelle: 'Résidents en cours de résidanat' },
    { valeur: 'tous', libelle: 'Tous les résidents de la base' },
    { valeur: 'sans-fiche-semestre', libelle: 'Sans fiche ce semestre' },
    { valeur: 'a-relancer', libelle: 'À relancer (fiche jamais récupérée)' },
    { valeur: 'absents-registre', libelle: 'Absents du dernier registre' }
  ];

  zip = { semestre: semestreCourant().semestre, annee: semestreCourant().annee, promo: '', hopital: '' };

  ngOnInit() {
    this.api.getPromotions().subscribe({ next: (p) => this.promos.set(p), error: () => { } });
    this.compte$.pipe(
      debounceTime(300),
      switchMap(() => this.api.compterFichesExport(this.zip).pipe(catchError(() => of(null)))),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((res) => this.compte.set(res));
    this.recompter();
  }

  recompter() {
    this.compte.set(null);
    this.compte$.next();
  }

  telechargerExcel() {
    const filtres: Record<string, string> = { promo: this.excel.promo };
    if (this.excel.population === 'actifs') filtres['actifs'] = '1';
    else if (this.excel.population !== 'tous') filtres['alerte'] = this.excel.population;
    if (this.excel.email) filtres['email'] = 'sans';

    this.exportExcel.set(true);
    this.api.exporterResidents(filtres).subscribe({
      next: (blob) => {
        this.exportExcel.set(false);
        enregistrerFichier(blob, `residents-${new Date().toISOString().slice(0, 10)}.xlsx`);
        this.toast.succes('Liste exportée en Excel.');
      },
      error: () => {
        this.exportExcel.set(false);
        this.toast.erreur("L'export Excel a échoué.");
      }
    });
  }

  telechargerZip() {
    this.exportZip.set(true);
    this.api.exporterFiches(this.zip).subscribe({
      next: (blob) => {
        this.exportZip.set(false);
        enregistrerFichier(blob, `fiches-${this.zip.semestre}-${this.zip.annee}.zip`);
        this.toast.succes(`${this.compte()?.total ?? ''} fiche(s) téléchargée(s).`);
      },
      error: async (err) => {
        this.exportZip.set(false);
        // La réponse d'erreur arrive aussi sous forme de fichier : on relit son message.
        let message = 'La génération du ZIP a échoué.';
        try { message = JSON.parse(await (err.error as Blob).text()).message || message; } catch { }
        this.toast.erreur(message);
      }
    });
  }
}
