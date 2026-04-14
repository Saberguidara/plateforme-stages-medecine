import { Component, DestroyRef, ChangeDetectorRef, inject, OnInit } from '@angular/core';
import { ApiService } from '../services/api';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-resident-search',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './resident-search.html',
  styleUrls: ['./resident-search.css']
})
export class ResidentSearchComponent implements OnInit {
  cinRecherche: string = '';
  donneesResident: any = null;
  messageErreur: string = '';
  isGenerating: boolean = false;

  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);
  private http = inject(HttpClient);
  private router = inject(Router);

  constructor(private apiService: ApiService) { }

  ngOnInit() {
    const savedCin = localStorage.getItem('resident_cin');
    if (savedCin) {
      this.cinRecherche = savedCin;
      this.chercher();
    }
  }

  logout() {
    localStorage.removeItem('resident_token');
    localStorage.removeItem('resident_cin');
    this.router.navigate(['/login']);
  }

  /** Convertit la valeur brute de niveau en texte lisible */
  niveauLabel(niveau: any): string {
    if (niveau === 'Rattrapage') return 'Stage de rattrapage';
    if (niveau === 'Revalidation') return 'Stage de revalidation';
    const n = parseInt(niveau);
    if (!n || isNaN(n)) return 'Niveau non défini';
    if (n === 1) return '1ère Année';
    return `${n}ème Année`;
  }

  getAnneeResidanat(fiche: any, resident: any): string {
    const annee = parseInt(fiche.annee);
    const promotion = parseInt(resident.promotion);
    if (!annee || !promotion || isNaN(annee) || isNaN(promotion)) {
      // Fallback sur le niveau statique du résident
      return this.niveauLabel(resident.niveau);
    }
    const n = annee - promotion + 1;
    if (n <= 0) return '-';
    if (n === 1) return '1ère année';
    return `${n}ème année`;
  }

  chercher() {
    this.messageErreur = '';
    this.donneesResident = null;
    if (!this.cinRecherche) return;

    this.apiService.getResidentByCin(this.cinRecherche)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          if (data && data.fiches) {
            const periodeOrder: Record<string, number> = { T1: 1, T2: 2, S1: 3, T3: 4, T4: 5, S2: 6, R1: 7, R2: 8 };
            data.fiches.sort((a: any, b: any) => {
              const anneeA = parseInt(a.annee) || 0;
              const anneeB = parseInt(b.annee) || 0;
              if (anneeA !== anneeB) return anneeA - anneeB;
              const orderA = periodeOrder[a.periode] ?? 99;
              const orderB = periodeOrder[b.periode] ?? 99;
              return orderA - orderB;
            });
          }
          this.donneesResident = data;
          this.cdr.markForCheck();
        },
        error: (err) => {
          if (err.status === 404) {
            this.messageErreur = "Aucun résident trouvé avec ce CIN.";
          } else {
            this.messageErreur = "Erreur de connexion au serveur.";
          }
          this.cdr.markForCheck();
        }
      });
  }

  /** Appel commun à /api/generate-pdf — token injecté automatiquement par authInterceptor */
  private generatePdf(fiche: any, resident: any): Promise<Blob> {
    const payload = { resident, fiche };
    return new Promise((resolve, reject) => {
      this.http.post(`${environment.apiUrl}/generate-pdf`, payload, {
        responseType: 'blob'
      }).subscribe({ next: resolve, error: reject });
    });
  }

  telechargerPDF(fiche: any, resident: any) {
    this.isGenerating = true;
    this.generatePdf(fiche, resident)
      .then((blob: Blob) => {
        const urlFichier = window.URL.createObjectURL(blob);
        const lien = document.createElement('a');
        lien.href = urlFichier;
        lien.download = `Fiche_${resident.cin}_${fiche.periode}.pdf`;
        lien.click();
        window.URL.revokeObjectURL(urlFichier);
      })
      .catch((err) => {
        console.error("Erreur téléchargement PDF :", err);
        this.messageErreur = "Erreur lors de la génération du document.";
        this.cdr.markForCheck();
      })
      .finally(() => {
        this.isGenerating = false;
        this.cdr.markForCheck();
      });
  }

  apercuPDF(fiche: any, resident: any) {
    this.isGenerating = true;
    this.generatePdf(fiche, resident)
      .then((blob: Blob) => {
        const urlFichier = window.URL.createObjectURL(blob);
        window.open(urlFichier, '_blank');
      })
      .catch((err) => {
        console.error("Erreur aperçu PDF :", err);
        this.messageErreur = "Erreur lors de la génération de l'aperçu.";
        this.cdr.markForCheck();
      })
      .finally(() => {
        this.isGenerating = false;
        this.cdr.markForCheck();
      });
  }
}
