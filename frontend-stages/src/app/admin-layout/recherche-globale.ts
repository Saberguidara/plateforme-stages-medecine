import { Component, DestroyRef, ElementRef, HostListener, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { ApiService, SuggestionResident } from '../services/api';
import { libelleNiveauCourt } from '../services/residanat';

// Recherche d'un résident par CIN ou par nom depuis n'importe quel écran de l'administration.
@Component({
  selector: 'app-recherche-globale',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="recherche-globale" role="search">
      <i class="bi bi-search" aria-hidden="true"></i>
      <input type="search" class="form-control" placeholder="CIN ou nom du résident…"
        aria-label="Rechercher un résident par CIN ou par nom" autocomplete="off"
        role="combobox" aria-autocomplete="list" aria-controls="suggestionsResidents"
        [attr.aria-expanded]="ouvert()" [attr.aria-activedescendant]="indexActif() >= 0 ? 'suggestion-' + indexActif() : null"
        [(ngModel)]="texte" (ngModelChange)="saisie$.next($event)"
        (keydown.arrowDown)="deplacer(1, $event)" (keydown.arrowUp)="deplacer(-1, $event)"
        (keydown.enter)="valider($event)" (keydown.escape)="fermer()" (focus)="rouvrir()">

      @if (ouvert()) {
        <ul class="suggestions-liste" id="suggestionsResidents" role="listbox" aria-label="Résidents trouvés">
          @if (chargement()) {
            <li class="suggestion-item" aria-disabled="true"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span> Recherche…</li>
          } @else {
            @for (r of resultats(); track r.id; let i = $index) {
              <li class="suggestion-item" role="option" [id]="'suggestion-' + i" [class.actif]="i === indexActif()"
                [attr.aria-selected]="i === indexActif()" (mousedown)="$event.preventDefault()" (click)="ouvrir(r)">
                <span class="suggestion-nom">{{ r.nom_prenom }}</span>
                <span class="suggestion-detail chiffres">{{ r.cin }} · {{ niveauCourt(r.niveau) }}</span>
              </li>
            } @empty {
              <li class="suggestion-item" aria-disabled="true">Aucun résident pour « {{ texte }} »</li>
            }
            @if (resultats().length === 8) {
              <li class="suggestion-item" role="option" (mousedown)="$event.preventDefault()" (click)="voirTout()">
                <span class="suggestion-detail"><i class="bi bi-list-ul" aria-hidden="true"></i> Voir tous les résultats</span>
              </li>
            }
          }
        </ul>
      }
    </div>
  `
})
export class RechercheGlobale {
  private api = inject(ApiService);
  private router = inject(Router);
  private hote = inject(ElementRef);

  texte = '';
  readonly saisie$ = new Subject<string>();
  readonly resultats = signal<SuggestionResident[]>([]);
  readonly ouvert = signal(false);
  readonly chargement = signal(false);
  readonly indexActif = signal(-1);
  readonly niveauCourt = libelleNiveauCourt;

  constructor() {
    this.saisie$.pipe(
      debounceTime(250),
      distinctUntilChanged(),
      switchMap((q) => {
        const terme = q.trim();
        if (terme.length < 2) {
          this.ouvert.set(false);
          return of(null);
        }
        this.chargement.set(true);
        this.ouvert.set(true);
        return this.api.rechercher(terme).pipe(catchError(() => of([] as SuggestionResident[])));
      }),
      takeUntilDestroyed(inject(DestroyRef))
    ).subscribe((liste) => {
      this.chargement.set(false);
      if (liste === null) return;
      this.resultats.set(liste);
      this.indexActif.set(liste.length ? 0 : -1);
    });
  }

  deplacer(pas: number, event: Event) {
    if (!this.ouvert() || this.resultats().length === 0) return;
    event.preventDefault();
    const n = this.resultats().length;
    this.indexActif.set((this.indexActif() + pas + n) % n);
  }

  valider(event: Event) {
    event.preventDefault();
    const choisi = this.resultats()[this.indexActif()];
    if (this.ouvert() && choisi) this.ouvrir(choisi);
    else if (this.texte.trim()) this.voirTout();
  }

  ouvrir(r: SuggestionResident) {
    this.reinitialiser();
    this.router.navigate(['/admin/residents', r.id]);
  }

  voirTout() {
    const search = this.texte.trim();
    this.reinitialiser();
    this.router.navigate(['/admin/residents'], { queryParams: { search } });
  }

  rouvrir() {
    if (this.texte.trim().length >= 2 && this.resultats().length) this.ouvert.set(true);
  }

  fermer() {
    this.ouvert.set(false);
  }

  private reinitialiser() {
    this.texte = '';
    this.saisie$.next('');
    this.resultats.set([]);
    this.ouvert.set(false);
  }

  @HostListener('document:click', ['$event'])
  clicAilleurs(event: Event) {
    if (!this.hote.nativeElement.contains(event.target)) this.fermer();
  }
}
