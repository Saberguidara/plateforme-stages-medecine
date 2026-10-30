import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService, Statistiques } from '../services/api';
import { AuthService } from '../services/auth';
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
  readonly peutModifier = inject(AuthService).peutModifier();

  readonly stats = signal<Statistiques | null>(null);
  readonly erreur = signal(false);
  readonly libelleNiveau = libelleNiveau;
  readonly tuilesChargement = [1, 2, 3, 4];

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
  }

  pourcentage(n: number, total: number): number {
    return total > 0 ? Math.round((n / total) * 100) : 0;
  }
}
