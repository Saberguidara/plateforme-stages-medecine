import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService, LIBELLES_MOTIFS, Signalement, Statistiques } from '../services/api';
import { AuthService } from '../services/auth';
import { ToastService } from '../services/toast';
import { libelleNiveau } from '../services/residanat';

// Tableau de bord : chaque chiffre ouvre la liste des résidents correspondante.
@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [RouterLink, DatePipe],
  templateUrl: './admin-dashboard.html'
})
export class AdminDashboard implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  readonly peutModifier = inject(AuthService).peutModifier();

  readonly stats = signal<Statistiques | null>(null);
  readonly erreur = signal(false);
  readonly libelleNiveau = libelleNiveau;
  readonly tuilesChargement = [1, 2, 3, 4];
  readonly libellesMotifs = LIBELLES_MOTIFS;
  readonly signalements = signal<Signalement[]>([]);
  readonly traitementEnCours = signal<number | null>(null);

  ngOnInit() {
    this.charger();
  }

  charger() {
    this.erreur.set(false);
    this.stats.set(null);
    this.api.getStatistiques().subscribe({
      next: (s) => this.stats.set(s),
      error: () => this.erreur.set(true)
    });
    this.chargerSignalements();
  }

  // Les erreurs signalées par les résidents restent affichées tant qu'elles ne sont pas traitées.
  chargerSignalements() {
    this.api.getSignalements().subscribe({
      next: (liste) => this.signalements.set(liste),
      error: () => this.signalements.set([])
    });
  }

  traiter(s: Signalement) {
    this.traitementEnCours.set(s.id);
    this.api.traiterSignalement(s.id).subscribe({
      next: () => {
        this.traitementEnCours.set(null);
        this.signalements.update((liste) => liste.filter((x) => x.id !== s.id));
        this.toast.succes('Signalement marqué comme traité.');
      },
      error: (err) => {
        this.traitementEnCours.set(null);
        this.toast.erreur(err.error?.message || "Le signalement n'a pas pu être mis à jour.");
      }
    });
  }

  pourcentage(n: number, total: number): number {
    return total > 0 ? Math.round((n / total) * 100) : 0;
  }
}
