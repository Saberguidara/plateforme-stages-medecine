import { Component, ChangeDetectorRef, DestroyRef, inject } from '@angular/core';
import { ApiService } from '../services/api';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './admin-dashboard.html',
  styleUrls: ['./admin-dashboard.css']
})
export class AdminDashboard {
  private cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);
  cinRecherche: string = '';
  donneesResident: any = null;
  messageSucces: string = '';
  messageErreur: string = '';

constructor(private apiService: ApiService, private http: HttpClient, private router: Router) {}

// --- NOUVELLES VARIABLES POUR EXCEL ---
  typeSpecialite: string = 'standard';
  anneeImport: number = new Date().getFullYear();
  semestreImport: string = 'S1';
  fichierSelectionne: File | null = null;
  messageImport: string = '';

  // Méthode quand l'admin choisit un fichier sur son PC
  onFileSelected(event: any) {
    this.fichierSelectionne = event.target.files[0];
  }

  // Méthode pour envoyer le fichier à Node.js
  importerExcel() {
    if (!this.fichierSelectionne) {
      this.messageImport = "Veuillez d'abord sélectionner un fichier Excel.";
      return;
    }

    this.messageImport = "Importation en cours...";
    
    // FormData permet d'envoyer des fichiers (contrairement au JSON classique)
    const formData = new FormData();
    formData.append('fichierExcel', this.fichierSelectionne);
    formData.append('typeSpecialite', this.typeSpecialite);
    formData.append('annee', this.anneeImport.toString());
    formData.append('semestre', this.semestreImport);

    // Ajouter le token JWT en header Authorization
    const token = localStorage.getItem('admin_token');
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }

    this.http.post<any>('http://localhost:3000/api/admin/import', formData, { headers })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.messageImport = "✅ " + (res.message || "Importation réussie");
          this.fichierSelectionne = null;
          this.cdr.markForCheck();
        },
        error: () => {
          this.messageImport = "❌ Erreur lors de l'importation du fichier.";
          this.cdr.markForCheck();
        }
      });
  }

  // Méthode pour se déconnecter
  seDeconnecter() {
    localStorage.removeItem('admin_token');
    this.router.navigate(['/admin']);
  }

  // 1. Chercher le résident pour l'afficher
  chercherResident() {
    this.messageSucces = '';
    this.messageErreur = '';
    this.donneesResident = null;

    if (!this.cinRecherche) return;

    this.apiService.getResidentByCin(this.cinRecherche)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.donneesResident = data;
          this.cdr.markForCheck();
        },
        error: () => {
          this.messageErreur = "Aucun résident trouvé avec ce CIN.";
          this.cdr.markForCheck();
        }
      });
  }

  // 2. Sauvegarder les modifications d'une fiche spécifique
  sauvegarderFiche(fiche: any) {
    this.messageSucces = '';
    this.messageErreur = '';

    // On prépare les données à envoyer au backend Node.js
    const donneesAMettreAJour = {
      periode: fiche.periode,
      service: fiche.service,
      hopital: fiche.hopital,
      url_pdf: fiche.url // On renvoie l'URL existante pour ne pas la perdre
    };

    this.apiService.updateFiche(fiche.id, donneesAMettreAJour)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.messageSucces = `La fiche de la période ${fiche.periode} a été mise à jour !`;
          this.cdr.markForCheck();
        },
        error: () => {
          this.messageErreur = "Erreur lors de la sauvegarde.";
          this.cdr.markForCheck();
        }
      });
  }

  // Télécharger le PDF existant (stocké côté serveur) ou générer s'il n'existe pas
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
      // Pas de fichier stocké, générer localement (si souhaité)
      // On peut réutiliser la même logique que dans ResidentSearchComponent, mais pour garder la responsabilité claire,
      // on demandera à l'admin d'éditer et sauvegarder pour ensuite importer un PDF si nécessaire.
      this.messageErreur = 'Aucun PDF attaché à cette fiche.';
      this.cdr.markForCheck();
    }
  }

  // Select file for a fiche (from file input in UI)
  onFicheFileSelected(fiche: any, event: any) {
    fiche._selectedFile = event.target.files && event.target.files[0] ? event.target.files[0] : null;
  }

  // Upload selected file and attach to fiche
  uploadFicheFile(fiche: any) {
    if (!fiche._selectedFile) {
      this.messageErreur = 'Aucun fichier sélectionné pour cette fiche.';
      this.cdr.markForCheck();
      return;
    }

    const form = new FormData();
    form.append('file', fiche._selectedFile);

    const token = localStorage.getItem('admin_token');
    let headers = new HttpHeaders();
    if (token) headers = headers.set('Authorization', `Bearer ${token}`);

    this.http.post<any>(`http://localhost:3000/api/admin/upload/${fiche.id}`, form, { headers })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          fiche.url_pdf = res.filename;
          fiche._selectedFile = null;
          this.messageSucces = 'Fichier attaché avec succès.';
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('Upload error', err);
          this.messageErreur = 'Erreur lors de l\'upload.';
          this.cdr.markForCheck();
        }
      });
  }
}