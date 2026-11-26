import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ResidentForm, ResidentEnregistre } from '../admin-shared/resident-form';

// Création d'un résident : on arrive ensuite directement dans son dossier,
// avec la fenêtre d'ajout du premier stage déjà ouverte si demandé.
@Component({
  selector: 'app-admin-add',
  standalone: true,
  imports: [ResidentForm, RouterLink],
  template: `
    <div class="largeur-page">
      <div class="admin-page-header">
        <h2 class="admin-page-title"><i class="bi bi-person-plus" aria-hidden="true"></i> Nouveau résident</h2>
        <a class="btn pill-btn-outline-dark" routerLink="/admin/residents"><i class="bi bi-arrow-left" aria-hidden="true"></i> Liste des résidents</a>
      </div>
      <div class="row g-4">
        <div class="col-lg-8">
          <div class="card dashboard-card h-100">
            <div class="card-body p-4">
              <app-resident-form (enregistre)="ouvrirDossier($event)" (annule)="retour()"></app-resident-form>
            </div>
          </div>
        </div>
        <aside class="col-lg-4" aria-labelledby="titreEtapes">
          <div class="card dashboard-card h-100">
            <div class="card-body p-4">
              <h3 class="section-titre-page mt-0" id="titreEtapes"><i class="bi bi-signpost-2" aria-hidden="true"></i> Comment ça se passe</h3>
              <ol class="etapes-creation">
                <li><strong>Identité</strong><span>CIN tunisien (8 chiffres) ou passeport. Un numéro déjà inscrit est signalé tout de suite.</span></li>
                <li><strong>Promotion</strong><span>Année d'entrée en 1re année : l'année imprimée sur chaque fiche en est déduite.</span></li>
                <li><strong>E-mail</strong><span>Sans e-mail, le résident ne peut pas se connecter pour récupérer ses fiches.</span></li>
                <li><strong>Stages</strong><span>Le dossier s'ouvre ensuite pour ajouter le premier stage, ou plus tard.</span></li>
              </ol>
              <p class="text-muted small mb-0">Pour toute une promotion, importez plutôt le registre complet : les résidents et leurs fiches sont créés en une fois.
                <a routerLink="/admin/imports">Importer un registre</a></p>
            </div>
          </div>
        </aside>
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
