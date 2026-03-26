import { Component, ChangeDetectorRef, DestroyRef, inject, OnInit, PLATFORM_ID } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../services/api';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { environment } from '../../environments/environment';

@Component({
    selector: 'app-admin-search',
    standalone: true,
    imports: [FormsModule, CommonModule],
    templateUrl: './admin-search.html',
    styleUrls: ['../admin-dashboard/admin-dashboard.css']
})
export class AdminSearch implements OnInit {
    private cdr = inject(ChangeDetectorRef);
    private destroyRef = inject(DestroyRef);
    private platformId = inject(PLATFORM_ID);

    cinRecherche: string = '';
    donneesResident: any = null;
    messageSucces: string = '';
    messageErreur: string = '';

    specialites: string[] = [];
    periodes: string[] = ['S1', 'S2', 'T1', 'T2', 'T3', 'T4', 'R1', 'R2'];
    facultes: string[] = ['FMSfax', 'FMSousse', 'FMMonastir', 'FMTunis', 'Autre'];

    editResident: any = { cin: '', nom_prenom: '', niveau: 1, faculte_origine: '' };

    nouveauStage: any = {
        periode: 'S1',
        annee: new Date().getFullYear(),
        hopital: '',
        service: ''
    };

    isGeneratingPdf: boolean = false;
    isAddingStage: boolean = false;
    stageAjoute: boolean = false;

    constructor(
        private apiService: ApiService,
        private http: HttpClient,
        private router: Router,
        private route: ActivatedRoute
    ) { }

