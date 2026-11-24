import { Component, effect, inject, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ActionJournal, ApiService, LIBELLES_MOTIFS, MotifSignalement } from '../services/api';
import { AuthService } from '../services/auth';
import { ToastService } from '../services/toast';
import { Confirmation } from './confirmation';

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
  import: 'bi-cloud-arrow-up', annulation: 'bi-arrow-counterclockwise', fusion: 'bi-intersect', separation: 'bi-slash-circle',
  signalement: 'bi-flag', traitement: 'bi-check2-circle', notification: 'bi-envelope', connexion: 'bi-box-arrow-in-right'
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
  imports: [DatePipe, RouterLink, Confirmation],
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
              <div [class.journal-annule]="a.annule_le"><strong>{{ a.admin_login || (a.action === 'signalement' || a.entite === 'resident' ? 'Le résident' : 'Système') }}</strong> {{ description(a) }}
                @if (afficherResident() && a.resident_id && a.resident_nom) {
                  · <a [routerLink]="['/admin/residents', a.resident_id]">{{ a.resident_nom }}</a>
                }
              </div>
              @if (!compact()) {
                @for (c of changements(a); track c.champ) {
                  <div class="journal-diff">{{ c.champ }} : <del>{{ c.avant }}</del> → <ins>{{ c.apres }}</ins></div>
                }
              }
              <div class="journal-pied">
                <span class="journal-date chiffres">{{ a.cree_le | date: 'dd/MM/yyyy à HH:mm' }}</span>
                @if (a.annule_le) {
                  <span class="pastille pastille-neutre"><i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i>
                    Annulée le {{ a.annule_le | date: 'dd/MM/yyyy à HH:mm' }}@if (a.annule_par) { par {{ a.annule_par }} }</span>
                } @else if (peutModifier && a.annulable && !compact()) {
                  <button type="button" class="btn btn-sm pill-btn-outline-dark journal-annuler" (click)="aAnnuler.set(a)"
                    [attr.aria-label]="'Annuler : ' + description(a)">
                    <i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i> Annuler</button>
                }
              </div>
            </div>
          </li>
        }
      </ul>
      @if (actions().length < total() && !compact()) {
        <div class="text-center mt-2">
          <button type="button" class="btn btn-sm pill-btn-outline-dark" [disabled]="chargement()" (click)="suite()">
            @if (chargement()) { <span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span> }
            Afficher plus ({{ total() - actions().length }})
          </button>
        </div>
      }
    }

    @if (aAnnuler(); as a) {
      <app-confirmation titre="Annuler cette action ?" icone="bi-arrow-counterclockwise" libelleConfirmer="Annuler l'action"
        [message]="messageAnnulation(a)" [enCours]="annulationEnCours()"
        (confirmer)="annuler(a)" (annuler)="aAnnuler.set(null)"></app-confirmation>
    }
  `
})
export class JournalListe {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  readonly peutModifier = inject(AuthService).peutModifier();

  readonly residentId = input<number | null>(null);
  readonly entite = input<string>('');
  readonly action = input<string>('');
  readonly afficherResident = input<boolean>(false);
  // Version courte (tableau de bord) : dernières actions seulement, sans détail ni bouton « Annuler »
  readonly compact = input<boolean>(false);
  readonly limite = input<number>(20);
  // Incrémenté par le parent pour recharger le journal après une modification
  readonly version = input<number>(0);
  // Émis après une annulation réussie : le parent recharge ce qu'il affiche (dossier, historique des imports)
  readonly annule = output<void>();

  readonly aAnnuler = signal<ActionJournal | null>(null);
  readonly annulationEnCours = signal(false);

  readonly actions = signal<ActionJournal[]>([]);
  readonly total = signal(0);
  readonly chargement = signal(false);
  readonly erreur = signal(false);
  private page = 1;

  constructor() {
    effect(() => {
      this.residentId();
      this.entite();
      this.action();
      this.version();
      this.recharger();
    });
  }

  messageAnnulation(a: ActionJournal): string {
    const qui = a.admin_login ? ` de ${a.admin_login}` : '';
    return `Action${qui} : « ${this.description(a)} ». L'état précédent est rétabli si rien n'a changé depuis ; l'annulation est elle-même enregistrée dans le journal.`;
  }

  annuler(a: ActionJournal) {
    this.annulationEnCours.set(true);
    this.api.annulerAction(a.id).subscribe({
      next: (res) => {
        this.annulationEnCours.set(false);
        this.aAnnuler.set(null);
        this.toast.succes(res.message);
        this.recharger();
        this.annule.emit();
      },
      error: (err) => {
        this.annulationEnCours.set(false);
        this.aAnnuler.set(null);
        this.toast.erreur(err.error?.message || "L'action n'a pas pu être annulée.");
      }
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
      action: this.action() || undefined,
      page: this.page,
      limit: this.limite()
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
      case 'fiche:traitement': return `a traité l'erreur signalée sur ${stage} (${this.motif(v.motif)})${v.reponse ? ` et a répondu : « ${v.reponse} »` : ''}`;
      case 'relance:notification': return `a envoyé un rappel à ${v.residents} résident(s) qui n'avaient pas téléchargé leur fiche ${v.semestre} ${v.annee} (${v.fiches} fiche(s))`;
      case 'notification:notification': return `a prévenu par e-mail ${v.residents} résident(s) que leur fiche ${v.semestre} ${v.annee} est disponible (${v.fiches} fiche(s))`;
      case 'import:import': return `a importé « ${v.fichier} »${v.semestre ? ` (${v.semestre} ${v.annee})` : ''} : ${v.residentsCrees} résident(s) et ${v.fichesCreees} fiche(s) créés`;
      case 'resident:connexion': return "s'est connecté à son espace";
      case 'administrateur:connexion': return "s'est connecté";
      case 'import:annulation': return `a annulé l'import « ${a.avant?.fichier ?? v.fichier} » : ${a.avant?.fichesSupprimees ?? v.fichesSupprimees} fiche(s) supprimée(s)`;
      case 'referentiel:fusion': return `a remplacé ${a.avant?.variantes?.length ?? 0} écriture(s) ${a.apres?.type === 'service' ? 'de service' : "d'hôpital"} par « ${a.apres?.valeur} » (${a.apres?.fichesModifiees} fiche(s))`;
      case 'referentiel:separation': return `a choisi de ne pas fusionner ${a.apres?.valeurs?.length ?? 0} écritures ${a.apres?.type === 'service' ? 'de service' : "d'hôpital"} : ${(a.apres?.valeurs ?? []).map((v: string) => `« ${v} »`).join(', ')}`;
      case 'administrateur:creation': return `a créé le compte « ${v.login} » (${v.role === 'lecture' ? 'lecture seule' : 'administrateur'})`;
      case 'administrateur:modification': return `a modifié le compte « ${v.login} »`;
      default:
        if (a.action === 'annulation') return `a annulé une action : ${a.apres?.message ?? ''}`;
        return `${a.action} ${a.entite}`;
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
