import { Component, DestroyRef, ChangeDetectorRef, inject, OnInit, PLATFORM_ID } from '@angular/core';
import { ApiService } from '../services/api';
import { FormsModule } from '@angular/forms';
import { CommonModule, isPlatformBrowser } from '@angular/common';
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
  private platformId = inject(PLATFORM_ID);

  constructor(private apiService: ApiService) { }

  ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) return;
    const token = localStorage.getItem('resident_token');
    const savedCin = localStorage.getItem('resident_cin');
    console.log('[MES-STAGES] ngOnInit — token:', token ? token.substring(0, 40) + '...' : 'AUCUN');
    console.log('[MES-STAGES] ngOnInit — cin:', savedCin);
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

  chercher() {
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