    ngOnInit() {
        if (!isPlatformBrowser(this.platformId)) return;
        this.apiService.getSpecialites().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(data => {
            this.specialites = data;
            this.cdr.markForCheck();
        });

        // UX : Si on vient de "Ajouter un résident", on a le CIN dans l'URL
        this.route.queryParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
            if (params['cin']) {
                this.cinRecherche = params['cin'];
                this.chercherResident();
            }
        });
    }

    chercherResident() {
        this.messageSucces = '';
        this.messageErreur = '';
        this.donneesResident = null;
        this.stageAjoute = false;

        if (!this.cinRecherche) return;

        this.apiService.getResidentByCin(this.cinRecherche)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (data) => {
                    this.donneesResident = data;
                    this.editResident = {
                        cin: data.cin,
                        nom_prenom: data.nom_prenom,
                        niveau: data.niveau || 1,
                        faculte_origine: data.faculte_origine || 'FMSfax'
                    };
                    this.cdr.markForCheck();
                },
                error: (err) => {
                    if (err.status === 404) {
                        this.messageErreur = "Résident introuvable. Utilisez « Ajouter un résident » pour le créer.";
                    } else {
                        this.messageErreur = err.error?.message || "Erreur de connexion au serveur.";
                    }
                    this.cdr.markForCheck();
                }
            });
    }

    mettreAJourResident() {
        this.messageSucces = '';
        this.messageErreur = '';

        this.apiService.updateResident(this.donneesResident.id, this.editResident)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (res) => {
                    this.messageSucces = res.message || "Résident mis à jour.";
                    this.donneesResident.cin = this.editResident.cin;
                    this.donneesResident.nom_prenom = this.editResident.nom_prenom;
                    this.donneesResident.niveau = this.editResident.niveau;
                    this.donneesResident.faculte_origine = this.editResident.faculte_origine;
                    this.cinRecherche = this.editResident.cin;
                    this.cdr.markForCheck();
                },
                error: (err) => {
                    this.messageErreur = err.error?.message || "Erreur lors de la mise à jour.";
                    this.cdr.markForCheck();
                }
            });
    }

    sauvegarderFiche(fiche: any) {
        this.messageSucces = '';
        this.messageErreur = '';

        this.apiService.updateFiche(fiche.id, {
            periode: fiche.periode,
            annee: fiche.annee,
            service: fiche.service,
            hopital: fiche.hopital,
            url_pdf: fiche.url_pdf || fiche.url || ''
        }).pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: () => {
                    this.messageSucces = `La fiche de la période ${fiche.periode} a été mise à jour !`;
                    this.cdr.markForCheck();
                },
                error: (err) => {
                    this.messageErreur = err.error?.message || "Erreur lors de la sauvegarde.";
                    this.cdr.markForCheck();
                }
            });
    }

    apercuNouveauStage() {
        this.messageSucces = '';
        this.messageErreur = '';
        this.isGeneratingPdf = true;

        const payload = {
            resident: {
                nom_prenom: this.donneesResident.nom_prenom,
                specialite: this.donneesResident.specialite,
                niveau: this.donneesResident.niveau,
                promotion: this.donneesResident.promotion
            },
            fiche: {
                periode: this.nouveauStage.periode,
                annee: this.nouveauStage.annee,
                hopital: this.nouveauStage.hopital,
                service: this.nouveauStage.service
            }
        };

        this.http.post(`${environment.apiUrl}/generate-pdf`, payload, { responseType: 'blob' })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (blob: Blob) => {
                    this.isGeneratingPdf = false;
                    const urlFichier = window.URL.createObjectURL(blob);
                    window.open(urlFichier, '_blank');
                    this.cdr.markForCheck();
                },
                error: () => {
                    this.isGeneratingPdf = false;
                    this.messageErreur = "Erreur lors de la génération de l'aperçu.";
                    this.cdr.markForCheck();
                }
            });
    }

    validerNouveauStage() {
        this.messageSucces = '';
        this.messageErreur = '';
        this.isAddingStage = true;

        const data = {
            resident_id: this.donneesResident.id,
            periode: this.nouveauStage.periode,
            annee: this.nouveauStage.annee,
            service: this.nouveauStage.service,
            hopital: this.nouveauStage.hopital
        };

        this.apiService.createFiche(data)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (res) => {
                    this.isAddingStage = false;
                    this.stageAjoute = true;
                    this.messageSucces = res.message || "Stage ajouté avec succès.";
                    this.chercherResident();
                    this.nouveauStage = { periode: 'S1', annee: new Date().getFullYear(), hopital: '', service: '' };
                    this.cdr.markForCheck();
                },
                error: (err) => {
                    this.isAddingStage = false;
                    this.messageErreur = err.error?.message || "Erreur lors de l'ajout du stage.";
                    this.cdr.markForCheck();
                }
            });
    }

    ajouterAutreStage() {
        this.stageAjoute = false;
        this.messageSucces = '';
        this.nouveauStage = { periode: 'S1', annee: new Date().getFullYear(), hopital: '', service: '' };
    }

    rechercherAutreResident() {
        this.stageAjoute = false;
        this.donneesResident = null;
        this.messageSucces = '';
        this.messageErreur = '';
        this.cinRecherche = '';
    }

    apercuPDF(fiche: any) {
        this.messageSucces = '';
        this.messageErreur = '';
        this.isGeneratingPdf = true;

        const payload = {
            resident: {
                nom_prenom: this.donneesResident.nom_prenom,
                specialite: this.donneesResident.specialite,
                niveau: this.donneesResident.niveau,
                promotion: this.donneesResident.promotion
            },
            fiche: {
                periode: fiche.periode,
                annee: fiche.annee,
                hopital: fiche.hopital,
                service: fiche.service
            }
        };

        this.http.post(`${environment.apiUrl}/generate-pdf`, payload, { responseType: 'blob' })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (blob: Blob) => {
                    this.isGeneratingPdf = false;
                    const urlFichier = window.URL.createObjectURL(blob);
                    window.open(urlFichier, '_blank');
                    this.cdr.markForCheck();
                },
                error: () => {
                    this.isGeneratingPdf = false;
                    this.messageErreur = 'Impossible de générer l\'aperçu.';
                    this.cdr.markForCheck();
                }
            });
    }

    telechargerPDF(fiche: any) {
        this.messageSucces = '';
        this.messageErreur = '';
        this.isGeneratingPdf = true;

        const payload = {
            resident: {
                nom_prenom: this.donneesResident.nom_prenom,
                specialite: this.donneesResident.specialite,
                niveau: this.donneesResident.niveau,
                promotion: this.donneesResident.promotion
            },
            fiche: {
                periode: fiche.periode,
                annee: fiche.annee,
                hopital: fiche.hopital,
                service: fiche.service
            }
        };

        this.http.post(`${environment.apiUrl}/generate-pdf`, payload, { responseType: 'blob' })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (blob: Blob) => {
                    this.isGeneratingPdf = false;
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `Validation_${this.donneesResident?.cin}_${fiche.periode}.pdf`;
                    a.click();
                    window.URL.revokeObjectURL(url);
                    this.cdr.markForCheck();
                },
                error: () => {
                    this.isGeneratingPdf = false;
                    this.messageErreur = 'Impossible de générer le PDF.';
                    this.cdr.markForCheck();
                }
            });
    }

    retour() { this.router.navigate(['/admin/dashboard']); }
}
