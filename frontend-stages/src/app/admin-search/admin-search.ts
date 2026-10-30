import { Component, ChangeDetectorRef, DestroyRef, inject, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../services/api';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { environment } from '../../environments/environment';
import { ToastService } from '../services/toast';
import { PdfViewerService } from '../services/pdf-viewer';

@Component({
    selector: 'app-admin-search',
    standalone: true,
    imports: [FormsModule, CommonModule, RouterLink],
    templateUrl: './admin-search.html',
    styleUrls: ['../admin-dashboard/admin-dashboard.css']
})
export class AdminSearch implements OnInit {
    private cdr = inject(ChangeDetectorRef);
    private destroyRef = inject(DestroyRef);
    private toast = inject(ToastService);
    private pdfViewer = inject(PdfViewerService);

    cinRecherche: string = '';
    donneesResident: any = null;
    isSearching: boolean = false;
    introuvable: boolean = false;

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

    // Le serveur relit le résident en base ; seules les infos du stage viennent du formulaire.
    private buildPdfPayload(fiche: { periode: string; annee: number; hopital: string; service: string }) {
        return {
            resident_id: this.donneesResident.id,
            periode: fiche.periode,
            annee: fiche.annee,
            hopital: fiche.hopital,
            service: fiche.service
        };
    }

    ngOnInit() {
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
        this.donneesResident = null;
        this.stageAjoute = false;
        this.introuvable = false;

        if (!this.cinRecherche) return;
        this.isSearching = true;

        this.apiService.getResidentByCin(this.cinRecherche)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (data) => {
                    this.isSearching = false;
                    this.donneesResident = data;
                    // Tous les champs sont renvoyés à la mise à jour : un champ absent serait effacé.
                    this.editResident = {
                        cin: data.cin,
                        nom_prenom: data.nom_prenom,
                        email: data.email || '',
                        specialite: data.specialite,
                        promotion: data.promotion,
                        niveau: data.niveau || 1,
                        faculte_origine: data.faculte_origine || 'FMSfax'
                    };
                    this.cdr.markForCheck();
                },
                error: (err) => {
                    this.isSearching = false;
                    if (err.status === 404) {
                        this.introuvable = true;
                    } else {
                        this.toast.erreur(err.error?.message || "Erreur de connexion au serveur.");
                    }
                    this.cdr.markForCheck();
                }
            });
    }

    mettreAJourResident() {

        this.apiService.updateResident(this.donneesResident.id, this.editResident)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (res) => {
                    this.toast.succes(res.message || "Résident mis à jour.");
                    this.donneesResident.cin = this.editResident.cin;
                    this.donneesResident.nom_prenom = this.editResident.nom_prenom;
                    this.donneesResident.niveau = this.editResident.niveau;
                    this.donneesResident.faculte_origine = this.editResident.faculte_origine;
                    this.donneesResident.email = this.editResident.email;
                    this.cinRecherche = this.editResident.cin;
                    this.cdr.markForCheck();
                },
                error: (err) => {
                    this.toast.erreur(err.error?.message || "Erreur lors de la mise à jour.");
                    this.cdr.markForCheck();
                }
            });
    }

    sauvegarderFiche(fiche: any) {

        this.apiService.updateFiche(fiche.id, {
            periode: fiche.periode,
            annee: fiche.annee,
            service: fiche.service,
            hopital: fiche.hopital,
            url_pdf: fiche.url_pdf || fiche.url || ''
        }).pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: () => {
                    this.toast.succes(`La fiche ${fiche.periode} ${fiche.annee} a été mise à jour.`);
                    this.cdr.markForCheck();
                },
                error: (err) => {
                    this.toast.erreur(err.error?.message || "Erreur lors de la sauvegarde.");
                    this.cdr.markForCheck();
                }
            });
    }

    apercuNouveauStage() {
        this.isGeneratingPdf = true;

        const payload = this.buildPdfPayload(this.nouveauStage);

        this.http.post(`${environment.apiUrl}/admin/apercu-pdf`, payload, { responseType: 'blob' })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (blob: Blob) => {
                    this.isGeneratingPdf = false;
                    this.pdfViewer.ouvrir(blob, this.nomFichier(this.nouveauStage));
                    this.cdr.markForCheck();
                },
                error: () => {
                    this.isGeneratingPdf = false;
                    this.toast.erreur("Erreur lors de la génération de l'aperçu.");
                    this.cdr.markForCheck();
                }
            });
    }

    validerNouveauStage() {
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
                    this.toast.succes(res.message || "Stage ajouté avec succès.");
                    this.chercherResident();
                    this.nouveauStage = { periode: 'S1', annee: new Date().getFullYear(), hopital: '', service: '' };
                    this.cdr.markForCheck();
                },
                error: (err) => {
                    this.isAddingStage = false;
                    this.toast.erreur(err.error?.message || "Erreur lors de l'ajout du stage.");
                    this.cdr.markForCheck();
                }
            });
    }

    ajouterAutreStage() {
        this.stageAjoute = false;
        this.nouveauStage = { periode: 'S1', annee: new Date().getFullYear(), hopital: '', service: '' };
    }

    rechercherAutreResident() {
        this.stageAjoute = false;
        this.donneesResident = null;
        this.cinRecherche = '';
    }

    apercuPDF(fiche: any) {
        this.isGeneratingPdf = true;

        const payload = this.buildPdfPayload(fiche);

        this.http.post(`${environment.apiUrl}/admin/apercu-pdf`, payload, { responseType: 'blob' })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (blob: Blob) => {
                    this.isGeneratingPdf = false;
                    this.pdfViewer.ouvrir(blob, this.nomFichier(fiche));
                    this.cdr.markForCheck();
                },
                error: () => {
                    this.isGeneratingPdf = false;
                    this.toast.erreur('Impossible de générer l\'aperçu.');
                    this.cdr.markForCheck();
                }
            });
    }

    telechargerPDF(fiche: any) {
        this.isGeneratingPdf = true;

        const payload = this.buildPdfPayload(fiche);

        this.http.post(`${environment.apiUrl}/admin/apercu-pdf`, payload, { responseType: 'blob' })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (blob: Blob) => {
                    this.isGeneratingPdf = false;
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = this.nomFichier(fiche);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    this.cdr.markForCheck();
                },
                error: () => {
                    this.isGeneratingPdf = false;
                    this.toast.erreur('Impossible de générer le PDF.');
                    this.cdr.markForCheck();
                }
            });
    }

    private nomFichier(fiche: { periode: string; annee: number }) {
        return `Fiche_${this.donneesResident?.cin}_${fiche.periode}_${fiche.annee}.pdf`;
    }

    retour() { this.router.navigate(['/admin/dashboard']); }
}
