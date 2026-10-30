import { Component, HostListener, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, CompteAdmin } from '../services/api';
import { AuthService } from '../services/auth';
import { ToastService } from '../services/toast';

const MOT_DE_PASSE_MIN = 12;

// Comptes administrateurs nominatifs : rôle « admin » ou « lecture » (consultation seule).
@Component({
  selector: 'app-admin-comptes',
  standalone: true,
  imports: [DatePipe, FormsModule],
  templateUrl: './admin-comptes.html'
})
export class AdminComptes implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  readonly monId = inject(AuthService).idAdmin();
  readonly minimum = MOT_DE_PASSE_MIN;
  readonly comptes = signal<CompteAdmin[] | null>(null);
  readonly erreur = signal(false);
  readonly enCours = signal<number | 'creation' | null>(null);
  readonly creation = signal(false);
  readonly motDePasse = signal<CompteAdmin | null>(null);

  nouveau = { login: '', nom: '', mot_de_passe: '', role: 'lecture' };
  nouveauMotDePasse = '';

  ngOnInit() {
    this.charger();
  }

  charger() {
    this.erreur.set(false);
    this.api.getComptes().subscribe({
      next: (liste) => this.comptes.set(liste),
      error: () => this.erreur.set(true)
    });
  }

  private modifier(c: CompteAdmin, donnees: Parameters<ApiService['modifierCompte']>[1], apres?: () => void) {
    this.enCours.set(c.id);
    this.api.modifierCompte(c.id, donnees).subscribe({
      next: (res) => {
        this.enCours.set(null);
        this.toast.succes(res.message);
        apres?.();
        this.charger();
      },
      error: (err) => {
        this.enCours.set(null);
        this.toast.erreur(err.error?.message || "Le compte n'a pas pu être modifié.");
        this.charger();
      }
    });
  }

  changerRole(c: CompteAdmin, role: string) {
    this.modifier(c, { role });
  }

  basculerActif(c: CompteAdmin) {
    this.modifier(c, { actif: !c.actif });
  }

  ouvrirCreation() {
    this.nouveau = { login: '', nom: '', mot_de_passe: '', role: 'lecture' };
    this.creation.set(true);
  }

  creationValide() {
    return /^[a-z0-9._-]{3,50}$/.test(this.nouveau.login.trim().toLowerCase()) && this.nouveau.mot_de_passe.length >= MOT_DE_PASSE_MIN;
  }

  creer() {
    if (!this.creationValide()) return;
    this.enCours.set('creation');
    this.api.creerCompte({ ...this.nouveau, login: this.nouveau.login.trim().toLowerCase() }).subscribe({
      next: (res) => {
        this.enCours.set(null);
        this.creation.set(false);
        this.toast.succes(res.message);
        this.charger();
      },
      error: (err) => {
        this.enCours.set(null);
        this.toast.erreur(err.error?.message || "Le compte n'a pas pu être créé.");
      }
    });
  }

  ouvrirMotDePasse(c: CompteAdmin) {
    this.nouveauMotDePasse = '';
    this.motDePasse.set(c);
  }

  changerMotDePasse() {
    const c = this.motDePasse();
    if (!c || this.nouveauMotDePasse.length < MOT_DE_PASSE_MIN) return;
    this.modifier(c, { mot_de_passe: this.nouveauMotDePasse }, () => this.motDePasse.set(null));
  }

  @HostListener('document:keydown.escape')
  fermer() {
    this.creation.set(false);
    this.motDePasse.set(null);
  }
}
