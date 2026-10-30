import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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

const FILTRES_URL = ['search', 'specialite', 'promo', 'email', 'actifs', 'alerte', 'hopital', 'sortCol', 'sortDesc', 'page'];

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
  readonly lignesChargement = [1, 2, 3, 4, 5, 6];
  readonly colonnes = [
    { cle: 'cin', libelle: 'CIN', classe: '' },
    { cle: 'nom_prenom', libelle: 'Nom et prénom', classe: '' },
    { cle: 'promotion', libelle: 'Promotion', classe: 'd-none d-sm-table-cell' },
    { cle: 'faculte_origine', libelle: 'Faculté', classe: 'd-none d-lg-table-cell' },
    { cle: 'nb_fiches', libelle: 'Stages', classe: 'text-center d-none d-md-table-cell' }
  ];

  readonly residents = signal<any[]>([]);
  readonly total = signal(0);
  readonly sansEmail = signal(0);
  readonly chargement = signal(true);
  readonly export = signal(false);
  readonly specialites = signal<string[]>([]);
  readonly promos = signal<number[]>([]);
  readonly suppression = signal<any | null>(null);
  readonly suppressionEnCours = signal(false);

  filtres = {
    search: '', specialite: '', promo: '', email: '', actifs: '', alerte: '', hopital: '',
    sortCol: '', sortDesc: false, page: 1
  };
  readonly limit = 20;
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
      page: Math.max(1, Number(p.get('page')) || 1)
    };
  }

  private requete(): FiltresResidents {
    return { ...this.filtres, limit: this.limit, sortDesc: this.filtres.sortDesc || undefined };
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
      queryParams[cle] = valeur === '' || valeur === false || (cle === 'page' && valeur === 1) ? null : String(valeur);
    }
    this.router.navigate([], { relativeTo: this.route, queryParams, replaceUrl: true });
  }

  rechercher(texte: string) {
    clearTimeout(this.minuterieRecherche);
    this.minuterieRecherche = setTimeout(() => this.naviguer({ search: texte.trim() }), 300);
  }

  appliquer(cle: 'specialite' | 'promo', valeur: string) {
    this.naviguer({ [cle]: valeur });
  }

  basculerFiltreEmail() {
    this.naviguer({ email: this.filtres.email === 'sans' ? '' : 'sans' });
  }

  retirerFiltre(cle: 'alerte' | 'actifs' | 'hopital') {
    this.naviguer({ [cle]: '' });
  }

  libelleAlerte() {
    return LIBELLES_ALERTES[this.filtres.alerte] ?? '';
  }

  filtresActifs(): boolean {
    const f = this.filtres;
    return Boolean(f.search || f.specialite || f.promo || f.email || f.actifs || f.alerte || f.hopital);
  }

  reinitialiserFiltres() {
    this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
  }

  trierPar(col: string) {
    const desc = this.filtres.sortCol === col ? !this.filtres.sortDesc : false;
    this.naviguer({ sortCol: col, sortDesc: desc });
  }

  get nbPages(): number {
    return Math.max(1, Math.ceil(this.total() / this.limit));
  }

  get premier(): number {
    return (this.filtres.page - 1) * this.limit + 1;
  }

  get dernier(): number {
    return Math.min(this.filtres.page * this.limit, this.total());
  }

  changerPage(pas: number) {
    const page = this.filtres.page + pas;
    if (page >= 1 && page <= this.nbPages) this.naviguer({ page }, false);
  }

  ouvrir(r: any) {
    this.router.navigate(['/admin/residents', r.id]);
  }

  exporter() {
    this.export.set(true);
    const { page, ...filtres } = this.requete();
    this.api.exporterResidents(filtres).subscribe({
      next: (blob) => {
        this.export.set(false);
        enregistrerFichier(blob, `residents-${new Date().toISOString().slice(0, 10)}.xlsx`);
        this.toast.succes(`${this.total()} résident(s) exporté(s) en Excel.`);
      },
      error: () => {
        this.export.set(false);
        this.toast.erreur("L'export Excel a échoué.");
      }
    });
  }

  // ===== Suppression =====

  supprimer() {
    const r = this.suppression();
    if (!r) return;
    this.suppressionEnCours.set(true);
    this.api.deleteResident(r.id).subscribe({
      next: () => {
        this.suppressionEnCours.set(false);
        this.suppression.set(null);
        this.toast.succes('Résident supprimé.');
        this.charger();
      },
      error: (err) => {
        this.suppressionEnCours.set(false);
        this.suppression.set(null);
        this.toast.erreur(err.error?.message || 'Erreur de suppression.');
      }
    });
  }
}
