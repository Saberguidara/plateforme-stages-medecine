import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService, LIBELLES_MOTIFS, NotificationsEnAttente, Signalement, Statistiques } from '../services/api';
import { TraitementSignalement } from '../admin-shared/traitement-signalement';
import { AuthService } from '../services/auth';
import { ToastService } from '../services/toast';
import { libelleNiveau } from '../services/residanat';

// Tableau de bord : chaque chiffre ouvre la liste des résidents correspondante.
@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [RouterLink, DatePipe, TraitementSignalement],
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
  readonly aTraiter = signal<Signalement | null>(null);
  readonly notifications = signal<NotificationsEnAttente | null>(null);
  readonly envoiEnCours = signal(false);

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
    this.chargerNotifications();
  }

  // Les erreurs signalées par les résidents restent affichées tant qu'elles ne sont pas traitées.
  chargerSignalements() {
    this.api.getSignalements().subscribe({
      next: (liste) => this.signalements.set(liste),
      error: () => this.signalements.set([])
    });
  }

  signalementTraite(s: Signalement) {
    this.aTraiter.set(null);
    this.signalements.update((liste) => liste.filter((x) => x.id !== s.id));
  }

  // Fiches du semestre pas encore annoncées par e-mail
  chargerNotifications() {
    this.api.getNotificationsFiches().subscribe({
      next: (n) => this.notifications.set(n),
      error: () => this.notifications.set(null)
    });
  }

  envoyerNotifications() {
    this.envoiEnCours.set(true);
    this.api.envoyerNotificationsFiches().subscribe({
      next: (res) => {
        this.envoiEnCours.set(false);
        if (res.echecs > 0) this.toast.erreur(res.message);
        else this.toast.succes(res.message);
        this.chargerNotifications();
      },
      error: (err) => {
        this.envoiEnCours.set(false);
        this.toast.erreur(err.error?.message || "Les e-mails n'ont pas pu être envoyés.");
      }
    });
  }

  pourcentage(n: number, total: number): number {
    return total > 0 ? Math.round((n / total) * 100) : 0;
  }
}
