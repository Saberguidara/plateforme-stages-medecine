import { Component, DestroyRef, ChangeDetectorRef, inject, OnInit } from '@angular/core';
import { ApiService } from '../services/api';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';

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

  telechargerPDF(fiche: any, resident: any) {
    if (fiche instanceof Event) {
      fiche.preventDefault();
      // the original code passed event to signature but the template called with telechargerPDF(fiche, donneesResident) ?
      // Wait, let's fix the signature to match the template. I'll just use the old signature logic if needed.
    }
    const payload = {
      resident: resident,
      fiche: fiche
    };

    this.http.post('http://localhost:3000/api/generate-pdf', payload, { responseType: 'blob' })
      .subscribe({
        next: (blob: Blob) => {
          const urlFichier = window.URL.createObjectURL(blob);
          const lien = document.createElement('a');
          lien.href = urlFichier;
          lien.download = `Fiche_${resident.cin}_${fiche.periode}.pdf`;
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