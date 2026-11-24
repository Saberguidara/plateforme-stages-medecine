import { Component, computed, input } from '@angular/core';
import { SemaineActivite } from '../services/api';

const FORMAT_JOUR = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

function dateLocale(jour: string): Date {
  const [a, m, j] = jour.split('-').map(Number);
  return new Date(a, m - 1, j);
}

export function libelleSemaine(jour: string): string {
  return FORMAT_JOUR.format(dateLocale(jour));
}

// Maximum « rond » de l'axe et pas des graduations (1, 2 ou 5 × 10^n), pour 4 intervalles au plus.
export function echelle(max: number): { max: number; pas: number } {
  if (max <= 0) return { max: 4, pas: 1 };
  const brut = max / 4;
  const puissance = Math.pow(10, Math.floor(Math.log10(brut)));
  const pas = [1, 2, 5, 10].map((m) => m * puissance).find((p) => p >= brut) ?? 10 * puissance;
  const pasEntier = Math.max(1, Math.round(pas));
  return { max: Math.ceil(max / pasEntier) * pasEntier, pas: pasEntier };
}

// Petite courbe d'évolution, sans axes : la dernière valeur est marquée d'un point.
@Component({
  selector: 'app-sparkline',
  standalone: true,
  template: `
    @if (trace(); as t) {
      <svg class="sparkline" viewBox="0 0 120 32" aria-hidden="true" focusable="false">
        @if (aire()) { <path [attr.d]="t.aire" class="sparkline-aire"></path> }
        <polyline [attr.points]="t.points" class="sparkline-ligne"></polyline>
        <circle [attr.cx]="t.dernier.x" [attr.cy]="t.dernier.y" r="2.6" class="sparkline-point"></circle>
      </svg>
    }
  `
})
export class Sparkline {
  readonly valeurs = input.required<(number | null)[]>();
  readonly aire = input(false);

  readonly trace = computed(() => {
    const valeurs = this.valeurs();
    const connues = valeurs.filter((v): v is number => v !== null);
    if (connues.length < 2) return null;
    const min = Math.min(...connues);
    const max = Math.max(...connues);
    const etendue = max - min || 1;
    const pas = 114 / Math.max(1, valeurs.length - 1);
    const pts = valeurs
      .map((v, i) => (v === null ? null : { x: 3 + i * pas, y: 28 - ((v - min) / etendue) * 24 }))
      .filter((p): p is { x: number; y: number } => p !== null);
    const points = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const premier = pts[0];
    const dernier = pts[pts.length - 1];
    return { points, dernier, aire: `M${premier.x.toFixed(1)},30 L${points.replaceAll(' ', ' L')} L${dernier.x.toFixed(1)},30 Z` };
  });
}

interface Barre {
  x: number;
  y: number;
  hauteur: number;
  centre: number;
  semaine: SemaineActivite;
  info: string;
}

const L = 640;
const H = 190;
const MARGE = { haut: 22, droite: 8, bas: 24, gauche: 34 };

// Téléchargements par semaine ; les semaines où des e-mails « fiche disponible » sont partis sont repérées.
@Component({
  selector: 'app-histogramme-semaines',
  standalone: true,
  template: `
    @if (graphe(); as g) {
      <svg class="graphe" [attr.viewBox]="'0 0 ' + largeur + ' ' + hauteur" role="img" [attr.aria-label]="g.resume">
        @for (t of g.graduations; track t.valeur) {
          <line [attr.x1]="marge.gauche" [attr.x2]="largeur - marge.droite" [attr.y1]="t.y" [attr.y2]="t.y" class="graphe-grille"></line>
          <text [attr.x]="marge.gauche - 6" [attr.y]="t.y + 3.5" text-anchor="end" class="graphe-texte">{{ t.valeur }}</text>
        }
        @for (b of g.barres; track b.semaine.debut) {
          @if (b.semaine.envois > 0) {
            <line [attr.x1]="b.centre" [attr.x2]="b.centre" [attr.y1]="marge.haut - 6" [attr.y2]="hauteur - marge.bas" class="graphe-envoi"></line>
            <path [attr.d]="'M' + (b.centre - 4) + ',' + (marge.haut - 14) + ' h8 l-4,6 z'" class="graphe-envoi-marque"></path>
          }
          <rect [attr.x]="b.x" [attr.y]="b.y" [attr.width]="g.largeurBarre" [attr.height]="b.hauteur" rx="2.5" class="graphe-barre"
            [class.graphe-barre-max]="b === g.max"><title>{{ b.info }}</title></rect>
        }
        @if (g.max; as m) {
          <text [attr.x]="m.centre" [attr.y]="m.y - 5" text-anchor="middle" class="graphe-texte graphe-texte-fort">{{ m.semaine.telechargements }}</text>
        }
        @for (e of g.etiquettes; track e.texte) {
          <text [attr.x]="e.x" [attr.y]="hauteur - 6" text-anchor="middle" class="graphe-texte">{{ e.texte }}</text>
        }
      </svg>
    }
  `
})
export class HistogrammeSemaines {
  readonly semaines = input.required<SemaineActivite[]>();
  readonly largeur = L;
  readonly hauteur = H;
  readonly marge = MARGE;

  readonly graphe = computed(() => {
    const semaines = this.semaines();
    if (semaines.length === 0) return null;
    const { max, pas } = echelle(Math.max(...semaines.map((s) => s.telechargements)));
    const largeurTrace = L - MARGE.gauche - MARGE.droite;
    const hauteurTrace = H - MARGE.haut - MARGE.bas;
    const colonne = largeurTrace / semaines.length;
    const largeurBarre = Math.max(2, colonne * 0.64);
    const y = (v: number) => MARGE.haut + hauteurTrace - (v / max) * hauteurTrace;

    const barres: Barre[] = semaines.map((s, i) => {
      const x = MARGE.gauche + i * colonne + (colonne - largeurBarre) / 2;
      const haut = y(s.telechargements);
      const envoi = s.envois > 0 ? `, ${s.envois} e-mail(s) envoyé(s)` : '';
      return {
        x, y: haut, hauteur: MARGE.haut + hauteurTrace - haut, centre: x + largeurBarre / 2, semaine: s,
        info: `Semaine du ${libelleSemaine(s.debut)} : ${s.telechargements} téléchargement(s)${envoi}`
      };
    });
    const plusHaute = barres.reduce((a, b) => (b.semaine.telechargements > a.semaine.telechargements ? b : a));
    const graduations = [];
    for (let v = 0; v <= max; v += pas) graduations.push({ valeur: v, y: y(v) });
    const tous = Math.max(1, Math.ceil(semaines.length / 6));
    const etiquettes = barres.filter((_, i) => i % tous === 0).map((b) => ({ x: b.centre, texte: libelleSemaine(b.semaine.debut) }));
    const total = semaines.reduce((n, s) => n + s.telechargements, 0);
    const resume = total === 0
      ? 'Aucun téléchargement sur la période.'
      : `${total} téléchargement(s) sur ${semaines.length} semaines ; au plus ${plusHaute.semaine.telechargements} la semaine du ${libelleSemaine(plusHaute.semaine.debut)}.`;

    return {
      barres, graduations, etiquettes, largeurBarre, resume,
      max: plusHaute.semaine.telechargements > 0 ? plusHaute : null
    };
  });
}
