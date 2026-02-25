import { Component, DestroyRef, ChangeDetectorRef, inject } from '@angular/core';
import { ApiService } from '../services/api';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-resident-search',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './resident-search.html',
  styleUrls: ['./resident-search.css']
})
export class ResidentSearchComponent {
  cinRecherche: string = '';
  donneesResident: any = null;
  messageErreur: string = '';
  
  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);
  private http = inject(HttpClient);

  constructor(private apiService: ApiService) {}

  chercher() {
    this.messageErreur = '';
    this.donneesResident = null;

    if (!this.cinRecherche) {
      console.log('[ResidentSearch] CIN is empty');
      return;
    }

    const searchStart = performance.now();
    console.log('[ResidentSearch] Searching for CIN:', this.cinRecherche);
    
    this.apiService.getResidentByCin(this.cinRecherche)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          const searchEnd = performance.now();
          console.log(`[ResidentSearch] Found resident in ${searchEnd - searchStart}ms:`, data);
          this.donneesResident = data;
          this.cdr.markForCheck();
        },
        error: (err) => {
          const searchEnd = performance.now();
          console.error(`[ResidentSearch] Error after ${searchEnd - searchStart}ms:`, err);
          if (err.status === 404) {
            this.messageErreur = "Aucun résident trouvé avec ce CIN.";
          } else {
            this.messageErreur = "Erreur de connexion au serveur.";
          }
          this.cdr.markForCheck();
        }
      });
  }
telechargerPDF(fiche: any, event: Event) {
    event.preventDefault();
    
    // On prépare le colis pour le Backend
    const payload = {
      resident: this.donneesResident,
      fiche: fiche
    };

    // On fait l'appel HTTP en précisant qu'on attend un fichier (blob) en retour
    this.http.post('http://localhost:3000/api/generate-pdf', payload, { responseType: 'blob' })
      .subscribe({
        next: (blob: Blob) => {
          // Téléchargement propre du fichier reçu
          const urlFichier = window.URL.createObjectURL(blob);
          const lien = document.createElement('a');
          lien.href = urlFichier;
          lien.download = `Fiche_${this.donneesResident.cin}_${fiche.periode}.pdf`;
          lien.click();
          window.URL.revokeObjectURL(urlFichier);
        },
        error: (erreur) => {
          console.error("Erreur serveur :", erreur);
          alert("Erreur lors de la génération du document côté serveur.");
        }
      });
  }
}