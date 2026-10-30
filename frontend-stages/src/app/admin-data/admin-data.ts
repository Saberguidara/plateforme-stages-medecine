import { Component, ChangeDetectorRef, DestroyRef, inject, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ApiService } from '../services/api';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ToastService } from '../services/toast';

@Component({
    selector: 'app-admin-data',
    standalone: true,
    imports: [FormsModule, CommonModule, RouterLink],
    templateUrl: './admin-data.html',
    styleUrls: ['../admin-dashboard/admin-dashboard.css']
})
export class AdminData implements OnInit {
    private cdr = inject(ChangeDetectorRef);
    private destroyRef = inject(DestroyRef);
    private toast = inject(ToastService);

    residents: any[] = [];
    specialites: string[] = [];
    facultes: string[] = ['FMSfax', 'FMSousse', 'FMMonastir', 'FMTunis', 'Autre'];

    searchText: string = '';
    filterSpecialite: string = '';
    filterPromo: string = '';
    filterEmail: string = '';
    sansEmail: number = 0;
    isLoading: boolean = true;
    readonly lignesChargement = [1, 2, 3, 4, 5, 6];
    readonly colonnes = [
        { cle: 'cin', libelle: 'CIN' },
        { cle: 'nom_prenom', libelle: 'Nom et Prénom' },
        { cle: 'specialite', libelle: 'Spécialité' },
        { cle: 'faculte_origine', libelle: 'Faculté' },
        { cle: 'promotion', libelle: 'Promo' },
        { cle: 'nb_fiches', libelle: 'Stages' }
    ];
    promos: number[] = [];
    
    sortCol: string = '';
    sortDesc: boolean = false;

    page: number = 1;
    limit: number = 20;
    total: number = 0;
    Math = Math;

    expandedId: number | null = null;
    expandedFiches: any[] = [];
    editingResident: any = null;
    periodes: string[] = ['S1', 'S2', 'T1', 'T2', 'T3', 'T4', 'R1', 'R2'];

    constructor(private apiService: ApiService, private router: Router) { }

