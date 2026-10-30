import { Injectable, signal } from '@angular/core';

export interface DocumentPdf {
  url: string;
  nomFichier: string;
}

// Aperçu d'une fiche dans la page, à la place d'un nouvel onglet (bloqué sur iPhone).
@Injectable({ providedIn: 'root' })
export class PdfViewerService {
  readonly document = signal<DocumentPdf | null>(null);

  ouvrir(blob: Blob, nomFichier: string) {
    this.fermer();
    this.document.set({ url: URL.createObjectURL(blob), nomFichier });
  }

  fermer() {
    const actuel = this.document();
    if (actuel) URL.revokeObjectURL(actuel.url);
    this.document.set(null);
  }

  telecharger() {
    const actuel = this.document();
    if (!actuel) return;
    const lien = document.createElement('a');
    lien.href = actuel.url;
    lien.download = actuel.nomFichier;
    lien.click();
  }
}
