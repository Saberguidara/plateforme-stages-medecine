import { Component, DestroyRef, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService, LIBELLES_MOTIFS, MotifSignalement, enregistrerFichier } from '../services/api';
import { environment } from '../../environments/environment';
import { ToastService } from '../services/toast';
import { PdfViewerService } from '../services/pdf-viewer';
import { DUREE_RESIDANAT, LIBELLES_PERIODES, libelleNiveau, niveauImprime, trierStages } from '../services/residanat';

interface FicheResident {
  id: number;
  periode: string;
  annee: number;
  service: string | null;
  hopital: string | null;
  dates: string;
  dernier_telechargement: string | null;
  signale_le: string | null;
  signalement_traite_le: string | null;
  signalement_reponse: string | null;
}

interface DossierPersonnel {
  id: number;
  cin: string;
  nom_prenom: string;
  specialite: string;
  promotion: number | null;
  niveau: number | null;
  parcours_termine: boolean;
  duree: number;
  fiches: FicheResident[];
  semestreCourant: { semestre: string; annee: number; periodes: string[] };
}

interface AnneeParcours {
  cle: string;
  titre: string;
  detail: string;
  fiches: FicheResident[];
}

interface EtapeParcours {
  niveau: number;
  libelle: string;
  etat: 'faite' | 'courante' | 'a-venir';
}

const NOMS_SEMESTRES: Record<string, string> = { S1: '1er semestre', S2: '2nd semestre' };

@Component({
  selector: 'app-resident-search',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink],
  templateUrl: './resident-search.html',
  styleUrls: ['./resident-search.css']
})
export class ResidentSearchComponent implements OnInit {
  private api = inject(ApiService);
  private http = inject(HttpClient);
  private destroyRef = inject(DestroyRef);
  private toast = inject(ToastService);
  private pdfViewer = inject(PdfViewerService);

  readonly libellesPeriodes = LIBELLES_PERIODES;
  readonly dossier = signal<DossierPersonnel | null>(null);
  readonly messageErreur = signal('');
  readonly pdfEnCours = signal<number | null>(null);

  // Fenêtre « Signaler une erreur »
  readonly motifs = Object.entries(LIBELLES_MOTIFS) as [MotifSignalement, string][];
  readonly ficheSignalee = signal<FicheResident | null>(null);
  readonly envoiSignalement = signal(false);
  readonly erreurSignalement = signal('');
  signalement: { motif: MotifSignalement | ''; message: string } = { motif: '', message: '' };

  private cin = '';

  readonly initiales = computed(() => {
    const mots = (this.dossier()?.nom_prenom || '').trim().split(/\s+/).filter(Boolean);
    return mots.slice(0, 2).map((m) => m[0].toUpperCase()).join('');
  });

  readonly anneeEnCours = computed(() => {
    const d = this.dossier();
    if (!d) return '';
    if (d.parcours_termine) return 'Parcours terminé';
    return d.niveau ? libelleNiveau(d.niveau).replace(/^./, (c) => c.toUpperCase()) : 'Année non renseignée';
  });

  // Une étape par année de résidanat : faite, en cours ou à venir.
  readonly etapes = computed<EtapeParcours[]>(() => {
    const d = this.dossier();
    if (!d) return [];
    const duree = d.duree || DUREE_RESIDANAT;
    return Array.from({ length: duree }, (_, i) => {
      const niveau = i + 1;
      let etat: EtapeParcours['etat'] = 'a-venir';
      if (d.parcours_termine || (d.niveau && niveau < d.niveau)) etat = 'faite';
      else if (d.niveau === niveau) etat = 'courante';
      return { niveau, libelle: `${niveau}A`, etat };
    });
  });

  readonly nomSemestre = computed(() => {
    const s = this.dossier()?.semestreCourant;
    return s ? `${NOMS_SEMESTRES[s.semestre] ?? s.semestre} ${s.annee}` : '';
  });

  readonly fichesDuSemestre = computed(() => {
    const d = this.dossier();
    if (!d) return [];
    const { annee, periodes } = d.semestreCourant;
    return trierStages(d.fiches).filter((f) => Number(f.annee) === annee && periodes.includes(f.periode));
  });

