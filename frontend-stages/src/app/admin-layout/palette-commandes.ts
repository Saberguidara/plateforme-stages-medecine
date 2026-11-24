import { Component, computed, DestroyRef, ElementRef, HostListener, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { ApiService, enregistrerFichier, SuggestionResident } from '../services/api';
import { AuthService } from '../services/auth';
import { ToastService } from '../services/toast';
import { LIBELLES_ECRANS, VuesService } from '../services/vues';
import { anneeCourte, semestreCourant } from '../services/residanat';

export interface Commande {
  cle: string;
  groupe: 'Résidents' | 'Écrans' | 'Actions' | 'Vues enregistrées';
  libelle: string;
  detail?: string;
  icone: string;
  motsCles?: string;
  executer: () => void;
}

export function normaliser(texte: string): string {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Une commande correspond si chaque mot tapé apparaît dans son libellé ou ses mots-clés.
export function correspond(commande: Pick<Commande, 'libelle' | 'motsCles' | 'detail'>, recherche: string): boolean {
  const mots = normaliser(recherche).split(/\s+/).filter(Boolean);
  const cible = normaliser(`${commande.libelle} ${commande.detail ?? ''} ${commande.motsCles ?? ''}`);
  return mots.every((m) => cible.includes(m));
}

const ORDRE_GROUPES: Commande['groupe'][] = ['Résidents', 'Vues enregistrées', 'Écrans', 'Actions'];

// Palette de commandes : Ctrl+K (ou ⌘K) depuis n'importe quel écran de l'administration
// pour ouvrir un dossier, un écran, une vue enregistrée ou lancer une action, sans souris.
@Component({
  selector: 'app-palette-commandes',
  standalone: true,
  template: `
    <button type="button" class="btn pill-btn-outline-dark bouton-palette" (click)="ouvrir()" aria-haspopup="dialog"
      title="Palette de commandes (Ctrl K)">
      <i class="bi bi-command" aria-hidden="true"></i><span class="d-none d-md-inline"> Commandes</span>
      <kbd class="d-none d-lg-inline">Ctrl K</kbd>
    </button>

    @if (ouverte()) {
      <div class="palette-fond" (click)="fermer()"></div>
      <div class="palette" role="dialog" aria-modal="true" aria-label="Palette de commandes">
        <div class="palette-saisie">
          <i class="bi bi-search" aria-hidden="true"></i>
          <input #champ type="text" class="palette-champ" placeholder="Résident, écran, vue ou action…" autocomplete="off"
            role="combobox" aria-autocomplete="list" aria-controls="paletteListe" aria-expanded="true"
            [attr.aria-activedescendant]="resultats().length ? 'commande-' + indexActif() : null"
            [value]="texte()" (input)="saisir($any($event.target).value)"
            (keydown.arrowDown)="deplacer(1, $event)" (keydown.arrowUp)="deplacer(-1, $event)"
            (keydown.enter)="valider($event)" (keydown.escape)="fermer()">
          <kbd>Échap</kbd>
        </div>
        <ul class="palette-liste" id="paletteListe" role="listbox" aria-label="Résultats">
          @for (c of resultats(); track c.cle; let i = $index) {
            @if (i === 0 || resultats()[i - 1].groupe !== c.groupe) {
              <li class="palette-groupe" role="presentation">{{ c.groupe }}</li>
            }
            <li class="palette-item" role="option" [id]="'commande-' + i" [class.actif]="i === indexActif()"
              [attr.aria-selected]="i === indexActif()" (mousemove)="indexActif.set(i)" (click)="executer(c)">
              <i [class]="'bi ' + c.icone" aria-hidden="true"></i>
              <span class="palette-libelle">{{ c.libelle }}</span>
              @if (c.detail) { <small class="palette-detail">{{ c.detail }}</small> }
            </li>
          } @empty {
            <li class="palette-vide" role="presentation">
              @if (recherche()) { <span class="spinner-border spinner-border-sm" aria-hidden="true"></span> Recherche… }
              @else { Aucun résultat pour « {{ texte() }} » }
            </li>
          }
        </ul>
        <div class="palette-pied"><span><kbd>↑</kbd> <kbd>↓</kbd> choisir</span><span><kbd>Entrée</kbd> ouvrir</span>
          <span>Tapez au moins 2 lettres pour chercher un résident</span></div>
      </div>
    }
  `
})
export class PaletteCommandes {
  private api = inject(ApiService);
  private router = inject(Router);
  private toast = inject(ToastService);
  private vues = inject(VuesService);
  readonly peutModifier = inject(AuthService).peutModifier();

  readonly ouverte = signal(false);
  readonly texte = signal('');
  readonly residents = signal<SuggestionResident[]>([]);
  readonly recherche = signal(false);
  readonly indexActif = signal(0);
  private readonly saisie$ = new Subject<string>();
  private readonly champ = viewChild<ElementRef<HTMLInputElement>>('champ');
  private focusPrecedent: HTMLElement | null = null;

  private readonly commandesFixes: Commande[] = [
    ...[
      ['Tableau de bord', 'bi-speedometer2', '/admin/tableau-de-bord', {}, 'accueil semestre'],
      ["Statistiques · Vue d'ensemble", 'bi-graph-up', '/admin/statistiques', {}, 'chiffres evolution'],
      ['Statistiques · Affectations', 'bi-hospital', '/admin/statistiques', { onglet: 'affectations' }, 'carte hopitaux services'],
      ['Statistiques · Diffusion', 'bi-send-check', '/admin/statistiques', { onglet: 'diffusion' }, 'telechargements rappels e-mails'],
      ['Statistiques · Qualité', 'bi-shield-check', '/admin/statistiques', { onglet: 'qualite' }, 'score controles doublons signalements'],
      ['Parcours des résidents', 'bi-diagram-3', '/admin/parcours', {}, 'semestres promotion'],
      ['Parcours à reprendre', 'bi-diagram-3', '/admin/parcours', { incomplets: '1' }, 'incomplets manquants'],
      ['Résidents', 'bi-people', '/admin/residents', {}, 'liste dossiers'],
      ['Imports', 'bi-cloud-arrow-up', '/admin/imports', {}, 'registre excel'],
      ['Historique', 'bi-clock-history', '/admin/historique', {}, 'journal actions'],
      ['Hôpitaux et services', 'bi-hospital', '/admin/referentiels', {}, 'referentiels fusion variantes'],
      ['Exports', 'bi-download', '/admin/exports', {}, 'excel zip pdf']
    ].map(([libelle, icone, chemin, queryParams, motsCles]) => ({
      cle: `ecran:${libelle}`, groupe: 'Écrans' as const, libelle: libelle as string, icone: icone as string, motsCles: motsCles as string,
      executer: () => this.router.navigate([chemin], { queryParams: queryParams as Record<string, string> })
    })),
    ...(this.peutModifier ? [
      { cle: 'action:nouveau', groupe: 'Actions' as const, libelle: 'Nouveau résident', icone: 'bi-person-plus', motsCles: 'creer ajouter dossier',
        executer: () => this.router.navigate(['/admin/residents/nouveau']) },
      { cle: 'action:import', groupe: 'Actions' as const, libelle: 'Importer un registre', icone: 'bi-cloud-arrow-up', motsCles: 'excel choix',
        executer: () => this.router.navigate(['/admin/imports']) },
      { cle: 'action:comptes', groupe: 'Écrans' as const, libelle: 'Comptes administrateurs', icone: 'bi-person-gear', motsCles: 'utilisateurs acces',
        executer: () => this.router.navigate(['/admin/comptes']) }
    ] : []),
    { cle: 'action:rapport', groupe: 'Actions', libelle: 'Rapport PDF du semestre en cours', icone: 'bi-file-earmark-pdf',
      motsCles: 'telecharger bilan doyen', executer: () => this.telechargerRapport() },
    { cle: 'action:sans-email', groupe: 'Actions', libelle: 'Résidents sans e-mail', icone: 'bi-envelope-slash', motsCles: 'completer adresse',
      executer: () => this.router.navigate(['/admin/residents'], { queryParams: { email: 'sans', actifs: 1 } }) },
    { cle: 'action:relancer', groupe: 'Actions', libelle: 'Fiches à récupérer', icone: 'bi-download', motsCles: 'relancer jamais telechargee',
      executer: () => this.router.navigate(['/admin/residents'], { queryParams: { alerte: 'a-relancer' } }) }
  ];

  readonly resultats = computed<Commande[]>(() => {
    const t = this.texte().trim();
    const vues: Commande[] = this.vues.vues().map((v) => ({
      cle: `vue:${v.id}`, groupe: 'Vues enregistrées', libelle: v.nom, icone: 'bi-bookmark',
      detail: LIBELLES_ECRANS[v.ecran] + (v.cree_par ? ` · ${v.cree_par}` : ''), executer: () => this.vues.ouvrir(v)
    }));
    const residents: Commande[] = this.residents().map((r) => ({
      cle: `resident:${r.id}`, groupe: 'Résidents', libelle: r.nom_prenom, icone: 'bi-person',
      detail: `${r.cin} · ${anneeCourte(r)}`, executer: () => this.router.navigate(['/admin/residents', r.id])
    }));
    const autres = [...vues, ...this.commandesFixes].filter((c) => !t || correspond(c, t));
    return [...(t.length >= 2 ? residents : []), ...autres]
      .sort((a, b) => ORDRE_GROUPES.indexOf(a.groupe) - ORDRE_GROUPES.indexOf(b.groupe));
  });

  constructor() {
    this.saisie$.pipe(
      debounceTime(200),
      distinctUntilChanged(),
      switchMap((q) => {
        const terme = q.trim();
        if (terme.length < 2) return of([] as SuggestionResident[]);
        this.recherche.set(true);
        return this.api.rechercher(terme).pipe(catchError(() => of([] as SuggestionResident[])));
      }),
      takeUntilDestroyed(inject(DestroyRef))
    ).subscribe((liste) => {
      this.recherche.set(false);
      this.residents.set(liste);
      this.indexActif.set(0);
    });
  }

  @HostListener('document:keydown', ['$event'])
  raccourci(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (this.ouverte()) this.fermer(); else this.ouvrir();
    }
  }

  ouvrir() {
    this.focusPrecedent = document.activeElement as HTMLElement | null;
    this.vues.charger();
    this.texte.set('');
    this.residents.set([]);
    this.indexActif.set(0);
    this.ouverte.set(true);
    setTimeout(() => this.champ()?.nativeElement.focus());
  }

  fermer() {
    this.ouverte.set(false);
    this.focusPrecedent?.focus?.();
  }

  saisir(valeur: string) {
    this.texte.set(valeur);
    this.indexActif.set(0);
    if (valeur.trim().length >= 2) this.recherche.set(true);
    else this.residents.set([]);
    this.saisie$.next(valeur);
  }

  deplacer(pas: number, e: Event) {
    e.preventDefault();
    const n = this.resultats().length;
    if (n) this.indexActif.set((this.indexActif() + pas + n) % n);
  }

  valider(e: Event) {
    e.preventDefault();
    const c = this.resultats()[this.indexActif()];
    if (c) this.executer(c);
  }

  executer(c: Commande) {
    this.ouverte.set(false);
    c.executer();
  }

  private telechargerRapport() {
    const s = semestreCourant();
    const semestre = { semestre: s.semestre as 'S1' | 'S2', annee: s.annee };
    this.toast.succes('Rapport en préparation…');
    this.api.telechargerRapport(semestre).subscribe({
      next: (blob) => enregistrerFichier(blob, `rapport-stages-${semestre.semestre}-${semestre.annee}.pdf`),
      error: () => this.toast.erreur("Le rapport n'a pas pu être généré.")
    });
  }
}
