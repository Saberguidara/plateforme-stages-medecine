import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  ApiService, Indicateur, LIBELLES_MOTIFS, NotificationsEnAttente, SemestreCivil, Signalement, Statistiques, SyntheseStatistiques
} from '../services/api';
import { TraitementSignalement } from '../admin-shared/traitement-signalement';
import { JournalListe } from '../admin-shared/journal-liste';
import { delaiLisible, HistogrammeSemaines, Sparkline } from '../admin-shared/graphiques';

export { delaiLisible };
import { AuthService } from '../services/auth';
import { ToastService } from '../services/toast';
import { libelleNiveau } from '../services/residanat';

export type Gravite = 'critique' | 'attention' | 'info';

export interface SujetATraiter {
  cle: string;
  gravite: Gravite;
  icone: string;
  titre: string;
  detail: string;
  nombre: number;
  // Lien vers la liste des résidents filtrée, ou action réalisée sur place
  queryParams?: Record<string, string | number>;
  action?: 'signalements' | 'notifier';
}

export interface Evolution {
  texte: string;
  sens: 'hausse' | 'baisse' | 'stable' | 'inconnu';
}

const ORDRE_GRAVITE: Record<Gravite, number> = { critique: 0, attention: 1, info: 2 };

// Sections du tableau de bord, dans leur ordre par défaut
export const SECTIONS = [
  { cle: 'indicateurs', libelle: 'Indicateurs du semestre' },
  { cle: 'a-traiter', libelle: 'À traiter' },
  { cle: 'diffusion', libelle: 'Diffusion des fiches' },
  { cle: 'telechargements', libelle: 'Téléchargements par semaine' },
  { cle: 'activite', libelle: 'Activité récente' },
  { cle: 'signalements', libelle: 'Signalements' },
  { cle: 'promotions', libelle: 'Résidents en cours' }
] as const;

export interface DispositionTableau {
  ordre: string[];
  masquees: string[];
}

// Disposition enregistrée, complétée des sections apparues depuis et sans les sections disparues
export function lireDisposition(brut: string | null): DispositionTableau {
  const cles: string[] = SECTIONS.map((s) => s.cle);
  let d: Partial<DispositionTableau> = {};
  try { d = brut ? JSON.parse(brut) : {}; } catch { d = {}; }
  const ordre = (Array.isArray(d.ordre) ? d.ordre : []).filter((c) => cles.includes(c));
  return {
    ordre: [...new Set([...ordre, ...cles])],
    masquees: (Array.isArray(d.masquees) ? d.masquees : []).filter((c) => cles.includes(c))
  };
}
const NB_SEMESTRES_PROPOSES = 6;

export function semestreDuJour(date = new Date()): SemestreCivil {
  return { semestre: date.getMonth() < 6 ? 'S1' : 'S2', annee: date.getFullYear() };
}

// Les derniers semestres, du plus récent au plus ancien, pour le sélecteur.
export function semestresProposes(courant: SemestreCivil, nombre = NB_SEMESTRES_PROPOSES): SemestreCivil[] {
  const rang = courant.annee * 2 + (courant.semestre === 'S2' ? 1 : 0);
  return Array.from({ length: nombre }, (_, i) => {
    const r = rang - i;
    return { semestre: r % 2 === 1 ? 'S2' : 'S1', annee: Math.floor(r / 2) };
  });
}

const nombre = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