  readonly parcours = computed<AnneeParcours[]>(() => {
    const d = this.dossier();
    if (!d) return [];
    const groupes = new Map<string, AnneeParcours>();
    // Les plus récentes en premier : c'est ce que le résident cherche le plus souvent.
    for (const f of trierStages(d.fiches).reverse()) {
      const niveau = niveauImprime(d.promotion, Number(f.annee), d.duree || DUREE_RESIDANAT);
      const cle = niveau ? `n${niveau}` : `a${f.annee}`;
      if (!groupes.has(cle)) {
        groupes.set(cle, {
          cle,
          titre: niveau ? libelleNiveau(niveau).replace(/^./, (c) => c.toUpperCase()) : `Année ${f.annee}`,
          detail: niveau ? '' : 'année de résidanat inconnue',
          fiches: []
        });
      }
      groupes.get(cle)!.fiches.push(f);
    }
    return [...groupes.values()];
  });

  ngOnInit() {
    this.cin = localStorage.getItem('resident_cin') || '';
    this.charger();
  }

  charger() {
    this.messageErreur.set('');
    this.dossier.set(null);
    if (!this.cin) {
      this.messageErreur.set('Votre session a expiré : reconnectez-vous.');
      return;
    }
    this.api.getResidentByCin(this.cin)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data: DossierPersonnel) => this.dossier.set(data),
        error: (err) => this.messageErreur.set(err.status === 404
          ? 'Aucun dossier ne correspond à votre CIN. Contactez le service des stages.'
          : "Le serveur ne répond pas. Il peut mettre jusqu'à une minute à démarrer : réessayez.")
      });
  }

  estDuSemestre(fiche: FicheResident): boolean {
    return this.fichesDuSemestre().some((f) => f.id === fiche.id);
  }

  // L'aperçu comme le téléchargement passent par la génération de la fiche, que le serveur enregistre.
  pdf(fiche: FicheResident, mode: 'apercu' | 'telecharger') {
    const d = this.dossier();
    if (!d || this.pdfEnCours()) return;
    this.pdfEnCours.set(fiche.id);
    this.http.post(`${environment.apiUrl}/generate-pdf`, { ficheId: fiche.id }, { responseType: 'blob' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          const nom = `Fiche_${d.cin}_${fiche.periode}_${fiche.annee}.pdf`;
          if (mode === 'apercu') this.pdfViewer.ouvrir(blob, nom);
          else enregistrerFichier(blob, nom);
          this.marquerTelechargee(fiche.id);
          this.pdfEnCours.set(null);
        },
        error: () => {
          this.toast.erreur("La fiche n'a pas pu être générée. Réessayez dans un instant.");
          this.pdfEnCours.set(null);
        }
      });
  }

  private marquerTelechargee(id: number) {
    const maintenant = new Date().toISOString();
    this.dossier.update((d) => d && {
      ...d,
      fiches: d.fiches.map((f) => (f.id === id ? { ...f, dernier_telechargement: maintenant } : f))
    });
  }

  // ===== Signalement d'une erreur sur une fiche =====

  ouvrirSignalement(fiche: FicheResident) {
    this.signalement = { motif: '', message: '' };
    this.erreurSignalement.set('');
    this.ficheSignalee.set(fiche);
  }

  @HostListener('document:keydown.escape')
  fermerSignalement() {
    if (!this.envoiSignalement()) this.ficheSignalee.set(null);
  }

  envoyerSignalement() {
    const fiche = this.ficheSignalee();
    const { motif, message } = this.signalement;
    if (!fiche) return;
    if (!motif) return this.erreurSignalement.set('Indiquez ce qui est erroné.');
    if (motif === 'autre' && !message.trim()) return this.erreurSignalement.set("Décrivez l'erreur en quelques mots.");

    this.envoiSignalement.set(true);
    this.erreurSignalement.set('');
    this.api.signalerErreur({ ficheId: fiche.id, motif, message: message.trim() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.envoiSignalement.set(false);
          this.ficheSignalee.set(null);
          this.marquerSignalee(fiche.id);
          this.toast.succes('Signalement envoyé : le service des stages va vérifier votre fiche.');
        },
        error: (err) => {
          this.envoiSignalement.set(false);
          if (err.status === 409) this.marquerSignalee(fiche.id);
          this.erreurSignalement.set(err.error?.message || "Le signalement n'a pas pu être envoyé. Réessayez.");
        }
      });
  }

  private marquerSignalee(id: number) {
    const maintenant = new Date().toISOString();
    this.dossier.update((d) => d && {
      ...d,
      fiches: d.fiches.map((f) => (f.id === id ? { ...f, signale_le: f.signale_le || maintenant } : f))
    });
  }
}
