// BUG-5 : url_pdf corrigé (fiche.url_pdf au lieu de fiche.url)
// UX-3 : Spinner de chargement pendant la génération PDF
// UX-4 : Affichage du message d'erreur backend (import Excel)
// UX-5 : Confirmation avant import Excel massif
// ARCH-2 : URLs via ApiService (environment.apiUrl)

import { Component, ChangeDetectorRef, DestroyRef, inject, OnInit, PLATFORM_ID } from '@angular/core';
import { ApiService } from '../services/api';
import { FormsModule } from '@angular/forms';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './admin-dashboard.html',
  styleUrls: ['./admin-dashboard.css']
})
export class AdminDashboard implements OnInit {
  private cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);
  private platformId = inject(PLATFORM_ID);

  cinRecherche: string = '';
  donneesResident: any = null;
  messageSucces: string = '';
  messageErreur: string = '';
  showCreationForm: boolean = false;

  // Listes de référence
  specialites: string[] = [];
  periodes: string[] = ['S1', 'S2', 'T1', 'T2', 'T3', 'T4', 'R1', 'R2'];

  // Édition profil résident
  editResident: any = { cin: '', nom_prenom: '', niveau: 1 };

  // Création résident
  nouveauResident: any = {
    cin: '',
    nom_prenom: '',
    specialite: '',
    faculte_origine: '',
    niveau: 1
  };

  // Ajout stage pour résident trouvé
  nouveauStage: any = {
    periode: 'S1',
    annee: new Date().getFullYear(),
    hopital: '',
    service: ''
  };

  // Fiche manuelle (aperçu seul)
  ficheManuelle: any = {
    nom_prenom: '',
    specialite: '',
    niveau: '1',
    hopital: '',
    service: '',
    periode: 'S1',
    annee: new Date().getFullYear()
  };

  // Import Excel
  typeSpecialite: string = 'standard';
  anneeImport: number = new Date().getFullYear();
  semestreImport: string = 'S1';
  fichierSelectionne: File | null = null;
  messageImport: string = '';

  // UX-3 : État de chargement
  isGeneratingPdf: boolean = false;
  isAddingStage: boolean = false;
  stageAjoute: boolean = false;

  constructor(private apiService: ApiService, private http: HttpClient, private router: Router) { }

  ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) return;
    this.chargerSpecialites();
  }

  chargerSpecialites() {
    this.apiService.getSpecialites()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => { this.specialites = data; this.cdr.markForCheck(); },
        error: () => { /* silencieux — liste vide en fallback */ }
      });
  }

  onFileSelected(event: any) {
    this.fichierSelectionne = event.target.files[0];
  }

  importerExcel() {
    if (!this.fichierSelectionne) {
      this.messageImport = "Veuillez d'abord sélectionner un fichier Excel.";
      return;
    }

    // UX-5 : Confirmation avant import massif
    const confirmMsg = `Confirmer l'import du fichier "${this.fichierSelectionne.name}" pour l'année ${this.anneeImport} (${this.semestreImport}) ?`;
    if (!confirm(confirmMsg)) return;

    this.messageImport = "Importation en cours...";

    const formData = new FormData();
    formData.append('fichierExcel', this.fichierSelectionne);
    formData.append('typeSpecialite', this.typeSpecialite);
    formData.append('annee', this.anneeImport.toString());
    formData.append('semestre', this.semestreImport);

    this.http.post<any>(`${environment.apiUrl}/admin/import`, formData)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.messageImport = "✅ " + (res.message || "Importation réussie");
          this.fichierSelectionne = null;
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.messageImport = "❌ " + (err.error?.message || "Erreur lors de l'importation du fichier.");
          this.cdr.markForCheck();
        }
      });
  }

  seDeconnecter() {
    localStorage.removeItem('admin_token');
    this.router.navigate(['/admin']);
  }

  chercherResident() {
    this.messageSucces = '';
    this.messageErreur = '';
    this.donneesResident = null;
    this.showCreationForm = false;

    if (!this.cinRecherche) return;

    this.apiService.getResidentByCin(this.cinRecherche)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.donneesResident = data;
          this.editResident = {
            cin: data.cin,
            nom_prenom: data.nom_prenom,
            niveau: data.niveau || 1
          };
          this.showCreationForm = false;
          this.cdr.markForCheck();
        },
        error: (err) => {
          if (err.status === 404) {
            // Résident inexistant → proposer la création
            this.showCreationForm = true;
            this.nouveauResident = {
              cin: this.cinRecherche,
              nom_prenom: '',
              specialite: this.specialites.length > 0 ? this.specialites[0] : '',
              faculte_origine: '',
              niveau: 1
            };
          } else {
            this.messageErreur = err.error?.message || "Erreur de connexion au serveur.";
          }
          this.cdr.markForCheck();
        }
      });
  }

  // ===== SECTION A : Modifier un résident =====

  mettreAJourResident() {
    this.messageSucces = '';
    this.messageErreur = '';

    this.apiService.updateResident(this.donneesResident.id, this.editResident)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.messageSucces = res.message || "Résident mis à jour.";
          // Mettre à jour les données affichées
          this.donneesResident.cin = this.editResident.cin;
          this.donneesResident.nom_prenom = this.editResident.nom_prenom;
          this.donneesResident.niveau = this.editResident.niveau;
          this.cinRecherche = this.editResident.cin; // si CIN a changé
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.messageErreur = err.error?.message || "Erreur lors de la mise à jour.";
          this.cdr.markForCheck();
        }
      });
  }

  // ===== SECTION B : Sauvegarder une fiche (année éditable) =====

  sauvegarderFiche(fiche: any) {
    this.messageSucces = '';
    this.messageErreur = '';

    const donneesAMettreAJour = {
      periode: fiche.periode,
      annee: fiche.annee,
      service: fiche.service,
      hopital: fiche.hopital,
      url_pdf: fiche.url_pdf || fiche.url || ''
    };

    this.apiService.updateFiche(fiche.id, donneesAMettreAJour)
      .pipe(takeUntilDestroyed(this.destroyRef))
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

  // ===== SECTION C : Ajouter un stage =====

  apercuNouveauStage() {
    this.messageSucces = '';
    this.messageErreur = '';
    this.isGeneratingPdf = true;

    const payload = {
      resident: {
        nom_prenom: this.donneesResident.nom_prenom,
        specialite: this.donneesResident.specialite,
        niveau: this.donneesResident.niveau
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
          // Recharger le dossier pour voir le nouveau stage
          this.chercherResident();
          // Réinitialiser le formulaire
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
    this.showCreationForm = false;
    this.messageSucces = '';
    this.messageErreur = '';
    this.cinRecherche = '';
  }

  // ===== SECTION E : Créer un nouveau résident =====

  creerResident() {
    this.messageSucces = '';
    this.messageErreur = '';

    this.apiService.createResident(this.nouveauResident)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.messageSucces = res.message || "Résident créé.";
          this.showCreationForm = false;
          // Auto-rechercher le CIN pour afficher le dossier
          this.cinRecherche = this.nouveauResident.cin;
          this.chercherResident();
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.messageErreur = err.error?.message || "Erreur lors de la création.";
          this.cdr.markForCheck();
        }
      });
  }

  // ===== SECTION D : Télécharger PDF =====

  telechargerPDF(fiche: any) {
    const fileName = fiche.url_pdf || fiche.url;
    if (fileName) {
      this.apiService.downloadFile(fileName)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (blob) => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Validation_${this.donneesResident?.cin || 'resident'}_${fiche.periode || 'fiche'}.pdf`;
            a.click();
            window.URL.revokeObjectURL(url);
          },
          error: (err) => {
            console.error('Erreur téléchargement PDF:', err);
            this.messageErreur = 'Impossible de télécharger le PDF.';
            this.cdr.markForCheck();
          }
        });
    } else {
      this.messageErreur = 'Aucun PDF attaché à cette fiche.';
      this.cdr.markForCheck();
    }
  }

  // ===== Génération aperçu manuel =====

  genererFicheManuelle() {
    this.messageSucces = '';
    this.messageErreur = '';
    this.isGeneratingPdf = true;

    const payload = {
      resident: {
        nom_prenom: this.ficheManuelle.nom_prenom,
        specialite: this.ficheManuelle.specialite,
        niveau: this.ficheManuelle.niveau
      },
      fiche: {
        periode: this.ficheManuelle.periode,
        annee: this.ficheManuelle.annee,
        hopital: this.ficheManuelle.hopital,
        service: this.ficheManuelle.service
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
        error: (erreur) => {
          this.isGeneratingPdf = false;
          console.error("Erreur génération aperçu manuel:", erreur);
          this.messageErreur = "Erreur lors de la génération de l'aperçu manuel.";
          this.cdr.markForCheck();
        }
      });
  }
}