// Écart avec le même semestre de l'année précédente : en nombre, en pourcentage ou en points.
export function evolution(ind: Indicateur, mode: 'nombre' | 'pourcentage' | 'points', reference: string): Evolution {
  if (ind.valeur === null || ind.precedent === null || (mode === 'pourcentage' && ind.precedent === 0)) {
    return { texte: `Pas de comparaison avec ${reference}`, sens: 'inconnu' };
  }
  const ecart = ind.valeur - ind.precedent;
  if (ecart === 0) return { texte: `Stable par rapport à ${reference}`, sens: 'stable' };
  const fleche = ecart > 0 ? '▲' : '▼';
  const valeur = mode === 'pourcentage'
    ? `${nombre.format(Math.abs((ecart / ind.precedent) * 100))} %`
    : mode === 'points' ? `${Math.abs(ecart)} pt${Math.abs(ecart) > 1 ? 's' : ''}` : `${Math.abs(ecart)}`;
  return { texte: `${fleche} ${valeur} par rapport à ${reference}`, sens: ecart > 0 ? 'hausse' : 'baisse' };
}


// Tableau de bord : ce qu'il faut traiter maintenant, puis l'état du semestre choisi
// comparé au même semestre de l'année précédente. Chaque chiffre ouvre la liste correspondante.
@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [RouterLink, DatePipe, TraitementSignalement, JournalListe, Sparkline, HistogrammeSemaines],
  templateUrl: './admin-dashboard.html'
})
export class AdminDashboard implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  readonly peutModifier = inject(AuthService).peutModifier();

  readonly stats = signal<Statistiques | null>(null);
  readonly erreur = signal(false);
  readonly libelleNiveau = libelleNiveau;
  readonly tuilesChargement = [1, 2, 3, 4];
  readonly libellesMotifs = LIBELLES_MOTIFS;
  readonly signalements = signal<Signalement[]>([]);
  readonly aTraiter = signal<Signalement | null>(null);
  readonly notifications = signal<NotificationsEnAttente | null>(null);
  readonly envoiEnCours = signal(false);

  readonly semestres = semestresProposes(semestreDuJour());
  readonly semestreChoisi = signal<SemestreCivil>(this.semestres[0]);
  readonly synthese = signal<SyntheseStatistiques | null>(null);
  readonly erreurSynthese = signal(false);
  readonly delaiLisible = delaiLisible;

  // ===== Personnalisation (propre à chaque administrateur, sur ce navigateur) =====
  private readonly cleDisposition = `tableau-de-bord:${inject(AuthService).getUserName() || 'admin'}`;
  readonly personnaliser = signal(false);
  readonly disposition = signal<DispositionTableau>(this.chargerDisposition());
  readonly sectionsOrdonnees = computed(() =>
    this.disposition().ordre.map((cle) => SECTIONS.find((s) => s.cle === cle)!).filter(Boolean));

  visible(cle: string): boolean {
    return !this.disposition().masquees.includes(cle);
  }

  ordre(cle: string): number {
    return this.disposition().ordre.indexOf(cle);
  }

  basculer(cle: string) {
    this.modifierDisposition((d) => ({
      ...d, masquees: d.masquees.includes(cle) ? d.masquees.filter((c) => c !== cle) : [...d.masquees, cle]
    }));
  }

  deplacer(cle: string, pas: number) {
    this.modifierDisposition((d) => {
      const ordre = [...d.ordre];
      const i = ordre.indexOf(cle);
      const j = i + pas;
      if (i < 0 || j < 0 || j >= ordre.length) return d;
      [ordre[i], ordre[j]] = [ordre[j], ordre[i]];
      return { ...d, ordre };
    });
  }

  retablir() {
    this.modifierDisposition(() => lireDisposition(null));
  }

  private chargerDisposition(): DispositionTableau {
    try { return lireDisposition(localStorage.getItem(this.cleDisposition)); } catch { return lireDisposition(null); }
  }

  private modifierDisposition(f: (d: DispositionTableau) => DispositionTableau) {
    this.disposition.set(f(this.disposition()));
    try { localStorage.setItem(this.cleDisposition, JSON.stringify(this.disposition())); } catch { /* stockage indisponible */ }
  }

  ngOnInit() {
    this.charger();
  }

  charger() {
    this.erreur.set(false);
    this.stats.set(null);
    this.api.getStatistiques().subscribe({
      next: (s) => this.stats.set(s),
      error: () => this.erreur.set(true)
    });
    this.chargerSynthese();
    this.chargerSignalements();
    this.chargerNotifications();
  }

  cleSemestre(s: SemestreCivil): string {
    return `${s.semestre}-${s.annee}`;
  }

  choisirSemestre(cle: string) {
    const s = this.semestres.find((x) => this.cleSemestre(x) === cle);
    if (!s) return;
    this.semestreChoisi.set(s);
    this.chargerSynthese();
  }

  chargerSynthese() {
    const demande = this.semestreChoisi();
    this.erreurSynthese.set(false);
    this.synthese.set(null);
    this.api.getSynthese(demande).subscribe({
      // Une réponse tardive d'un semestre abandonné entre-temps est ignorée
      next: (s) => { if (this.cleSemestre(this.semestreChoisi()) === this.cleSemestre(demande)) this.synthese.set(s); },
      error: () => this.erreurSynthese.set(true)
    });
  }

  // Les erreurs signalées par les résidents restent affichées tant qu'elles ne sont pas traitées.
  chargerSignalements() {
    this.api.getSignalements().subscribe({
      next: (liste) => this.signalements.set(liste),
      error: () => this.signalements.set([])
    });
  }

  signalementTraite(s: Signalement) {
    this.aTraiter.set(null);
    this.signalements.update((liste) => liste.filter((x) => x.id !== s.id));
    this.chargerSynthese();
  }

  // Fiches du semestre pas encore annoncées par e-mail
  chargerNotifications() {
    this.api.getNotificationsFiches().subscribe({
      next: (n) => this.notifications.set(n),
      error: () => this.notifications.set(null)
    });
  }

  envoyerNotifications() {
    this.envoiEnCours.set(true);
    this.api.envoyerNotificationsFiches().subscribe({
      next: (res) => {
        this.envoiEnCours.set(false);
        if (res.echecs > 0) this.toast.erreur(res.message);
        else this.toast.succes(res.message);
        this.chargerNotifications();
        this.chargerSynthese();
      },
      error: (err) => {
        this.envoiEnCours.set(false);
        this.toast.erreur(err.error?.message || "Les e-mails n'ont pas pu être envoyés.");
      }
    });
  }

  allerAuxSignalements() {
    document.getElementById('bloc-signalements')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Tout ce qui demande une intervention aujourd'hui, du plus urgent au moins urgent
  readonly sujets = computed<SujetATraiter[]>(() => {
    const s = this.stats();
    if (!s) return [];
    const liste: SujetATraiter[] = [];
    const sg = this.signalements();
    if (sg.length > 0) {
      const plusAncien = sg.reduce((a, b) => (a.cree_le < b.cree_le ? a : b));
      liste.push({
        cle: 'signalements', gravite: 'critique', icone: 'bi-flag-fill', nombre: sg.length, action: 'signalements',
        titre: 'Erreurs signalées par les résidents',
        detail: `Le plus ancien date du ${new Date(plusAncien.cree_le).toLocaleDateString('fr-FR')}`
      });
    }
    const n = this.notifications();
    if (n && n.residents > 0) {
      liste.push({
        cle: 'notifier', gravite: 'attention', icone: 'bi-envelope-paper', nombre: n.fiches, action: 'notifier',
        titre: `${n.fiches} fiche(s) du semestre pas encore annoncée(s)`,
        detail: `${n.residents} résident(s) recevront un e-mail « votre fiche est disponible ».`
          + (n.sansEmail > 0 ? ` ${n.sansEmail} autre(s) n'ont pas d'e-mail et ne seront pas prévenus.` : '')
      });
    }
    const ajouter = (sujet: SujetATraiter) => { if (sujet.nombre > 0) liste.push(sujet); };
    ajouter({ cle: 'a-relancer', gravite: 'attention', icone: 'bi-download', nombre: s.aRelancer,
      titre: 'Fiches à récupérer', detail: 'Fiche du semestre disponible, jamais téléchargée', queryParams: { alerte: 'a-relancer' } });
    ajouter({ cle: 'sans-email', gravite: 'attention', icone: 'bi-envelope-slash', nombre: s.sansEmail,
      titre: 'Résidents sans e-mail', detail: 'Ne peuvent ni se connecter ni être prévenus', queryParams: { email: 'sans', actifs: 1 } });
    ajouter({ cle: 'sans-fiche', gravite: 'info', icone: 'bi-calendar-x', nombre: s.sansFicheSemestre,
      titre: 'Sans fiche ce semestre', detail: 'Résidents en cours sans stage enregistré', queryParams: { alerte: 'sans-fiche-semestre' } });
    ajouter({ cle: 'sans-stage', gravite: 'info', icone: 'bi-journal-x', nombre: s.sansStage,
      titre: 'Résidents sans aucun stage', detail: 'Mutation, mobilité, report… à vérifier', queryParams: { alerte: 'sans-stage' } });
    if (s.absentsRegistre) {
      const imp = s.absentsRegistre.import;
      ajouter({ cle: 'absents', gravite: 'info', icone: 'bi-person-dash', nombre: s.absentsRegistre.total,
        titre: 'Absents du dernier registre',
        detail: imp.filename + (imp.semestre ? ` (${imp.semestre} ${imp.annee})` : ''), queryParams: { alerte: 'absents-registre' } });
    }
    return liste.sort((a, b) => ORDRE_GRAVITE[a.gravite] - ORDRE_GRAVITE[b.gravite]);
  });

  // Indicateurs du semestre choisi, chacun avec son évolution sur six semestres
  readonly indicateurs = computed(() => {
    const s = this.synthese();
    if (!s) return null;
    const ref = s.comparaison.libelle;
    const serie = (champ: 'residents' | 'fiches' | 'tauxRecuperation') => s.semestres.map((x) => x[champ]);
    const sig = s.indicateurs.signalements;
    return {
      residents: { ...s.indicateurs.residents, evolution: evolution(s.indicateurs.residents, 'nombre', ref), serie: serie('residents') },
      fiches: { ...s.indicateurs.fiches, evolution: evolution(s.indicateurs.fiches, 'pourcentage', ref), serie: serie('fiches') },
      taux: { ...s.indicateurs.tauxRecuperation, evolution: evolution(s.indicateurs.tauxRecuperation, 'points', ref), serie: serie('tauxRecuperation') },
      signalements: {
        ...sig,
        detail: sig.recus === 0
          ? `Aucun signalement reçu en ${s.semestre.libelle}`
          : sig.delaiMedianHeures === null
            ? `${sig.recus} reçu(s) en ${s.semestre.libelle}, aucun traité`
            : `${sig.recus} reçu(s) en ${s.semestre.libelle}, traités en ${delaiLisible(sig.delaiMedianHeures)} (médiane)`
      }
    };
  });

  // Étapes de diffusion des fiches : largeur de chaque barre rapportée aux fiches créées
  readonly diffusion = computed(() => {
    const s = this.synthese();
    if (!s) return [];
    const { creees, annoncees, telechargees } = s.diffusion;
    const part = (n: number) => (creees > 0 ? Math.round((n / creees) * 100) : 0);
    return [
      { libelle: 'Fiches créées', valeur: creees, part: 100, detail: '' },
      { libelle: 'Annoncées par e-mail', valeur: annoncees, part: part(annoncees), detail: `(${part(annoncees)} %)` },
      { libelle: 'Téléchargées', valeur: telechargees, part: part(telechargees), detail: `(${part(telechargees)} %)` }
    ];
  });

  readonly totalTelechargements = computed(() => (this.synthese()?.semaines ?? []).reduce((n, s) => n + s.telechargements, 0));

  pourcentage(n: number, total: number): number {
    return total > 0 ? Math.round((n / total) * 100) : 0;
  }
}
