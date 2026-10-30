import { Component, inject } from '@angular/core';
import { ToastService } from '../services/toast';

@Component({
  selector: 'app-toasts',
  standalone: true,
  template: `
    <div class="toast-zone" aria-live="polite" aria-atomic="false">
      @for (t of toastService.toasts(); track t.id) {
        <div class="toast-item" [class]="'toast-item toast-' + t.type" [attr.role]="t.type === 'erreur' ? 'alert' : 'status'">
          <i [class]="icone(t.type)" aria-hidden="true"></i>
          <span class="toast-texte">{{ t.texte }}</span>
          <button type="button" class="toast-fermer" (click)="toastService.fermer(t.id)" aria-label="Fermer la notification">
            <i class="bi bi-x-lg" aria-hidden="true"></i>
          </button>
        </div>
      }
    </div>
  `
})
export class Toasts {
  toastService = inject(ToastService);

  icone(type: string) {
    return {
      succes: 'bi bi-check-circle-fill',
      erreur: 'bi bi-exclamation-octagon-fill',
      info: 'bi bi-info-circle-fill'
    }[type] || 'bi bi-info-circle-fill';
  }
}
