import { Component, HostListener, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, LIBELLES_MOTIFS, MotifSignalement } from '../services/api';
import { ToastService } from '../services/toast';

export interface SignalementATraiter {
  id: number;
  nom_prenom: string;
  periode: string;
  annee: number;
  motif: MotifSignalement;
  message: string | null;
}

// Fenêtre « Marquer comme traité » : réponse facultative, affichée au résident et envoyée par e-mail.
@Component({
  selector: 'app-traitement-signalement',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="custom-modal-overlay" (click)="fermer()">
      <div class="custom-modal-card fenetre-formulaire" role="dialog" aria-modal="true" aria-labelledby="titreTraitement"
        (click)="$event.stopPropagation()">
        <h3 class="custom-modal-title" id="titreTraitement"><i class="bi bi-check2-circle" aria-hidden="true"></i> Traiter le signalement</h3>
        <p class="text-muted small mb-2">{{ signalement().nom_prenom }} · fiche {{ signalement().periode }} {{ signalement().annee }}</p>
        <div class="signalement-fiche mb-3">
          <i class="bi bi-flag-fill" aria-hidden="true"></i>
          <span><strong>{{ libellesMotifs[signalement().motif] }}</strong>
            @if (signalement().message) { : « {{ signalement().message }} » }</span>
        </div>
        <form (ngSubmit)="valider()" novalidate>
          <label class="form-label text-muted small fw-bold" for="tsReponse">Réponse au résident <span class="fw-normal">(facultatif)</span></label>
          <textarea class="form-control elegant-input" id="tsReponse" name="reponse" rows="3" maxlength="500"
            placeholder="Par exemple : la fiche est corrigée, vous pouvez la télécharger à nouveau." [(ngModel)]="reponse"></textarea>
          <div class="text-muted small text-end chiffres">{{ reponse.length }} / 500</div>
          <p class="text-muted small mb-0">Corrigez d'abord la fiche si besoin. Le résident verra le signalement comme traité, avec votre réponse ;
            s'il a un e-mail, il est aussi prévenu par e-mail.</p>
          <div class="mt-4 d-flex justify-content-end gap-2 flex-wrap">
            <button type="button" class="btn pill-btn-outline-dark px-4" (click)="fermer()" [disabled]="enCours()">Annuler</button>
            <button type="submit" class="btn pill-btn-orange px-4" [disabled]="enCours()">
              @if (enCours()) { <span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span> }
              Marquer comme traité
            </button>
          </div>
        </form>
      </div>
    </div>
  `
})
export class TraitementSignalement {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  readonly signalement = input.required<SignalementATraiter>();
  readonly traite = output<void>();
  readonly annule = output<void>();

  readonly libellesMotifs = LIBELLES_MOTIFS;
  readonly enCours = signal(false);
  reponse = '';

  @HostListener('document:keydown.escape')
  fermer() {
    if (!this.enCours()) this.annule.emit();
  }

  valider() {
    this.enCours.set(true);
    this.api.traiterSignalement(this.signalement().id, this.reponse.trim()).subscribe({
      next: (res) => {
        this.enCours.set(false);
        this.toast.succes(res.message);
        this.traite.emit();
      },
      error: (err) => {
        this.enCours.set(false);
        this.toast.erreur(err.error?.message || "Le signalement n'a pas pu être mis à jour.");
      }
    });
  }
}
