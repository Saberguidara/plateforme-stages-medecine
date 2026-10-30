import { Component, DestroyRef, inject, input, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { ApiService, DossierResident } from '../services/api';
import { ToastService } from '../services/toast';
import { descriptionPromotion, erreurIdentifiant } from '../services/residanat';

export interface ResidentEnregistre {
  id: number;
  premierStage: boolean;
}

// Création ou modification d'un résident. La promotion (année d'entrée en 1re année)
// remplace le « niveau » : l'année imprimée sur les fiches en est déduite.
@Component({
  selector: 'app-resident-form',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <form (ngSubmit)="enregistrer(true)" #formulaire="ngForm" novalidate>
      <div class="row g-3">
        <div class="col-12">
          <span class="form-label text-muted small fw-bold d-block">Pièce d'identité</span>
          <div class="onglets" role="radiogroup" aria-label="Type de pièce d'identité">
            <button type="button" class="onglet" role="radio" [attr.aria-checked]="typePiece === 'cin'" [attr.aria-selected]="typePiece === 'cin'"
              (click)="changerType('cin')">CIN tunisien</button>
            <button type="button" class="onglet" role="radio" [attr.aria-checked]="typePiece === 'passeport'" [attr.aria-selected]="typePiece === 'passeport'"
              (click)="changerType('passeport')">Passeport</button>
          </div>
        </div>

        <div class="col-md-5">
          <label class="form-label text-muted small fw-bold" for="rfCin">{{ typePiece === 'cin' ? 'N° de CIN' : 'N° de passeport' }} <span class="text-danger">*</span></label>
          <input type="text" class="form-control elegant-input chiffres" id="rfCin" name="cin" required autocomplete="off"
            [attr.inputmode]="typePiece === 'cin' ? 'numeric' : 'text'" [attr.maxlength]="typePiece === 'cin' ? 8 : 20"
            [attr.aria-invalid]="!!erreurCin() || !!doublon()" aria-describedby="rfCinAide"
            [(ngModel)]="modele.cin" (ngModelChange)="cinModifie($event)">
          <div id="rfCinAide">
            @if (erreurCin()) {
            <div class="alerte-saisie bloquante"><i class="bi bi-x-circle" aria-hidden="true"></i> {{ erreurCin() }}</div>
            } @else if (doublon(); as d) {
            <div class="alerte-saisie bloquante" role="alert"><i class="bi bi-person-exclamation" aria-hidden="true"></i>
              <span>Ce numéro appartient déjà à {{ d.nom_prenom }}. <a [routerLink]="['/admin/residents', d.id]">Ouvrir son dossier</a></span></div>
            } @else if (typePiece === 'cin') {
            <div class="form-text">8 chiffres, zéro initial compris.</div>
            }
          </div>
        </div>

        <div class="col-md-7">
          <label class="form-label text-muted small fw-bold" for="rfNom">Nom et prénom <span class="text-danger">*</span></label>
          <input type="text" class="form-control elegant-input" id="rfNom" name="nom" required autocomplete="off" [(ngModel)]="modele.nom_prenom">
        </div>

        <div class="col-md-5">
          <label class="form-label text-muted small fw-bold" for="rfPromo">Promotion @if (!ancienDossier()) { <span class="text-danger">*</span> }</label>
          <input type="number" class="form-control elegant-input chiffres" id="rfPromo" name="promotion" [min]="2000" [max]="anneeCourante + 1"
            placeholder="ex. {{ anneeCourante }}" aria-describedby="rfPromoAide" [required]="!ancienDossier()" [(ngModel)]="modele.promotion">
          <div id="rfPromoAide">
            @if (description()) {
            <div class="indication-calcul"><i class="bi bi-arrow-return-right" aria-hidden="true"></i> {{ description() }}</div>
            } @else if (ancienDossier()) {
            <div class="form-text">Ancien dossier sans promotion : l'année imprimée reste « {{ resident()?.niveau_saisi }}e année ».</div>
            } @else {
            <div class="form-text">Année d'entrée en 1re année de résidanat.</div>
            }
          </div>
        </div>

        <div class="col-md-7">
          <label class="form-label text-muted small fw-bold" for="rfFac">Faculté d'origine</label>
          <select class="form-select elegant-input" id="rfFac" name="fac" [(ngModel)]="modele.faculte_origine">
            @for (fac of facultes; track fac) { <option [value]="fac">{{ fac }}</option> }
          </select>
        </div>

        <div class="col-md-5">
          <label class="form-label text-muted small fw-bold" for="rfSpec">Spécialité</label>
          <select class="form-select elegant-input" id="rfSpec" name="spec" [(ngModel)]="modele.specialite">
            @for (spec of specialites(); track spec) { <option [value]="spec">{{ spec }}</option> }
          </select>
        </div>

        <div class="col-md-7">
          <label class="form-label text-muted small fw-bold" for="rfEmail">E-mail de connexion</label>
          <input type="email" class="form-control elegant-input" id="rfEmail" name="email" autocomplete="off" [(ngModel)]="modele.email">
          <div class="form-text">Sans e-mail, le résident ne peut pas se connecter pour récupérer ses fiches.</div>
        </div>
      </div>

      <div class="mt-4 d-flex justify-content-end gap-2 flex-wrap">
        @if (resident()) {
        <button type="button" class="btn pill-btn-outline-dark" (click)="annule.emit()">Annuler</button>
        <button type="submit" class="btn pill-btn-orange" [disabled]="!valide() || enregistrement()">
          @if (enregistrement()) { <span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span> }
          <i class="bi bi-check2" aria-hidden="true"></i> Enregistrer
        </button>
        } @else {
        <button type="button" class="btn pill-btn-outline-dark" [disabled]="!valide() || enregistrement()" (click)="enregistrer(false)">
          Créer seulement
        </button>
        <button type="submit" class="btn pill-btn-orange" [disabled]="!valide() || enregistrement()">
          @if (enregistrement()) { <span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span> Création… }
          @else { Créer et ajouter le premier stage <i class="bi bi-arrow-right ms-1" aria-hidden="true"></i> }
        </button>
        }
      </div>
    </form>
  `
})
export class ResidentForm implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private destroyRef = inject(DestroyRef);

  // Résident à modifier ; absent pour une création
  readonly resident = input<DossierResident | null>(null);
  readonly enregistre = output<ResidentEnregistre>();
  readonly annule = output<void>();

  readonly anneeCourante = new Date().getFullYear();
  readonly facultes = ['FMSfax', 'FMSousse', 'FMMonastir', 'FMTunis', 'Autre'];
  readonly specialites = signal<string[]>([]);
  readonly doublon = signal<{ id: number; nom_prenom: string } | null>(null);
  readonly enregistrement = signal(false);
  private readonly cin$ = new Subject<string>();

  typePiece: 'cin' | 'passeport' = 'cin';
  modele = { cin: '', nom_prenom: '', promotion: null as number | null, faculte_origine: 'FMSfax', specialite: '', email: '' };

  ngOnInit() {
    const r = this.resident();
    if (r) {
      this.modele = {
        cin: r.cin, nom_prenom: r.nom_prenom, promotion: r.promotion, faculte_origine: r.faculte_origine || 'FMSfax',
        specialite: r.specialite, email: r.email || ''
      };
      this.typePiece = /^\d{8}$/.test(r.cin) ? 'cin' : 'passeport';
    }

    this.api.getSpecialites().subscribe({
      next: (liste) => {
        this.specialites.set(liste);
        if (!this.modele.specialite) this.modele.specialite = liste[0] ?? '';
      }
    });

    // Alerte immédiate si le CIN appartient déjà à un autre dossier
    this.cin$.pipe(
      debounceTime(350),
      distinctUntilChanged(),
      switchMap((cin) => (cin.length >= 5 ? this.api.verifierCin(cin, r?.id).pipe(catchError(() => of({ existe: false }))) : of({ existe: false }))),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((res: any) => this.doublon.set(res.existe ? res.resident : null));
  }

  private cinNormalise() {
    return (this.modele.cin || '').replace(/\s/g, '').toUpperCase();
  }

  erreurCin() {
    return erreurIdentifiant(this.modele.cin, this.typePiece);
  }

  ancienDossier() {
    const r = this.resident();
    return !!r && !r.promotion && !!r.niveau_saisi;
  }

  description() {
    return descriptionPromotion(Number(this.modele.promotion) || null);
  }

  cinModifie(valeur: string) {
    this.doublon.set(null);
    this.cin$.next((valeur || '').replace(/\s/g, '').toUpperCase());
  }

  changerType(type: 'cin' | 'passeport') {
    this.typePiece = type;
  }

  valide() {
    const promo = Number(this.modele.promotion);
    const promoOk = this.modele.promotion === null || (this.modele.promotion as any) === ''
      ? this.ancienDossier()
      : promo >= 2000 && promo <= this.anneeCourante + 1;
    return !!this.cinNormalise() && !this.erreurCin() && !this.doublon() && !!this.modele.nom_prenom.trim() && promoOk;
  }

  enregistrer(premierStage: boolean) {
    if (!this.valide() || this.enregistrement()) return;
    this.enregistrement.set(true);
    const r = this.resident();
    const donnees = {
      ...this.modele,
      cin: this.cinNormalise(),
      type_piece: this.typePiece,
      promotion: this.modele.promotion || null,
      ...(r && !this.modele.promotion ? { niveau: r.niveau_saisi } : {})
    };
    const requete = r ? this.api.updateResident(r.id, donnees) : this.api.createResident(donnees);
    requete.subscribe({
      next: (res) => {
        this.enregistrement.set(false);
        this.toast.succes(res.message || 'Résident enregistré.');
        this.enregistre.emit({ id: r ? r.id : res.id, premierStage });
      },
      error: (err) => {
        this.enregistrement.set(false);
        this.toast.erreur(err.error?.message || "Le résident n'a pas pu être enregistré.");
      }
    });
  }
}
