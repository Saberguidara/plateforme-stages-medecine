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

    specialite: string = 'medecine-famille';
    fichierSelectionne: File | null = null;
    messageImport: string = '';
    isImporting: boolean = false;
    rapport: any[] = [];
    bilan: any = null;

    isImportSuccess: boolean = false;
    importUndoData: any = null;

    showConfirmModal: boolean = false;
    confirmTitle: string = '';
    confirmMessage: string = '';
    confirmAction: () => void = () => {};

    constructor(private http: HttpClient, private router: Router) { }

    onFileSelected(event: any) {
        this.fichierSelectionne = event.target.files[0];
    }

    importerExcel() {
        if (!this.fichierSelectionne) {
            this.messageImport = "⚠️ Veuillez d'abord sélectionner un fichier Excel.";
            this.cdr.markForCheck();
            return;
        }

        this.confirmTitle = "Confirmer l'importation";
        this.confirmMessage = `Importer le fichier "${this.fichierSelectionne.name}" ? Le semestre et l'année seront lus dans le fichier.`;
        this.confirmAction = () => this.executerImport();
        this.showConfirmModal = true;
        this.cdr.markForCheck();
    }

    annulerConfirm() {
        this.showConfirmModal = false;
        this.cdr.markForCheck();
    }

    executerImport() {
        this.showConfirmModal = false;
        if (!this.fichierSelectionne) return;

        this.messageImport = "⏳ Importation en cours, veuillez patienter...";
        this.isImporting = true;
        this.rapport = [];
        this.bilan = null;
        this.cdr.markForCheck();

        const formData = new FormData();
        formData.append('fichierExcel', this.fichierSelectionne);
        formData.append('specialite', this.specialite);

        this.http.post<any>(`${environment.apiUrl}/admin/import`, formData)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (res) => {
                    this.isImporting = false;
                    this.messageImport = "✅ " + (res.message || "Importation réussie");
                    this.rapport = res.rapport || [];
                    this.bilan = res.bilan || null;
                    this.importUndoData = { importId: res.importId };
                    this.isImportSuccess = true;
                    this.fichierSelectionne = null;
                    this.cdr.markForCheck();
                },
                error: (err) => {
                    this.isImporting = false;
                    this.messageImport = "❌ " + (err.error?.message || "Erreur lors de l'importation.");
                    this.rapport = err.error?.rapport || [];
                    this.isImportSuccess = false;
                    this.cdr.markForCheck();
                }
            });
    }

    validerImport() {
        this.messageImport = "✅ Import validé définitivement.";
        this.isImportSuccess = false;
        this.importUndoData = null;
        this.cdr.markForCheck();
    }

    annulerImport() {
        if (!this.importUndoData) return;
        this.messageImport = "🔄 Annulation en cours, suppression des données...";
        this.http.post<any>(`${environment.apiUrl}/admin/import/undo`, this.importUndoData)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (res) => {
                    this.messageImport = "✅ " + (res.message || "Importation annulée et données supprimées avec succès.");
                    this.rapport = [];
                    this.bilan = null;
                    this.isImportSuccess = false;
                    this.importUndoData = null;
                    this.cdr.markForCheck();
                },
                error: (err) => {
                    this.messageImport = "⚠️ " + (err.error?.message || "Erreur lors de l'annulation.");
                    this.cdr.markForCheck();
                }
            });
    }

    retour() { this.router.navigate(['/admin/dashboard']); }
}
