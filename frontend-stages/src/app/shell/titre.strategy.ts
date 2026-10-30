import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

// Titre d'onglet par page : « Mes fiches · Plateforme des stages ».
@Injectable({ providedIn: 'root' })
export class TitreStrategy extends TitleStrategy {
  private readonly title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot) {
    const titrePage = this.buildTitle(snapshot);
    this.title.setTitle(titrePage ? `${titrePage} · Plateforme des stages` : 'Plateforme des stages · FMSfax');
  }
}
