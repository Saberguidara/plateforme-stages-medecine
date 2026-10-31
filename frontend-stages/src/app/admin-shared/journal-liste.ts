import { Component, effect, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ActionJournal, ApiService, LIBELLES_MOTIFS, MotifSignalement } from '../services/api';

interface Changement {
  champ: string;
  avant: string;
  apres: string;
}

const LIBELLES_CHAMPS: Record<string, string> = {
  cin: 'CIN', nom_prenom: 'Nom', email: 'E-mail', specialite: 'Spécialité', faculte_origine: 'Faculté',
  promotion: 'Promotion', niveau: 'Niveau', periode: 'Période', annee: 'Année', service: 'Service', hopital: 'Hôpital',
  nom: 'Nom', role: 'Rôle', actif: 'Actif', motDePasse: 'Mot de passe'
};

const ICONES: Record<string, string> = {
  creation: 'bi-plus-lg', modification: 'bi-pencil', suppression: 'bi-trash3',
  import: 'bi-cloud-arrow-up', annulation: 'bi-arrow-counterclockwise', fusion: 'bi-intersect',
  signalement: 'bi-flag', traitement: 'bi-check2-circle'
};

function texte(valeur: unknown): string {
  if (valeur === null || valeur === undefined || valeur === '') return 'vide';
  if (typeof valeur === 'boolean') return valeur ? 'oui' : 'non';
  return String(valeur);
}

// Journal des actions des administrateurs : dans un dossier résident ou dans l'historique général.
@Component({
  selector: 'app-journal-liste',
  standalone: true,
  imports: [DatePipe, RouterLink],
  template: `
    @if (chargement() && actions().length === 0) {
      <div aria-busy="true" aria-label="Chargement du journal">
        @for (n of [1, 2, 3]; track n) { <span class="skeleton skeleton-ligne my-3"></span> }
      </div>
    } @else if (erreur()) {
      <p class="text-muted small mb-0"><i class="bi bi-wifi-off" aria-hidden="true"></i> Journal indisponible.
        <button type="button" class="btn btn-link btn-sm p-0 align-baseline" (click)="recharger()">Réessayer</button></p>
    } @else if (actions().length === 0) {
      <div class="etat-vide py-4">
        <i class="bi bi-journal etat-vide-icone" aria-hidden="true"></i>
        <div class="etat-vide-titre">Aucune action enregistrée</div>
        <p class="etat-vide-texte mb-0">Les créations, modifications, suppressions et imports apparaîtront ici.</p>
      </div>
    } @else {
      <ul class="journal-liste">
        @for (a of actions(); track a.id) {
          <li class="journal-item">
            <span class="journal-icone"><i [class]="'bi ' + icone(a)" aria-hidden="true"></i></span>
            <div class="journal-texte">
              <div><strong>{{ a.admin_login || (a.action === 'signalement' ? 'Le résident' : 'Système') }}</strong> {{ description(a) }}
                @if (afficherResident() && a.resident_id && a.resident_nom) {
                  · <a [routerLink]="['/admin/residents', a.resident_id]">{{ a.resident_nom }}</a>
                }
              </div>
              @for (c of changements(a); track c.champ) {
                <div class="journal-diff">{{ c.champ }} : <del>{{ c.avant }}</del> → <ins>{{ c.apres }}</ins></div>
              }
              <div class="journal-date chiffres">{{ a.cree_le | date: 'dd/MM/yyyy à HH:mm' }}</div>
            </div>
          </li>
        }
      </ul>
      @if (actions().length < total()) {
        <div class="text-center mt-2">
          <button type="button" class="btn btn-sm pill-btn-outline-dark" [disabled]="chargement()" (click)="suite()">
            @if (chargement()) { <span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span> }
            Afficher plus ({{ total() - actions().length }})
          </button>
        </div>
      }
    }
  `
})
export class JournalListe {
  private api = inject(ApiService);

  readonly residentId = input<number | null>(null);
  readonly entite = input<string>('');
  readonly afficherResident = input<boolean>(false);
  // Incrémenté par le parent pour recharger le journal après une modification
  readonly version = input<number>(0);

