import { Component, inject, input, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, DossierResident, FicheDossier } from '../services/api';
import { ToastService } from '../services/toast';
import { PdfViewerService } from '../services/pdf-viewer';
import { SuggestionsReferentiel } from './suggestions-referentiel';
import {
  LIBELLES_PERIODES, ORDRE_PERIODES, conflitsPeriode, libelleNiveau, niveauEn, periodeSuivante
} from '../services/residanat';

// Ajout ou modification d'un stage dans le dossier d'un résident.
@Component({
  selector: 'app-stage-form',
  standalone: true,
  imports: [FormsModule],
  template: `
    <form (ngSubmit)="enregistrer()" novalidate>
      <div class="row g-3">
        <div class="col-sm-7">
          <label class="form-label text-muted small fw-bold" for="sfPeriode">Période</label>
          <select class="form-select elegant-input" id="sfPeriode" name="periode" [(ngModel)]="modele.periode" aria-describedby="sfConflit">
            @for (p of periodesTriees(); track p) { <option [value]="p">{{ p }} · {{ libelles[p] || p }}</option> }
          </select>
        </div>
        <div class="col-sm-5">
          <label class="form-label text-muted small fw-bold" for="sfAnnee">Année</label>
          <input type="number" class="form-control elegant-input chiffres" id="sfAnnee" name="annee" min="2000" max="2100"
            [(ngModel)]="modele.annee" aria-describedby="sfConflit">
        </div>
        <div class="col-12" id="sfConflit" aria-live="polite">
          @if (conflits().occupee; as f) {
          <div class="alerte-saisie bloquante"><i class="bi bi-x-circle" aria-hidden="true"></i>
            <span>La période {{ modele.periode }} {{ modele.annee }} est déjà occupée ({{ f.hopital || 'hôpital non renseigné' }}, {{ f.service || 'service non renseigné' }}).</span></div>
          } @else if (conflits().chevauchements.length) {
          <div class="alerte-saisie"><i class="bi bi-exclamation-triangle" aria-hidden="true"></i>
            <span>Attention : {{ listeChevauchements() }} {{ modele.annee }} couvre déjà ces mois.</span></div>
          }
          @if (anneeImprimee()) {
          <div class="indication-calcul"><i class="bi bi-printer" aria-hidden="true"></i> Imprimé sur la fiche : {{ anneeImprimee() }}</div>
          }
        </div>
        <div class="col-12">
          <label class="form-label text-muted small fw-bold" for="sfHopital">Hôpital</label>
          <input type="text" class="form-control elegant-input" id="sfHopital" name="hopital" list="sfHopitaux" autocomplete="off"
            [(ngModel)]="modele.hopital" (ngModelChange)="hopitaux.chercher($event)" (focus)="hopitaux.chercher(modele.hopital)">
          <datalist id="sfHopitaux">
            @for (h of hopitaux.valeurs(); track h) { <option [value]="h"></option> }
          </datalist>
        </div>
        <div class="col-12">
          <label class="form-label text-muted small fw-bold" for="sfService">Service</label>
          <input type="text" class="form-control elegant-input" id="sfService" name="service" list="sfServices" autocomplete="off"
            [(ngModel)]="modele.service" (ngModelChange)="services.chercher($event, modele.hopital)" (focus)="services.chercher(modele.service, modele.hopital)">
          <datalist id="sfServices">
            @for (s of services.valeurs(); track s) { <option [value]="s"></option> }
          </datalist>
        </div>
      </div>

      <div class="mt-4 d-flex justify-content-end gap-2 flex-wrap">
        <button type="button" class="btn pill-btn-outline-dark" (click)="annule.emit()">Annuler</button>
        <button type="button" class="btn pill-btn-outline-dark" [disabled]="!valide() || apercu()" (click)="voirApercu()">
          @if (apercu()) { <span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span> }
          @else { <i class="bi bi-eye" aria-hidden="true"></i> } Aperçu
        </button>
        <button type="submit" class="btn pill-btn-orange" [disabled]="!valide() || enregistrement()">
          @if (enregistrement()) { <span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span> }
          @else { <i class="bi bi-check2" aria-hidden="true"></i> } Enregistrer
        </button>
      </div>
    </form>
  `
})
export class StageForm implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private pdfViewer = inject(PdfViewerService);

  readonly resident = input.required<DossierResident>();
  // Fiche à modifier ; absente pour un ajout
  readonly fiche = input<FicheDossier | null>(null);
  readonly periodes = input<string[]>(ORDRE_PERIODES);
  readonly enregistre = output<void>();
  readonly annule = output<void>();

  readonly libelles = LIBELLES_PERIODES;
  readonly hopitaux = new SuggestionsReferentiel('hopital');
  readonly services = new SuggestionsReferentiel('service');
  readonly enregistrement = signal(false);
  readonly apercu = signal(false);

  modele = { periode: 'S1', annee: new Date().getFullYear(), hopital: '', service: '' };

  ngOnInit() {
    const f = this.fiche();
    if (f) {
      this.modele = { periode: f.periode, annee: f.annee, hopital: f.hopital || '', service: f.service || '' };
    } else {
      // Période suivant le dernier stage enregistré
      const suivante = periodeSuivante(this.resident().fiches, this.periodes());
      this.modele = { ...this.modele, ...suivante };
    }
  }

  periodesTriees() {
    return ORDRE_PERIODES.filter((p) => this.periodes().includes(p));
  }

  conflits() {
    return conflitsPeriode(this.resident().fiches, { periode: this.modele.periode, annee: Number(this.modele.annee) }, this.fiche()?.id);
  }

  listeChevauchements() {
    return this.conflits().chevauchements.map((f) => f.periode).join(' et ');
  }

  anneeImprimee() {
    const r = this.resident();
    const niveau = r.promotion ? niveauEn(r.promotion, Number(this.modele.annee)) : r.niveau_saisi;
    return libelleNiveau(niveau);
  }

  valide() {
    const annee = Number(this.modele.annee);
    return annee >= 2000 && annee <= 2100 && !!this.modele.periode && !this.conflits().occupee;
  }

  private donnees() {
    return {
      resident_id: this.resident().id,
      periode: this.modele.periode,
      annee: Number(this.modele.annee),
      hopital: this.modele.hopital.trim(),
      service: this.modele.service.trim()
    };
  }

  voirApercu() {
    this.apercu.set(true);
    const d = this.donnees();
    this.api.apercuFiche(d).subscribe({
      next: (blob) => {
        this.apercu.set(false);
        this.pdfViewer.ouvrir(blob, `Fiche_${this.resident().cin}_${d.periode}_${d.annee}.pdf`);
      },
      error: () => {
        this.apercu.set(false);
        this.toast.erreur("L'aperçu n'a pas pu être généré.");
      }
    });
  }

  enregistrer() {
    if (!this.valide() || this.enregistrement()) return;
    this.enregistrement.set(true);
    const f = this.fiche();
    const requete = f ? this.api.updateFiche(f.id, this.donnees()) : this.api.createFiche(this.donnees());
    requete.subscribe({
      next: () => {
        this.enregistrement.set(false);
        const d = this.donnees();
        this.toast.succes(f ? `Stage ${d.periode} ${d.annee} mis à jour.` : `Stage ${d.periode} ${d.annee} ajouté.`);
        this.enregistre.emit();
      },
      error: (err) => {
        this.enregistrement.set(false);
        this.toast.erreur(err.error?.message || "Le stage n'a pas pu être enregistré.");
      }
    });
  }
}
