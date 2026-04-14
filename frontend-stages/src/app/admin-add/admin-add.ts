import { Component, ChangeDetectorRef, DestroyRef, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ApiService } from '../services/api';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
    selector: 'app-admin-add',
    standalone: true,
    imports: [FormsModule, CommonModule],
    templateUrl: './admin-add.html',
    styleUrls: ['../admin-dashboard/admin-dashboard.css']
})
export class AdminAdd implements OnInit {
    private cdr = inject(ChangeDetectorRef);
    private destroyRef = inject(DestroyRef);

    specialites: string[] = [];
    periodes: string[] = ['S1', 'S2', 'T1', 'T2', 'T3', 'T4', 'R1', 'R2'];
    facultes: string[] = ['FMSfax', 'FMSousse', 'FMMonastir', 'FMTunis', 'Autre'];

    messageSucces: string = '';
    messageErreur: string = '';

    nouveauResident: any = {
        cin: '',
        nom_prenom: '',
        specialite: '',
        faculte_origine: 'FMSfax',
        niveau: 1
    };

    isSaving: boolean = false;

    constructor(private apiService: ApiService, private router: Router) { }

    ngOnInit() {
        this.apiService.getSpecialites().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(data => {
            this.specialites = data;
            this.nouveauResident.specialite = data.length ? data[0] : '';
            this.cdr.markForCheck();
        });
    }

    creerResident() {
        this.messageSucces = '';
        this.messageErreur = '';
        this.isSaving = true;

        this.apiService.createResident(this.nouveauResident)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (res) => {
                    this.isSaving = false;
                    this.messageSucces = res.message || "Résident créé avec succès !";
                    // Rediriger vers la page de recherche pour ce CIN afin de lui ajouter des stages
                    setTimeout(() => {
                        this.router.navigate(['/admin/dashboard/search'], { queryParams: { cin: this.nouveauResident.cin } });
                    }, 1500);
                    this.cdr.markForCheck();
                },
                error: (err) => {
                    this.isSaving = false;
                    this.messageErreur = err.error?.message || "Erreur lors de la création.";
                    this.cdr.markForCheck();
                }
            });
    }

    retour() { this.router.navigate(['/admin/dashboard']); }
}
