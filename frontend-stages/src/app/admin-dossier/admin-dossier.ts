import { Component, computed, DestroyRef, HostListener, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ApiService, DossierResident, FicheDossier, LIBELLES_MOTIFS, enregistrerFichier } from '../services/api';
import { AuthService } from '../services/auth';
import { ToastService } from '../services/toast';
import { PdfViewerService } from '../services/pdf-viewer';
import { LIBELLES_PERIODES, ORDRE_PERIODES, descriptionPromotion, libelleNiveau, trierStages } from '../services/residanat';
import { ResidentForm, ResidentEnregistre } from '../admin-shared/resident-form';
import { StageForm } from '../admin-shared/stage-form';
import { Confirmation } from '../admin-shared/confirmation';
import { JournalListe } from '../admin-shared/journal-liste';

interface AnneeParcours {
  cle: string;
  titre: string;
  detail: string;
  fiches: FicheDossier[];
}

// Dossier unique d'un résident : identité, parcours en frise, stages et journal.
@Component({
  selector: 'app-admin-dossier',
  standalone: true,
  imports: [RouterLink, DatePipe, ResidentForm, StageForm, Confirmation, JournalListe],
  templateUrl: './admin-dossier.html'
})
export class AdminDossier implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(ToastService);
  private pdfViewer = inject(PdfViewerService);
  private titre = inject(Title);
  private destroyRef = inject(DestroyRef);

  readonly peutModifier = inject(AuthService).peutModifier();
  readonly libellesPeriodes = LIBELLES_PERIODES;
  readonly descriptionPromotion = descriptionPromotion;
  readonly libelleNiveau = libelleNiveau;
  readonly libellesMotifs = LIBELLES_MOTIFS;

  readonly dossier = signal<DossierResident | null>(null);
  readonly introuvable = signal(false);
  readonly erreur = signal(false);
  readonly periodes = signal<string[]>(ORDRE_PERIODES);
  readonly versionJournal = signal(0);
  readonly pdfEnCours = signal<number | null>(null);
  readonly traitementEnCours = signal<number | null>(null);

  // Fenêtres ouvertes
  readonly editionResident = signal(false);
  readonly editionStage = signal<{ fiche: FicheDossier | null } | null>(null);
  readonly confirmation = signal<{ titre: string; message: string; action: () => void } | null>(null);
  readonly suppressionEnCours = signal(false);

  readonly parcours = computed<AnneeParcours[]>(() => {
    const d = this.dossier();
    if (!d) return [];
    const groupes = new Map<string, AnneeParcours>();
    for (const f of trierStages(d.fiches)) {
      const niveau = Number(f.annee_residanat) || null;
      const cle = niveau && niveau > 0 ? `n${niveau}` : `a${f.annee}`;
      if (!groupes.has(cle)) {
        groupes.set(cle, {
          cle,
          titre: niveau && niveau > 0 ? libelleNiveau(niveau).replace(/^./, (c) => c.toUpperCase()) : `Année ${f.annee}`,
          detail: niveau && niveau > 0 ? String(f.annee) : 'année de résidanat inconnue',
          fiches: []
        });
      }
      groupes.get(cle)!.fiches.push(f);
    }
    return [...groupes.values()];
  });

  ngOnInit() {
    this.api.getConfigSpecialites().subscribe({
      next: (liste) => {
        const d = this.dossier();
        const conf = liste.find((s) => s.libelle === d?.specialite) ?? liste[0];
        if (conf) this.periodes.set(conf.periodes);
      }
    });

    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.charger(Number(params.get('id')), this.route.snapshot.queryParamMap.get('premierStage') === '1');
    });
  }

  charger(id = this.dossier()?.id ?? 0, ouvrirAjout = false) {
    this.erreur.set(false);
    this.introuvable.set(false);
    this.api.getDossier(id).subscribe({
      next: (d) => {
        this.dossier.set(d);
        this.titre.setTitle(`${d.nom_prenom} · Plateforme des stages`);
        if (ouvrirAjout && this.peutModifier) {
          this.editionStage.set({ fiche: null });
          // L'invitation à ajouter le premier stage ne doit pas revenir au rechargement.
          this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
        }
      },
      error: (err) => {
        if (err.status === 404) this.introuvable.set(true);
        else this.erreur.set(true);
      }
    });
  }

  private actualiser() {
    this.charger();
    this.versionJournal.update((v) => v + 1);
  }

  estCin(cin: string) {
    return /^\d{8}$/.test(cin);
  }

  // ===== Résident =====

  residentEnregistre(_: ResidentEnregistre) {
    this.editionResident.set(false);
    this.actualiser();
  }

  demanderSuppressionResident() {
    const d = this.dossier()!;
    this.confirmation.set({
      titre: 'Supprimer ce résident ?',
      message: `${d.nom_prenom} et ses ${d.fiches.length} fiche(s) seront supprimés définitivement. L'action reste visible dans le journal.`,
      action: () => this.api.deleteResident(d.id).subscribe({
        next: () => {
          this.fermerConfirmation();
          this.toast.succes('Résident supprimé.');
          this.router.navigate(['/admin/residents']);
        },
        error: (err) => this.echecConfirmation(err, 'Le résident n\'a pas pu être supprimé.')
      })
    });
  }

  // ===== Stages =====

  stageEnregistre() {
    this.editionStage.set(null);
    this.actualiser();
  }

  demanderSuppressionFiche(f: FicheDossier) {
    this.confirmation.set({
      titre: 'Supprimer ce stage ?',
      message: `La fiche ${f.periode} ${f.annee} (${f.hopital || 'hôpital non renseigné'}) sera supprimée.`,
      action: () => this.api.deleteFiche(f.id).subscribe({
        next: () => {
          this.fermerConfirmation();
          this.toast.succes(`Stage ${f.periode} ${f.annee} supprimé.`);
          this.actualiser();
        },
        error: (err) => this.echecConfirmation(err, "Le stage n'a pas pu être supprimé.")
      })
    });
  }

  traiterSignalement(f: FicheDossier) {
    if (!f.signalement_id) return;
    this.traitementEnCours.set(f.id);
    this.api.traiterSignalement(f.signalement_id).subscribe({
      next: () => {
        this.traitementEnCours.set(null);
        this.toast.succes(`Signalement sur ${f.periode} ${f.annee} marqué comme traité.`);
        this.actualiser();
      },
      error: (err) => {
        this.traitementEnCours.set(null);
        this.toast.erreur(err.error?.message || "Le signalement n'a pas pu être mis à jour.");
      }
    });
  }

  confirmer() {
    this.suppressionEnCours.set(true);
    this.confirmation()?.action();
  }

  fermerConfirmation() {
    this.suppressionEnCours.set(false);
    this.confirmation.set(null);
  }

  private echecConfirmation(err: any, message: string) {
    this.fermerConfirmation();
    this.toast.erreur(err.error?.message || message);
  }

  // ===== PDF =====

  private nomFichier(f: FicheDossier) {
    return `Fiche_${this.dossier()?.cin}_${f.periode}_${f.annee}.pdf`;
  }

  pdf(f: FicheDossier, mode: 'apercu' | 'telecharger') {
    const d = this.dossier()!;
    this.pdfEnCours.set(f.id);
    this.api.apercuFiche({ resident_id: d.id, periode: f.periode, annee: f.annee, hopital: f.hopital, service: f.service }).subscribe({
      next: (blob) => {
        this.pdfEnCours.set(null);
        if (mode === 'apercu') this.pdfViewer.ouvrir(blob, this.nomFichier(f));
        else enregistrerFichier(blob, this.nomFichier(f));
      },
      error: () => {
        this.pdfEnCours.set(null);
        this.toast.erreur("La fiche n'a pas pu être générée.");
      }
    });
  }

  @HostListener('document:keydown.escape')
  fermerFenetres() {
    if (this.confirmation()) return;
    this.editionResident.set(false);
    this.editionStage.set(null);
  }
}
