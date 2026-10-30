import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService, ResumeImport } from '../services/api';
import { AuthService } from '../services/auth';
import { ToastService } from '../services/toast';
import { Confirmation } from '../admin-shared/confirmation';
import { JournalListe } from '../admin-shared/journal-liste';

type Onglet = 'imports' | 'journal';

// Historique des imports (avec annulation contrôlée) et journal de toutes les actions.
@Component({
  selector: 'app-admin-historique',
  standalone: true,
  imports: [DatePipe, RouterLink, Confirmation, JournalListe],
  templateUrl: './admin-historique.html'
})
export class AdminHistorique implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly peutModifier = inject(AuthService).peutModifier();
  readonly onglet = signal<Onglet>('imports');
  readonly imports = signal<ResumeImport[] | null>(null);
  readonly erreur = signal(false);
  readonly aAnnuler = signal<ResumeImport | null>(null);
  readonly annulationEnCours = signal(false);
  readonly versionJournal = signal(0);
  readonly entite = signal('');

  readonly filtresJournal = [
    { valeur: '', libelle: 'Toutes les actions' },
    { valeur: 'resident', libelle: 'Résidents' },
    { valeur: 'fiche', libelle: 'Fiches' },
    { valeur: 'import', libelle: 'Imports' },
    { valeur: 'referentiel', libelle: 'Hôpitaux et services' },
    { valeur: 'administrateur', libelle: 'Comptes' }
  ];

  ngOnInit() {
    if (this.route.snapshot.queryParamMap.get('onglet') === 'journal') this.onglet.set('journal');
    this.charger();
  }

  changerOnglet(onglet: Onglet) {
    this.onglet.set(onglet);
    this.router.navigate([], { relativeTo: this.route, queryParams: { onglet: onglet === 'journal' ? 'journal' : null }, replaceUrl: true });
  }

  charger() {
    this.erreur.set(false);
    this.imports.set(null);
    this.api.getImports().subscribe({
      next: (liste) => this.imports.set(liste),
      error: () => this.erreur.set(true)
    });
  }

  raisonNonAnnulable(i: ResumeImport): string {
    if (i.undone) return 'Import déjà annulé';
    if (i.fiches_modifiees) return `${i.fiches_modifiees} fiche(s) modifiée(s) depuis l'import`;
    return '';
  }

  annuler() {
    const i = this.aAnnuler();
    if (!i) return;
    this.annulationEnCours.set(true);
    this.api.annulerImport(i.id).subscribe({
      next: (res) => {
        this.annulationEnCours.set(false);
        this.aAnnuler.set(null);
        this.toast.succes(res.message || 'Import annulé.');
        this.charger();
        this.versionJournal.update((v) => v + 1);
      },
      error: (err) => {
        this.annulationEnCours.set(false);
        this.aAnnuler.set(null);
        this.toast.erreur(err.error?.message || "L'import n'a pas pu être annulé.");
        this.charger();
      }
    });
  }
}
