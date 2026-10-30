import { Component, HostListener, input, output } from '@angular/core';

// Fenêtre de confirmation avant une action irréversible (suppression, annulation d'import, fusion).
@Component({
  selector: 'app-confirmation',
  standalone: true,
  template: `
    <div class="custom-modal-overlay" (click)="annuler.emit()">
      <div class="custom-modal-card" role="alertdialog" aria-modal="true" aria-labelledby="confirmTitre"
        aria-describedby="confirmTexte" (click)="$event.stopPropagation()">
        <i [class]="'bi ' + icone() + ' custom-modal-icon'" aria-hidden="true"></i>
        <h3 class="custom-modal-title" id="confirmTitre">{{ titre() }}</h3>
        <p class="custom-modal-text" id="confirmTexte">{{ message() }}</p>
        <div class="d-flex justify-content-center gap-3 flex-wrap">
          <button type="button" class="btn pill-btn-outline-dark px-4" (click)="annuler.emit()">Annuler</button>
          <button type="button" class="btn px-4" [class.btn-danger-pill]="danger()" [class.pill-btn-orange]="!danger()"
            [disabled]="enCours()" (click)="confirmer.emit()">
            @if (enCours()) { <span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span> }
            {{ libelleConfirmer() }}
          </button>
        </div>
      </div>
    </div>
  `
})
export class Confirmation {
  readonly titre = input.required<string>();
  readonly message = input<string>('');
  readonly libelleConfirmer = input<string>('Confirmer');
  readonly icone = input<string>('bi-exclamation-triangle');
  readonly danger = input<boolean>(true);
  readonly enCours = input<boolean>(false);
  readonly confirmer = output<void>();
  readonly annuler = output<void>();

  @HostListener('document:keydown.escape')
  fermer() {
    if (!this.enCours()) this.annuler.emit();
  }
}