    ngOnInit() {
        this.charger();
        this.apiService.getSpecialites().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: (data) => { this.specialites = data; this.cdr.markForCheck(); },
            error: () => { }
        });
        this.apiService.getPromotions().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: (data) => { this.promos = data; this.cdr.markForCheck(); },
            error: () => { }
        });
    }

    charger(resetPage = false) {
        if (resetPage) this.page = 1;
        this.isLoading = true;
        this.apiService.getAllResidents(this.page, this.limit, this.searchText, this.filterSpecialite, this.filterPromo, this.sortCol, this.sortDesc, this.filterEmail)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (res) => {
                    this.residents = res.data;
                    this.total = res.total;
                    this.sansEmail = res.sansEmail ?? 0;
                    this.isLoading = false;
                    this.cdr.markForCheck();
                },
                error: () => {
                    this.isLoading = false;
                    this.toast.erreur("Erreur lors du chargement des données.");
                    this.cdr.markForCheck();
                }
            });
    }

    appliquerFiltres() {
        this.charger(true); // Always reset page to 1 when filters change
    }

    get nbPages(): number {
        return Math.max(1, Math.ceil(this.total / this.limit));
    }

    filtresActifs(): boolean {
        return Boolean(this.searchText || this.filterSpecialite || this.filterPromo || this.filterEmail);
    }

    reinitialiserFiltres() {
        this.searchText = '';
        this.filterSpecialite = '';
        this.filterPromo = '';
        this.filterEmail = '';
        this.charger(true);
    }

    basculerFiltreEmail() {
        this.filterEmail = this.filterEmail === 'sans' ? '' : 'sans';
        this.charger(true);
    }

    sortBy(col: string) {
        if (this.sortCol === col) {
            this.sortDesc = !this.sortDesc;
        } else {
            this.sortCol = col;
            this.sortDesc = false;
        }
        this.charger(true);
    }

    nextPage() {
        if (this.page * this.limit < this.total) {
            this.page++;
            this.charger(false);
        }
    }

    prevPage() {
        if (this.page > 1) {
            this.page--;
            this.charger(false);
        }
    }

    toggleExpand(resident: any) {
        if (this.expandedId === resident.id) {
            this.expandedId = null;
            this.expandedFiches = [];
            return;
        }
        this.expandedId = resident.id;
        this.expandedFiches = [];
        this.apiService.getResidentByCin(resident.cin)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (data) => {
                    this.expandedFiches = data.fiches || [];
                    this.cdr.markForCheck();
                },
                error: () => { this.expandedFiches = []; }
            });
    }

    // ===== Édition résident inline =====

    startEditResident(r: any) {
        this.editingResident = {
            id: r.id,
            cin: r.cin,
            nom_prenom: r.nom_prenom,
            email: r.email || '',
            specialite: r.specialite,
            niveau: r.niveau,
            promotion: r.promotion,
            faculte_origine: r.faculte_origine || 'FMSfax'
        };
    }

    cancelEditResident() {
        this.editingResident = null;
    }

    saveEditResident() {
        if (!this.editingResident) return;

        this.apiService.updateResident(this.editingResident.id, this.editingResident)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: () => {
                    this.toast.succes("Résident mis à jour.");
                    this.editingResident = null;
                    this.charger();
                    this.cdr.markForCheck();
                },
                error: (err) => {
                    this.toast.erreur(err.error?.message || "Erreur de mise à jour.");
                    this.cdr.markForCheck();
                }
            });
    }

    // ===== Suppression / Alertes =====

    showConfirmModal: boolean = false;
    confirmTitle: string = '';
    confirmMessage: string = '';
    confirmAction: () => void = () => { };

    demanderSuppressionResident(r: any) {
        this.confirmTitle = "Supprimer ce résident ?";
        this.confirmMessage = `Êtes-vous sûr de vouloir supprimer définitivement ${r.nom_prenom} ainsi que tous ses stages ? Cette action est irréversible.`;
        this.confirmAction = () => this.executerSuppressionResident(r.id);
        this.showConfirmModal = true;
    }

    executerSuppressionResident(id: any) {
        this.showConfirmModal = false;
        this.apiService.deleteResident(id)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: () => {
                    this.toast.succes("Résident supprimé.");
                    this.expandedId = null;
                    this.charger();
                    this.cdr.markForCheck();
                },
                error: (err) => {
                    this.toast.erreur(err.error?.message || "Erreur de suppression.");
                    this.cdr.markForCheck();
                }
            });
    }

    annulerSuppression() {
        this.showConfirmModal = false;
    }

    // ===== Fiches =====

    sauvegarderFiche(fiche: any) {

        this.apiService.updateFiche(fiche.id, {
            periode: fiche.periode,
            annee: fiche.annee,
            service: fiche.service,
            hopital: fiche.hopital,
            url_pdf: fiche.url_pdf || ''
        }).pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: () => {
                    this.toast.succes("Fiche mise à jour.");
                    this.cdr.markForCheck();
                },
                error: (err) => {
                    this.toast.erreur(err.error?.message || "La fiche n'a pas pu être enregistrée.");
                    this.cdr.markForCheck();
                }
            });
    }

    demanderSuppressionFiche(fiche: any) {
        this.confirmTitle = "Supprimer ce stage ?";
        this.confirmMessage = `Êtes-vous sûr de vouloir supprimer la fiche de stage de la période ${fiche.periode} ${fiche.annee} ?`;
        this.confirmAction = () => this.executerSuppressionFiche(fiche.id);
        this.showConfirmModal = true;
    }

    executerSuppressionFiche(id: any) {
        this.showConfirmModal = false;
        this.apiService.deleteFiche(id)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: () => {
                    this.toast.succes("Fiche supprimée.");
                    this.expandedFiches = this.expandedFiches.filter((f: any) => f.id !== id);
                    this.charger();
                    this.cdr.markForCheck();
                },
                error: (err) => {
                    this.toast.erreur(err.error?.message || "La fiche n'a pas pu être supprimée.");
                    this.cdr.markForCheck();
                }
            });
    }

    retour() { this.router.navigate(['/admin/dashboard']); }
}
