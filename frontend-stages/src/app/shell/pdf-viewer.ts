import { Component, HostListener, inject } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { PdfViewerService } from '../services/pdf-viewer';

@Component({
  selector: 'app-pdf-viewer',
  standalone: true,
  template: `
    @if (viewer.document(); as doc) {
      <div class="pdf-overlay" (click)="viewer.fermer()">
        <div class="pdf-fenetre" [class.pdf-fenetre-compacte]="!apercuPossible" role="dialog" aria-modal="true" aria-labelledby="pdfTitre" (click)="$event.stopPropagation()">
          <div class="pdf-barre">
            <h2 id="pdfTitre" class="pdf-titre"><i class="bi bi-file-earmark-pdf" aria-hidden="true"></i> {{ doc.nomFichier }}</h2>
            <div class="d-flex gap-2">
              @if (apercuPossible) {
                <button type="button" class="btn btn-sm pill-btn-orange" (click)="viewer.telecharger()">
                  <i class="bi bi-download" aria-hidden="true"></i> Télécharger
                </button>
              }
              <button type="button" class="btn btn-sm pill-btn-outline-dark" (click)="viewer.fermer()" aria-label="Fermer l'aperçu">
                <i class="bi bi-x-lg" aria-hidden="true"></i>
              </button>
            </div>
          </div>
          @if (apercuPossible) {
            <iframe class="pdf-cadre" [src]="urlSure(doc.url)" title="Aperçu de la fiche de validation"></iframe>
          } @else {
            <div class="pdf-sans-apercu">
              <i class="bi bi-file-earmark-pdf" aria-hidden="true"></i>
              <p>Ce navigateur ne peut pas afficher la fiche dans la page.<br>Téléchargez-la pour l'ouvrir.</p>
              <button type="button" class="btn pill-btn-orange" (click)="viewer.telecharger()">
                <i class="bi bi-download" aria-hidden="true"></i> Télécharger la fiche
              </button>
            </div>
          }
        </div>
      </div>
    }
  `
})
export class PdfViewer {
  viewer = inject(PdfViewerService);
  private sanitizer = inject(DomSanitizer);
  private cache = new Map<string, unknown>();

  // Chrome sur Android n'affiche pas de PDF dans un iframe (feuille cassée) et l'indique par pdfViewerEnabled = false.
  get apercuPossible() {
    return typeof navigator === 'undefined' || navigator.pdfViewerEnabled !== false;
  }

  // L'URL blob: est créée par l'application elle-même ; on la marque comme sûre une seule fois.
  urlSure(url: string) {
    if (!this.cache.has(url)) {
      this.cache.clear();
      this.cache.set(url, this.sanitizer.bypassSecurityTrustResourceUrl(url));
    }
    return this.cache.get(url);
  }

  @HostListener('document:keydown.escape')
  fermerAuClavier() {
    if (this.viewer.document()) this.viewer.fermer();
  }
}