  readonly actions = signal<ActionJournal[]>([]);
  readonly total = signal(0);
  readonly chargement = signal(false);
  readonly erreur = signal(false);
  private page = 1;

  constructor() {
    effect(() => {
      this.residentId();
      this.entite();
      this.version();
      this.recharger();
    });
  }

  recharger() {
    this.page = 1;
    this.actions.set([]);
    this.charger();
  }

  suite() {
    this.page++;
    this.charger();
  }

  private charger() {
    this.chargement.set(true);
    this.erreur.set(false);
    this.api.getJournal({
      resident_id: this.residentId() ?? undefined,
      entite: this.entite() || undefined,
      page: this.page,
      limit: 20
    }).subscribe({
      next: (res) => {
        this.actions.update((liste) => (this.page === 1 ? res.data : [...liste, ...res.data]));
        this.total.set(res.total);
        this.chargement.set(false);
      },
      error: () => {
        this.chargement.set(false);
        this.erreur.set(true);
      }
    });
  }

  icone(a: ActionJournal) {
    return ICONES[a.action] || 'bi-dot';
  }

  description(a: ActionJournal): string {
    const v = a.apres || a.avant || {};
    const stage = v.periode ? `le stage ${v.periode} ${v.annee}` : 'un stage';
    switch (`${a.entite}:${a.action}`) {
      case 'resident:creation': return 'a créé le dossier';
      case 'resident:modification': return 'a modifié le dossier';
      case 'resident:suppression': return `a supprimé le résident ${a.avant?.nom_prenom ?? ''} (${a.avant?.fiches?.length ?? 0} fiche(s))`;
      case 'fiche:creation': return `a ajouté ${stage}`;
      case 'fiche:modification': return `a modifié ${stage}`;
      case 'fiche:suppression': return `a supprimé ${stage}`;
      case 'fiche:signalement': return `a signalé une erreur sur ${stage} (${this.motif(v.motif)})${v.message ? ` : « ${v.message} »` : ''}`;
      case 'fiche:traitement': return `a traité l'erreur signalée sur ${stage} (${this.motif(v.motif)})`;
      case 'import:import': return `a importé « ${v.fichier} »${v.semestre ? ` (${v.semestre} ${v.annee})` : ''} : ${v.residentsCrees} résident(s) et ${v.fichesCreees} fiche(s) créés`;
      case 'import:annulation': return `a annulé l'import « ${v.fichier} » : ${v.fichesSupprimees} fiche(s) supprimée(s)`;
      case 'referentiel:fusion': return `a remplacé ${a.avant?.variantes?.length ?? 0} écriture(s) ${a.apres?.type === 'service' ? 'de service' : "d'hôpital"} par « ${a.apres?.valeur} » (${a.apres?.fichesModifiees} fiche(s))`;
      case 'administrateur:creation': return `a créé le compte « ${v.login} » (${v.role === 'lecture' ? 'lecture seule' : 'administrateur'})`;
      case 'administrateur:modification': return `a modifié le compte « ${v.login} »`;
      default: return `${a.action} ${a.entite}`;
    }
  }

  private motif(code: MotifSignalement): string {
    return (LIBELLES_MOTIFS[code] ?? code).toLowerCase();
  }

  changements(a: ActionJournal): Changement[] {
    if (a.action === 'fusion') {
      return (a.avant?.variantes ?? []).map((variante: string) => ({ champ: a.apres?.type === 'service' ? 'Service' : 'Hôpital', avant: variante, apres: a.apres?.valeur }));
    }
    if (a.action !== 'modification' || !a.avant || !a.apres) return [];
    return Object.keys(a.apres)
      .filter((cle) => cle in LIBELLES_CHAMPS && texte(a.avant[cle]) !== texte(a.apres[cle]))
      .map((cle) => ({
        champ: LIBELLES_CHAMPS[cle],
        // Le mot de passe n'est jamais journalisé : seul son changement l'est.
        avant: cle === 'motDePasse' ? 'ancien' : texte(a.avant[cle]),
        apres: texte(a.apres[cle])
      }));
  }
}
