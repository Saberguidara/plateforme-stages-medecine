import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, GroupeVariantes, ValeurReferentiel } from '../services/api';
import { AuthService } from '../services/auth';
import { ToastService } from '../services/toast';
import { Confirmation } from '../admin-shared/confirmation';

type TypeReferentiel = 'hopital' | 'service';

interface Fusion {
  sources: string[];
  cible: string;
  nbFiches: number;
}

// Hôpitaux et services tels qu'écrits dans les fiches : repérage des variantes d'écriture
// (fautes de frappe des registres) et fusion sous une seule orthographe.
@Component({
  selector: 'app-admin-referentiels',
  standalone: true,
  imports: [FormsModule, RouterLink, Confirmation],
  templateUrl: './admin-referentiels.html'
})
export class AdminReferentiels implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  readonly peutModifier = inject(AuthService).peutModifier();
  readonly type = signal<TypeReferentiel>('hopital');
  readonly valeurs = signal<ValeurReferentiel[] | null>(null);
  readonly groupes = signal<GroupeVariantes[]>([]);
  readonly erreur = signal(false);
  readonly filtre = signal('');
  readonly selection = signal<Set<string>>(new Set());
  readonly fusion = signal<Fusion | null>(null);
  readonly fusionEnCours = signal(false);

  // Valeur retenue pour chaque groupe proposé, modifiable avant la fusion
  ciblesGroupes: Record<number, string> = {};
  cibleManuelle = '';

  readonly valeursFiltrees = computed(() => {
    const q = this.filtre().trim().toLowerCase();
    const liste = this.valeurs() ?? [];
    return q ? liste.filter((v) => v.valeur.toLowerCase().includes(q)) : liste;
  });

  ngOnInit() {
    this.charger();
  }

  changerType(type: TypeReferentiel) {
    if (type === this.type()) return;
    this.type.set(type);
    this.filtre.set('');
    this.charger();
  }

  libelleType() {
    return this.type() === 'hopital' ? 'hôpital' : 'service';
  }

  charger() {
    this.erreur.set(false);
    this.valeurs.set(null);
    this.selection.set(new Set());
    this.cibleManuelle = '';
    this.api.getReferentiel(this.type()).subscribe({
      next: (res) => {
        this.valeurs.set(res.valeurs);
        this.groupes.set(res.groupes);
        this.ciblesGroupes = Object.fromEntries(res.groupes.map((g, i) => [i, g.cible]));
      },
      error: () => this.erreur.set(true)
    });
  }

  basculer(valeur: string) {
    const suivante = new Set(this.selection());
    if (suivante.has(valeur)) suivante.delete(valeur);
    else suivante.add(valeur);
    this.selection.set(suivante);
    if (suivante.size === 1 || !suivante.has(this.cibleManuelle)) this.cibleManuelle = [...suivante][0] ?? '';
  }

  private nbFiches(valeurs: string[]) {
    return (this.valeurs() ?? []).filter((v) => valeurs.includes(v.valeur)).reduce((s, v) => s + v.nb_fiches, 0);
  }

  proposerFusionGroupe(index: number) {
    const groupe = this.groupes()[index];
    const cible = (this.ciblesGroupes[index] || '').trim();
    const sources = groupe.variantes.map((v) => v.valeur).filter((v) => v !== cible);
    this.fusion.set({ sources, cible, nbFiches: this.nbFiches(sources) });
  }

  proposerFusionSelection() {
    const cible = this.cibleManuelle.trim();
    const sources = [...this.selection()].filter((v) => v !== cible);
    this.fusion.set({ sources, cible, nbFiches: this.nbFiches(sources) });
  }

  messageFusion(f: Fusion) {
    return `${f.sources.length} écriture(s) seront remplacées par « ${f.cible} » dans ${f.nbFiches} fiche(s) : ${f.sources.map((s) => `« ${s} »`).join(', ')}. `
      + "Les imports concernés ne pourront plus être annulés.";
  }

  fusionner() {
    const f = this.fusion();
    if (!f) return;
    this.fusionEnCours.set(true);
    this.api.fusionnerReferentiel(this.type(), f.sources, f.cible).subscribe({
      next: (res) => {
        this.fusionEnCours.set(false);
        this.fusion.set(null);
        this.toast.succes(res.message);
        this.charger();
      },
      error: (err) => {
        this.fusionEnCours.set(false);
        this.fusion.set(null);
        this.toast.erreur(err.error?.message || 'La fusion a échoué.');
      }
    });
  }
}
