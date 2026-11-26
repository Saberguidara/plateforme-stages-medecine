import { Component, ElementRef, HostListener, inject, input, signal, viewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ApiService, EcranVue } from '../services/api';
import { AuthService } from '../services/auth';
import { ToastService } from '../services/toast';
import { VuesService } from '../services/vues';

// « Enregistrer la vue » : nomme l'écran courant avec ses filtres, pour toute l'équipe.
@Component({
  selector: 'app-enregistrer-vue',
  standalone: true,
  host: { class: 'enregistrer-vue' },
  template: `
    @if (peutModifier) {
      <button type="button" class="btn pill-btn-outline-dark" (click)="basculer()" [attr.aria-expanded]="ouvert()"
        [disabled]="!vues.disponible()" [title]="vues.disponible() ? 'Retrouver cet écran et ses filtres en un clic' : 'Fonction pas encore activée sur la base (migration 010)'">
        <i class="bi bi-bookmark-plus" aria-hidden="true"></i> Enregistrer la vue
      </button>
      @if (ouvert()) {
        <form class="enregistrer-vue-panneau" (submit)="enregistrer($event)">
          <label for="nomVue" class="form-label small fw-semibold mb-1">Nom de la vue</label>
          <input #champ id="nomVue" class="form-control form-control-sm" maxlength="80" placeholder="Ex. 3e année sans fiche"
            [value]="nom()" (input)="nom.set($any($event.target).value)" (keydown.escape)="ouvert.set(false)">
          <p class="small text-muted mb-2 mt-1">Visible par toute l'équipe, dans le menu et la palette (Ctrl K).</p>
          <div class="d-flex gap-2 justify-content-end">
            <button type="button" class="btn btn-sm btn-link" (click)="ouvert.set(false)">Annuler</button>
            <button type="submit" class="btn btn-sm pill-btn-dark" [disabled]="!nom().trim() || enCours()">Enregistrer</button>
          </div>
        </form>
      }
    }
  `
})
export class EnregistrerVue {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);
  private hote = inject(ElementRef);
  readonly vues = inject(VuesService);
  readonly peutModifier = inject(AuthService).peutModifier();

  readonly ecran = input.required<EcranVue>();
  readonly ouvert = signal(false);
  readonly nom = signal('');
  readonly enCours = signal(false);
  private readonly champ = viewChild<ElementRef<HTMLInputElement>>('champ');

  constructor() {
    this.vues.charger();
  }

  @HostListener('document:click', ['$event'])
  fermerDehors(e: MouseEvent) {
    if (this.ouvert() && !this.hote.nativeElement.contains(e.target)) this.ouvert.set(false);
  }

  basculer() {
    this.ouvert.set(!this.ouvert());
    if (this.ouvert()) setTimeout(() => this.champ()?.nativeElement.focus());
  }

  enregistrer(e: Event) {
    e.preventDefault();
    const nom = this.nom().trim();
    if (!nom) return;
    const parametres: Record<string, string> = {};
    const params = this.route.snapshot.queryParamMap;
    for (const cle of params.keys) {
      const v = params.get(cle);
      if (v) parametres[cle] = v;
    }
    this.enCours.set(true);
    this.api.creerVue({ nom, ecran: this.ecran(), parametres }).subscribe({
      next: (vue) => {
        this.enCours.set(false);
        this.ouvert.set(false);
        this.nom.set('');
        this.vues.ajouter(vue);
        this.toast.succes(vue.message);
      },
      error: (err) => {
        this.enCours.set(false);
        this.toast.erreur(err.error?.message || "La vue n'a pas pu être enregistrée.");
      }
    });
  }
}
