import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ResidentForm, ResidentEnregistre } from '../admin-shared/resident-form';

// Création d'un résident : on arrive ensuite directement dans son dossier,
// avec la fenêtre d'ajout du premier stage déjà ouverte si demandé.
@Component({
  selector: 'app-admin-add',
  standalone: true,
  imports: [ResidentForm],
  template: `
    <div class="largeur-formulaire">
      <div class="admin-page-header">
        <h2 class="admin-page-title"><i class="bi bi-person-plus" aria-hidden="true"></i> Nouveau résident</h2>
      </div>
      <div class="card dashboard-card">
        <div class="card-body p-4">
          <p class="text-muted mb-4">Le dossier s'ouvrira ensuite pour y ajouter les stages. L'année imprimée sur chaque fiche
            est calculée à partir de la promotion.</p>
          <app-resident-form (enregistre)="ouvrirDossier($event)" (annule)="retour()"></app-resident-form>
        </div>
      </div>
    </div>
  `
})
export class AdminAdd {
  private router = inject(Router);

  ouvrirDossier(r: ResidentEnregistre) {
    this.router.navigate(['/admin/residents', r.id], { queryParams: r.premierStage ? { premierStage: 1 } : {} });
  }

  retour() {
    this.router.navigate(['/admin/residents']);
  }
}
