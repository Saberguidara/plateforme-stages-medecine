import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ApiService, FiltresResidents, enregistrerFichier } from '../services/api';
import { AuthService } from '../services/auth';
import { ToastService } from '../services/toast';
import { libelleNiveauCourt, semestreCourant } from '../services/residanat';
import { Confirmation } from '../admin-shared/confirmation';

// Libellés des filtres ouverts depuis le tableau de bord
const LIBELLES_ALERTES: Record<string, string> = {
  'avec-fiche-semestre': 'Avec une fiche ce semestre',
  'sans-fiche-semestre': 'Sans fiche ce semestre',
  'sans-stage': 'Sans aucun stage',
  'a-relancer': 'À relancer : fiche jamais récupérée',
  'fiche-recuperee': 'Fiche du semestre récupérée',
  'absents-registre': 'Absents du dernier registre'
};

const FILTRES_URL = ['search', 'specialite', 'promo', 'email', 'actifs', 'alerte', 'hopital', 'sortCol', 'sortDesc', 'page', 'limit'];
const TAILLES_PAGE = [20, 50, 100];

interface FiltreRapide {
  cle: string;
  libelle: string;
  filtres: { actifs?: string; alerte?: string; email?: string };
}

// Liste des résidents : les filtres sont dans l'adresse, ce qui permet d'y arriver depuis le tableau de bord.
@Component({
  selector: 'app-admin-data',
  standalone: true,
  imports: [FormsModule, RouterLink, Confirmation],
  templateUrl: './admin-data.html'
})
export class AdminData implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);
  private destroyRef = inject(DestroyRef);

  readonly peutModifier = inject(AuthService).peutModifier();
  readonly niveauCourt = libelleNiveauCourt;
  readonly semestre = semestreCourant();
  readonly taillesPage = TAILLES_PAGE;
  readonly lignesChargement = [1, 2, 3, 4, 5, 6, 7, 8];
  readonly colonnes = [
    { cle: 'nom_prenom', libelle: 'Résident', classe: 'col-identite' },
    { cle: 'promotion', libelle: 'Promotion', classe: 'col-promotion' },
    { cle: 'faculte_origine', libelle: 'Faculté', classe: 'col-faculte' },
    { cle: 'nb_fiches', libelle: 'Fiches', classe: 'col-fiches text-center' }
  ];
  readonly filtresRapides: FiltreRapide[] = [
    { cle: 'tous', libelle: 'Tous', filtres: {} },
    { cle: 'actifs', libelle: 'En cours', filtres: { actifs: '1' } },
    { cle: 'sans-fiche-semestre', libelle: `Sans fiche ${this.semestre.semestre}`, filtres: { alerte: 'sans-fiche-semestre' } },
    { cle: 'a-relancer', libelle: 'À relancer', filtres: { alerte: 'a-relancer' } },
    { cle: 'email', libelle: 'Sans e-mail', filtres: { email: 'sans' } }
  ];

  readonly residents = signal<any[]>([]);
  readonly total = signal(0);
  readonly sansEmail = signal(0);
  readonly chargement = signal(true);
  readonly export = signal(false);
  readonly specialites = signal<string[]>([]);
  readonly promos = signal<number[]>([]);
  readonly selection = signal<Set<number>>(new Set());
  readonly suppression = signal<any[] | null>(null);
  readonly suppressionEnCours = signal(false);

  readonly toutSelectionne = computed(() => {
    const ids = this.residents().map((r) => r.id);
    return ids.length > 0 && ids.every((id) => this.selection().has(id));
  });
  readonly selectionPartielle = computed(() => this.selection().size > 0 && !this.toutSelectionne());

  filtres = {
    search: '', specialite: '', promo: '', email: '', actifs: '', alerte: '', hopital: '',
    sortCol: '', sortDesc: false, page: 1, limit: TAILLES_PAGE[0]
  };
  private minuterieRecherche: ReturnType<typeof setTimeout> | undefined;

  ngOnInit() {
    this.api.getSpecialites().subscribe({ next: (data) => this.specialites.set(data), error: () => { } });
    this.api.getPromotions().subscribe({ next: (data) => this.promos.set(data), error: () => { } });

    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.lireFiltres(params);
      this.charger();
    });
  }

  private lireFiltres(p: ParamMap) {
    const limit = Number(p.get('limit'));
    this.filtres = {
      search: p.get('search') ?? '',
      specialite: p.get('specialite') ?? '',
      promo: p.get('promo') ?? '',
      email: p.get('email') ?? '',
      actifs: p.get('actifs') ?? '',
      alerte: p.get('alerte') ?? '',
      hopital: p.get('hopital') ?? '',
      sortCol: p.get('sortCol') ?? '',
      sortDesc: p.get('sortDesc') === 'true',
      page: Math.max(1, Number(p.get('page')) || 1),
      limit: TAILLES_PAGE.includes(limit) ? limit : TAILLES_PAGE[0]
    };
  }

  private requete(): FiltresResidents {
    return { ...this.filtres, sortDesc: this.filtres.sortDesc || undefined };
  }

  private charger() {
    this.chargement.set(true);
    this.api.getAllResidents(this.requete()).subscribe({
      next: (res) => {
        this.residents.set(res.data);
        this.total.set(res.total);
        this.sansEmail.set(res.sansEmail ?? 0);
        this.chargement.set(false);
      },
      error: () => {
        this.chargement.set(false);
        this.toast.erreur('Erreur lors du chargement des résidents.');
      }
    });
  }

  // Toute modification des filtres passe par l'adresse de la page.
  private naviguer(changements: Partial<typeof this.filtres>, remettrePage = true) {
    const suivant = { ...this.filtres, ...changements, ...(remettrePage ? { page: 1 } : {}) };
    const queryParams: Record<string, string | null> = {};
    for (const cle of FILTRES_URL) {
      const valeur = (suivant as any)[cle];
      const parDefaut = valeur === '' || valeur === false || (cle === 'page' && valeur === 1) || (cle === 'limit' && valeur === TAILLES_PAGE[0]);
      queryParams[cle] = parDefaut ? null : String(valeur);
    }
    this.selection.set(new Set());
    this.router.navigate([], { relativeTo: this.route, queryParams, replaceUrl: true });
  }

  rechercher(texte: string) {
    clearTimeout(this.minuterieRecherche);
    this.minuterieRecherche = setTimeout(() => this.naviguer({ search: texte.trim() }), 300);
  }

  appliquer(cle: 'specialite' | 'promo', valeur: string) {
    this.naviguer({ [cle]: valeur });
  }

  // ===== Filtres rapides =====

  filtreRapideActif(): string {
    const f = this.filtres;
    if (f.email === 'sans' && !f.alerte) return 'email';
    if (f.alerte === 'sans-fiche-semestre' && !f.email) return 'sans-fiche-semestre';
    if (f.alerte === 'a-relancer' && !f.email) return 'a-relancer';
    if (f.actifs && !f.alerte && !f.email) return 'actifs';
    if (!f.actifs && !f.alerte && !f.email) return 'tous';
    return '';
  }

  choisirFiltreRapide(f: FiltreRapide) {
    this.naviguer({ actifs: '', alerte: '', email: '', ...f.filtres });
  }

  retirerFiltre(cle: 'alerte' | 'actifs' | 'hopital') {
    this.naviguer({ [cle]: '' });
  }

  libelleAlerte() {
    return LIBELLES_ALERTES[this.filtres.alerte] ?? '';
  }

  // Filtre venu du tableau de bord sans bouton rapide correspondant
  filtreSpecial(): boolean {
    return !!this.filtres.hopital || (!!this.filtres.alerte && this.filtreRapideActif() === '');
  }

  filtresActifs(): boolean {
    const f = this.filtres;
    return Boolean(f.search || f.specialite || f.promo || f.email || f.actifs || f.alerte || f.hopital);
  }

  reinitialiserFiltres() {
    this.selection.set(new Set());
    this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
  }

  // ===== Tri et pagination =====

  trierPar(col: string) {
    const desc = this.filtres.sortCol === col ? !this.filtres.sortDesc : false;
    this.naviguer({ sortCol: col, sortDesc: desc });
  }

  changerTaille(limit: string) {
    this.naviguer({ limit: Number(limit) });
  }

  get nbPages(): number {
    return Math.max(1, Math.ceil(this.total() / this.filtres.limit));
  }

  get premier(): number {
    return this.total() === 0 ? 0 : (this.filtres.page - 1) * this.filtres.limit + 1;
  }

  get dernier(): number {
    return Math.min(this.filtres.page * this.filtres.limit, this.total());
  }

  // Numéros de page affichés : première, dernière et voisines de la page courante
  pagesVisibles(): (number | null)[] {
    const n = this.nbPages;
    const p = this.filtres.page;
    const pages = new Set([1, n, p - 1, p, p + 1].filter((x) => x >= 1 && x <= n));
    const triees = [...pages].sort((a, b) => a - b);
    const resultat: (number | null)[] = [];
    triees.forEach((page, i) => {
      if (i > 0 && page - triees[i - 1] > 1) resultat.push(null);
      resultat.push(page);
    });
    return resultat;
  }

  allerPage(page: number) {
    if (page >= 1 && page <= this.nbPages && page !== this.filtres.page) this.naviguer({ page }, false);
  }

  // ===== Lignes =====

  ouvrir(r: any) {
    this.router.navigate(['/admin/residents', r.id]);
  }

  initiales(nom: string): string {
    const mots = (nom || '').trim().split(/\s+/).filter(Boolean);
    return ((mots[0]?.[0] ?? '') + (mots[1]?.[0] ?? '')).toUpperCase();
  }

  statut(r: any): { classe: string; libelle: string } {
    if (r.fiches_semestre === 0) return { classe: 'statut-neutre', libelle: 'Aucune fiche' };
    if (r.telechargements_semestre > 0) return { classe: 'statut-succes', libelle: 'Récupérée' };
    return { classe: 'statut-alerte', libelle: 'Non récupérée' };
  }

  // ===== Sélection =====

  basculerLigne(id: number) {
    const suivante = new Set(this.selection());
    if (suivante.has(id)) suivante.delete(id);
    else suivante.add(id);
    this.selection.set(suivante);
  }

  basculerTout() {
    const ids = this.residents().map((r) => r.id);
    this.selection.set(this.toutSelectionne() ? new Set() : new Set(ids));
  }

  viderSelection() {
    this.selection.set(new Set());
  }

  // ===== Export =====

  exporter(seulementSelection = false) {
    this.export.set(true);
    const { page, limit, ...filtres } = this.requete();
    const parametres: FiltresResidents = seulementSelection ? { ids: [...this.selection()].join(',') } : filtres;
    this.api.exporterResidents(parametres).subscribe({
      next: (blob) => {
        this.export.set(false);
        enregistrerFichier(blob, `residents-${new Date().toISOString().slice(0, 10)}.xlsx`);
        const nb = seulementSelection ? this.selection().size : this.total();
        this.toast.succes(`${nb} résident(s) exporté(s) en Excel.`);
      },
      error: () => {
        this.export.set(false);
        this.toast.erreur("L'export Excel a échoué.");
      }
    });
  }

  // ===== Suppression =====

  demanderSuppression(residents: any[]) {
    this.suppression.set(residents);
  }

  supprimerSelection() {
    const ids = this.selection();
    this.demanderSuppression(this.residents().filter((r) => ids.has(r.id)));
  }

  messageSuppression(liste: any[]): string {
    if (liste.length === 1) {
      return `${liste[0].nom_prenom} et ses ${liste[0].nb_fiches} fiche(s) seront supprimés définitivement. L'action reste visible dans le journal.`;
    }
    const fiches = liste.reduce((s, r) => s + Number(r.nb_fiches || 0), 0);
    return `${liste.length} résidents et leurs ${fiches} fiche(s) seront supprimés définitivement. Chaque suppression reste visible dans le journal.`;
  }

  supprimer() {
    const liste = this.suppression();
    if (!liste?.length) return;
    this.suppressionEnCours.set(true);
    forkJoin(liste.map((r) => this.api.deleteResident(r.id).pipe(map(() => true), catchError(() => of(false)))))
      .subscribe((resultats) => {
        const reussies = resultats.filter(Boolean).length;
        this.suppressionEnCours.set(false);
        this.suppression.set(null);
        this.selection.set(new Set());
        if (reussies === liste.length) this.toast.succes(reussies === 1 ? 'Résident supprimé.' : `${reussies} résidents supprimés.`);
        else this.toast.erreur(`${liste.length - reussies} suppression(s) ont échoué sur ${liste.length}.`);
        this.charger();
      });
  }
}
