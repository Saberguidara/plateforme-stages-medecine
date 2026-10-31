import { Component, inject } from '@angular/core';
import { ReveilServeurService } from '../services/reveil-serveur';

@Component({
  selector: 'app-reveil',
  standalone: true,
  template: `
    <div aria-live="polite">
      @if (reveil.enAttente()) {
        <div class="reveil-bandeau" role="status">
          <span class="reveil-roue" aria-hidden="true"></span>
          <span><strong>Démarrage du serveur…</strong> La plateforme se réveille, cela peut prendre jusqu'à une minute.</span>
        </div>
      }
    </div>
  `
})
export class Reveil {
  reveil = inject(ReveilServeurService);
}
