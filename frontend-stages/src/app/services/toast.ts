import { Injectable, signal } from '@angular/core';

export type TypeToast = 'succes' | 'erreur' | 'info';

export interface Toast {
  id: number;
  texte: string;
  type: TypeToast;
}

// Notifications discrètes en bas de l'écran, qui se ferment seules.
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private prochainId = 0;

  succes(texte: string) { this.afficher(texte, 'succes'); }
  erreur(texte: string) { this.afficher(texte, 'erreur', 7000); }
  info(texte: string) { this.afficher(texte, 'info'); }

  fermer(id: number) {
    this.toasts.update((liste) => liste.filter((t) => t.id !== id));
  }

  private afficher(texte: string, type: TypeToast, duree = 4500) {
    if (!texte) return;
    const id = ++this.prochainId;
    this.toasts.update((liste) => [...liste.slice(-2), { id, texte, type }]);
    setTimeout(() => this.fermer(id), duree);
  }
}
