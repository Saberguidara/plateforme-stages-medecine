import { Component, ChangeDetectorRef, DestroyRef, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { environment } from '../../environments/environment';

@Component({
    selector: 'app-admin-import',
    standalone: true,
    imports: [FormsModule, CommonModule],
    templateUrl: './admin-import.html',
    styleUrls: ['../admin-dashboard/admin-dashboard.css']
})
export class AdminImport {
    private cdr = inject(ChangeDetectorRef);
    private destroyRef = inject(DestroyRef);

    typeSpecialite: string = 'standard';
    anneeImport: number = new Date().getFullYear();
    semestreImport: string = 'S1';
    fichierSelectionne: File | null = null;
    messageImport: string = '';

    constructor(private http: HttpClient, private router: Router) { }

    onFileSelected(event: any) {
        this.fichierSelectionne = event.target.files[0];
    }

    importerExcel() {
        if (!this.fichierSelectionne) {
            this.messageImport = "Veuillez d'abord sélectionner un fichier Excel.";
            return;
        }

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
                    this.messageImport = "❌ " + (err.error?.message || "Erreur lors de l'importation.");
                    this.cdr.markForCheck();
                }
            });
    }

    retour() { this.router.navigate(['/admin/dashboard']); }
}
