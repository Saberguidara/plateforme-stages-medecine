import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface FichePayload {
  resident_id?: number;
  periode: string;
  annee: number;
  service: string;
  hopital: string;
  url_pdf?: string;
}

export interface ApiMutationResponse {
  success: boolean;
  message: string;
  id?: number;
}

export interface FicheDossier {
  id: number;
  periode: string;
  annee: number;
  service: string;
  hopital: string;
  import_id: number | null;
  modifie_le: string | null;
  annee_residanat: number | null;
  nb_telechargements: number;
  dernier_telechargement: string | null;
  signalement_id: number | null;
  signalement_motif: MotifSignalement | null;
  signalement_message: string | null;
  signale_le: string | null;
}

export interface DossierResident {
  id: number;
  cin: string;
  nom_prenom: string;
  email: string | null;
  specialite: string;
  faculte_origine: string | null;
  promotion: number | null;
  niveau_saisi: number | null;
  niveau: number | null;
  parcours_termine: boolean;
  fiches: FicheDossier[];
  semestreCourant: { semestre: string; annee: number; fiches: number; recuperee: boolean };
}

export type MotifSignalement = 'hopital' | 'service' | 'periode' | 'autre';

export const LIBELLES_MOTIFS: Record<MotifSignalement, string> = {
  hopital: "L'hôpital",
  service: 'Le service',
  periode: 'La période',
  autre: 'Autre'
};

export interface Signalement {
  id: number;
  fiche_id: number;
  resident_id: number;
  motif: MotifSignalement;
  message: string | null;
  cree_le: string;
  traite_le: string | null;
  traite_par: string | null;
  reponse: string | null;
  nom_prenom: string;
  periode: string;
  annee: number;
  hopital: string | null;
  service: string | null;
}

export interface ContactService {
  email: string | null;
  telephone: string | null;
  adresse: string | null;
  horaires: string | null;
}

export interface NotificationsEnAttente {
  semestre: string;
  annee: number;
  residents: number;
  fiches: number;
  sansEmail: number;
  envoiPossible: boolean;
}

export interface ResumeImport {
  id: number;
  filename: string;
  imported_at: string;
  admin_login: string | null;
  semestre: string | null;
  annee: number | null;
  residents_created: number;
  fiches_created: number;
  residents_vus?: number;
  undone: boolean;
  fiches_restantes?: number;
  fiches_modifiees?: number;
  annulable?: boolean;
}

export interface Statistiques {
  semestre: { semestre: string; annee: number };
  promotions: { niveau: number; promotion: number; total: number }[];
  actifs: number;
  fichesSemestre: number;
  residentsAvecFiche: number;
  sansFicheSemestre: number;
  sansEmail: number;
  sansStage: number;
  ficheRecuperee: number;
  aRelancer: number;
  absentsRegistre: { total: number; import: { id: number; filename: string; semestre: string | null; annee: number | null } } | null;
  derniersImports: ResumeImport[];
}

export interface SemestreCivil {
  semestre: 'S1' | 'S2';
  annee: number;
}

export interface Indicateur {
  valeur: number | null;
  precedent: number | null;
}

// Un semestre de la série d'évolution (fiches des périodes rattachées au semestre civil)
export interface BilanSemestre extends SemestreCivil {
  libelle: string;
  fiches: number;
  residents: number;
  annoncees: number;
  telechargees: number;
  tauxRecuperation: number | null;
}

export interface SemaineActivite {
  debut: string; // lundi, AAAA-MM-JJ
  telechargements: number;
  envois: number;
}

export interface SyntheseStatistiques {
  semestre: SemestreCivil & { libelle: string };
  comparaison: SemestreCivil & { libelle: string };
  enCours: boolean;
  indicateurs: {
    residents: Indicateur;
    fiches: Indicateur;
    tauxRecuperation: Indicateur;
    signalements: { ouverts: number; plusAncien: string | null; recus: number; traites: number; delaiMedianHeures: number | null };
  };
  diffusion: { creees: number; annoncees: number; telechargees: number };
  semestres: BilanSemestre[];
  semaines: SemaineActivite[];
}

// ===== Module Statistiques =====

export interface FiltresStatistiques {
  annee: number;
  semestre: '' | 'S1' | 'S2';
  promotion: number | null;
  faculte: string;
  hopital: string;
}

export interface OptionsStatistiques {
  annees: number[];
  promotions: number[];
  facultes: string[];
  hopitaux: string[];
}

export interface LigneCarte {
  hopital: string;
  autres?: boolean;
  total: number;
  valeurs: Record<string, number>;
}

export interface Affectations {
  filtres: FiltresStatistiques;
  totaux: { fiches: number; residents: number; hopitaux: number; services: number };
  types: { trimestre: number; semestre: number; rattrapage: number };
  parHopital: { hopital: string; fiches: number; residents: number; trimestres: number; semestres: number; rattrapages: number }[];
  parService: { service: string; fiches: number; hopitaux: number }[];
  parNiveau: { niveau: number; fiches: number; residents: number }[];
  parFaculte: { faculte: string; residents: number; fiches: number }[];
  carte: { colonnes: string[]; max: number; lignes: LigneCarte[] };
  evolution: (SemestreCivil & { libelle: string; fiches: number; residents: number })[];
}

export interface DetailAffectation {
  hopital: string;
  colonne: string;
  annee: number;
  residents: number;
  services: { service: string; residents: number }[];
  liste: { id: number; nom_prenom: string; service: string; periode: string; niveau: number | null }[];
}

export type EtatSemestre = 'fait' | 'rattrape' | 'partiel' | 'manquant' | 'en-cours' | 'prevu' | 'a-venir';

export interface SemestreParcours {
  niveau: number;
  semestre: 'S1' | 'S2';
  annee: number;
  etat: EtatSemestre;
  stages: { periode: string; service: string | null; hopital: string | null }[];
}

export interface ParcoursResident {
  id: number;
  nom_prenom: string;
  faculte: string | null;
  niveau: number;
  promotion: number;
  semestres: SemestreParcours[];
  faits: number;
  total: number;
  incomplets: number;
  sansFicheCourant: boolean;
  horsParcours: number;
}

export interface ResumePromotion {
  promotion: number;
  niveau: number;
  residents: number;
  aJour: number;
  incomplets: number;
  sansFicheCourant: number;
}

export interface Parcours {
  courant: SemestreCivil;
  promotions: ResumePromotion[];
  residents: ParcoursResident[];
}

export interface Diffusion {
  semestre: SemestreCivil & { libelle: string };
  enCours: boolean;
  totaux: { fiches: number; annoncees: number; telechargees: number; residentsPrevenus: number; jamaisTelechargees: number; jamaisSansEmail: number };
  delaiMedianHeures: number | null;
  partMoins24h: number | null;
  tranches: { cle: string; libelle: string; fiches: number }[];
  parNiveau: { niveau: number; fiches: number; telechargees: number; taux: number | null }[];
  rappels: { disponibles: boolean; migrationManquante: boolean; residents: number; fiches: number; sansEmail: number };
}

export interface ControleQualite {
  cle: string;
  gravite: 'critique' | 'attention' | 'info';
  titre: string;
  detail: string;
  nombre: number;
  base: number;
  exemples: { id?: number; nom_prenom?: string; precision?: string; ids?: number[] }[];
}

export interface Qualite {
  score: number;
  poids: Record<string, number>;
  residentsActifs: number;
  anomalies: number;
  controles: ControleQualite[];
  signalements: {
    ouverts: number;
    recus12Mois: number;
    parMotif: { motif: MotifSignalement; signalements: number }[];
    parHopital: { hopital: string; signalements: number }[];
    parMois: { mois: string; traites: number; delaiMedianHeures: number | null }[];
  };
}

export type EcranVue = 'residents' | 'statistiques' | 'parcours';

export interface VueEnregistree {
  id: number;
  nom: string;
  ecran: EcranVue;
  parametres: Record<string, string>;
  cree_par: string | null;
}

export interface ActionJournal {
  id: number;
  cree_le: string;
  admin_login: string | null;
  action: string;
  entite: string;
  entite_id: number | null;
  resident_id: number | null;
  resident_nom: string | null;
  avant: any;
  apres: any;
  // Annulation : date et auteur si l'action a été annulée, sinon si elle peut l'être (et pourquoi pas)
  annule_le: string | null;
  annule_par: string | null;
  annulation_de: number | null;
  annulable: boolean;
  raison?: string;
}

export interface SuggestionResident {
  id: number;
  cin: string;
  nom_prenom: string;
  promotion: number | null;
  niveau: number | null;
  parcours_termine?: boolean;
  specialite: string;
}

export interface ConfigSpecialite {
  libelle: string;
  periodes: string[];
  duree: number;
}

export interface CompteAdmin {
  id: number;
  login: string;
  nom: string | null;
  role: 'admin' | 'lecture';
  actif: boolean;
  cree_le: string;
  derniere_connexion: string | null;
}

export interface ValeurReferentiel {
  valeur: string;
  nb_fiches: number;
}

export interface GroupeVariantes {
  cible: string;
  variantes: ValeurReferentiel[];
}

// Hôpitaux du semestre et leurs services, pour les filtres de l'export ZIP
export interface LieuExport {
  hopital: string;
  fiches: number;
  services: { service: string; fiches: number }[];
}

export interface CompteFichesExport {
  semestre: string;
  annee: number;
  total: number;
  maximum: number;
  hopitaux: LieuExport[];
}

// Filtres de la liste des résidents, repris tels quels par l'export Excel
export type FiltresResidents = Record<string, string | number | boolean | undefined | null>;

function versParams(filtres: FiltresResidents): HttpParams {
  let p = new HttpParams();
  for (const [cle, valeur] of Object.entries(filtres)) {
    if (valeur !== undefined && valeur !== null && valeur !== '') p = p.set(cle, String(valeur));
  }
  return p;
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  // ===== Résidents =====

  getResidentByCin(cin: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/residents/${cin}`);
  }

  getAllResidents(filtres: FiltresResidents): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/admin/residents`, { params: versParams(filtres) });
  }

  getDossier(id: number): Observable<DossierResident> {
    return this.http.get<DossierResident>(`${this.apiUrl}/admin/residents/${id}`);
  }

  rechercher(q: string): Observable<SuggestionResident[]> {
    return this.http.get<SuggestionResident[]>(`${this.apiUrl}/admin/recherche`, { params: { q } });
  }

  verifierCin(cin: string, exclure?: number): Observable<{ existe: boolean; resident?: { id: number; nom_prenom: string } }> {
    return this.http.get<any>(`${this.apiUrl}/admin/residents/verifier-cin`, { params: versParams({ cin, exclure }) });
  }

  getPromotions(): Observable<number[]> {
    return this.http.get<number[]>(`${this.apiUrl}/admin/promotions`);
  }

  createResident(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/admin/residents`, data);
  }

  updateResident(id: number, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/admin/residents/${id}`, data);
  }

  deleteResident(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/admin/residents/${id}`);
  }

  // ===== Fiches / Stages =====

  updateFiche(idFiche: number, donnees: FichePayload): Observable<ApiMutationResponse> {
    return this.http.put<ApiMutationResponse>(`${this.apiUrl}/admin/fiches/${idFiche}`, donnees);
  }

  createFiche(data: FichePayload): Observable<ApiMutationResponse> {
    return this.http.post<ApiMutationResponse>(`${this.apiUrl}/admin/fiches`, data);
  }

  deleteFiche(id: number): Observable<ApiMutationResponse> {
    return this.http.delete<ApiMutationResponse>(`${this.apiUrl}/admin/fiches/${id}`);
  }

  // Le serveur relit le résident en base ; seules les informations du stage viennent du formulaire.
  apercuFiche(donnees: FichePayload): Observable<Blob> {
    return this.http.post(`${this.apiUrl}/admin/apercu-pdf`, donnees, { responseType: 'blob' });
  }

  // ===== Signalements d'erreur sur une fiche =====

  signalerErreur(donnees: { ficheId: number; motif: MotifSignalement; message: string }): Observable<ApiMutationResponse> {
    return this.http.post<ApiMutationResponse>(`${this.apiUrl}/signalements`, donnees);
  }

  getSignalements(statut: 'ouverts' | 'traites' = 'ouverts'): Observable<Signalement[]> {
    return this.http.get<Signalement[]>(`${this.apiUrl}/admin/signalements`, { params: { statut } });
  }

  traiterSignalement(id: number, reponse = ''): Observable<ApiMutationResponse> {
    return this.http.put<ApiMutationResponse>(`${this.apiUrl}/admin/signalements/${id}/traite`, { reponse });
  }

  // ===== E-mails « nouvelle fiche disponible » et contact =====

  getNotificationsFiches(): Observable<NotificationsEnAttente> {
    return this.http.get<NotificationsEnAttente>(`${this.apiUrl}/admin/notifications/fiches`);
  }

  envoyerNotificationsFiches(): Observable<{ envoyes: number; fiches: number; echecs: number; message: string }> {
    return this.http.post<any>(`${this.apiUrl}/admin/notifications/fiches`, {});
  }

  getContact(): Observable<ContactService> {
    return this.http.get<ContactService>(`${this.apiUrl}/contact`);
  }

  // ===== Référentiels =====

  getSpecialites(): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/admin/specialites`);
  }

  getConfigSpecialites(): Observable<ConfigSpecialite[]> {
    return this.http.get<ConfigSpecialite[]>(`${this.apiUrl}/admin/specialites/config`);
  }

  suggestions(type: 'hopital' | 'service', q: string, hopital = ''): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/admin/referentiels/suggestions`, { params: versParams({ type, q, hopital }) });
  }

  getReferentiel(type: 'hopital' | 'service'): Observable<{ valeurs: ValeurReferentiel[]; groupes: GroupeVariantes[] }> {
    return this.http.get<any>(`${this.apiUrl}/admin/referentiels/${type}`);
  }

  fusionnerReferentiel(type: 'hopital' | 'service', sources: string[], cible: string): Observable<{ message: string; fichesModifiees: number }> {
    return this.http.post<any>(`${this.apiUrl}/admin/referentiels/fusion`, { type, sources, cible });
  }

  // « Ne pas fusionner » : ces écritures ne seront plus proposées ensemble
  ignorerVariantes(type: 'hopital' | 'service', valeurs: string[]): Observable<{ message: string }> {
    return this.http.post<any>(`${this.apiUrl}/admin/referentiels/ignorer`, { type, valeurs });
  }

  // ===== Tableau de bord, imports et journal =====

  getStatistiques(): Observable<Statistiques> {
    return this.http.get<Statistiques>(`${this.apiUrl}/admin/statistiques`);
  }

  getSynthese(s: SemestreCivil): Observable<SyntheseStatistiques> {
    return this.http.get<SyntheseStatistiques>(`${this.apiUrl}/admin/statistiques/synthese`, {
      params: { semestre: s.semestre, annee: s.annee }
    });
  }

  getOptionsStatistiques(): Observable<OptionsStatistiques> {
    return this.http.get<OptionsStatistiques>(`${this.apiUrl}/admin/statistiques/options`);
  }

  getAffectations(f: FiltresStatistiques): Observable<Affectations> {
    return this.http.get<Affectations>(`${this.apiUrl}/admin/statistiques/affectations`, { params: versParams({ ...f }) });
  }

  getDetailAffectation(f: FiltresStatistiques, hopital: string, colonne: string): Observable<DetailAffectation> {
    return this.http.get<DetailAffectation>(`${this.apiUrl}/admin/statistiques/affectations/detail`, {
      params: versParams({ ...f, hopital, colonne })
    });
  }

  exporterAffectations(f: FiltresStatistiques): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/admin/statistiques/affectations.xlsx`, { params: versParams({ ...f }), responseType: 'blob' });
  }

  getParcours(filtres: { promotion?: number | null; faculte?: string; etat?: string; search?: string }): Observable<Parcours> {
    return this.http.get<Parcours>(`${this.apiUrl}/admin/statistiques/parcours`, { params: versParams(filtres) });
  }

  getDiffusion(s: SemestreCivil): Observable<Diffusion> {
    return this.http.get<Diffusion>(`${this.apiUrl}/admin/statistiques/diffusion`, { params: { semestre: s.semestre, annee: s.annee } });
  }

  envoyerRappels(): Observable<{ envoyes: number; fiches: number; echecs: number; message: string }> {
    return this.http.post<any>(`${this.apiUrl}/admin/statistiques/diffusion/rappels`, {});
  }

  getQualite(): Observable<Qualite> {
    return this.http.get<Qualite>(`${this.apiUrl}/admin/statistiques/qualite`);
  }

  telechargerRapport(s: SemestreCivil): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/admin/statistiques/rapport.pdf`, { params: { semestre: s.semestre, annee: s.annee }, responseType: 'blob' });
  }

  getVues(): Observable<{ disponible: boolean; vues: VueEnregistree[] }> {
    return this.http.get<{ disponible: boolean; vues: VueEnregistree[] }>(`${this.apiUrl}/admin/vues`);
  }

  creerVue(vue: { nom: string; ecran: EcranVue; parametres: Record<string, string> }): Observable<VueEnregistree & { message: string }> {
    return this.http.post<VueEnregistree & { message: string }>(`${this.apiUrl}/admin/vues`, vue);
  }

  supprimerVue(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/admin/vues/${id}`);
  }

  getImports(): Observable<ResumeImport[]> {
    return this.http.get<ResumeImport[]>(`${this.apiUrl}/admin/imports`);
  }

  annulerImport(importId: number): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/admin/import/undo`, { importId });
  }

  getJournal(filtres: { resident_id?: number; entite?: string; action?: string; page?: number; limit?: number }): Observable<{ data: ActionJournal[]; total: number; page: number; limit: number }> {
    return this.http.get<any>(`${this.apiUrl}/admin/journal`, { params: versParams(filtres) });
  }

  annulerAction(id: number): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/admin/journal/${id}/annuler`, {});
  }

  // ===== Exports =====

  exporterResidents(filtres: FiltresResidents): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/admin/exports/residents.xlsx`, { params: versParams(filtres), responseType: 'blob' });
  }

  compterFichesExport(filtres: FiltresResidents): Observable<CompteFichesExport> {
    return this.http.get<any>(`${this.apiUrl}/admin/exports/fiches/compte`, { params: versParams(filtres) });
  }

  exporterFiches(filtres: FiltresResidents): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/admin/exports/fiches.zip`, { params: versParams(filtres), responseType: 'blob' });
  }

  // ===== Comptes administrateurs =====

  getComptes(): Observable<CompteAdmin[]> {
    return this.http.get<CompteAdmin[]>(`${this.apiUrl}/admin/comptes`);
  }

  creerCompte(donnees: { login: string; nom: string; mot_de_passe: string; role: string }): Observable<ApiMutationResponse> {
    return this.http.post<ApiMutationResponse>(`${this.apiUrl}/admin/comptes`, donnees);
  }

  modifierCompte(id: number, donnees: Partial<{ nom: string; role: string; actif: boolean; mot_de_passe: string }>): Observable<ApiMutationResponse> {
    return this.http.put<ApiMutationResponse>(`${this.apiUrl}/admin/comptes/${id}`, donnees);
  }

  // ===== Fichiers =====

  getFileUrl(filename: string) {
    if (!filename) return null;
    if (/^https?:\/\//i.test(filename)) return filename;
    return `${this.apiUrl}/files/${encodeURIComponent(filename)}`;
  }

  downloadFile(filenameOrUrl: string) {
    const url = this.getFileUrl(filenameOrUrl) || filenameOrUrl;
    return this.http.get(url, { responseType: 'blob' as 'json' }) as Observable<Blob>;
  }
}

// Enregistre un fichier reçu du serveur sur le poste de l'utilisateur.
export function enregistrerFichier(blob: Blob, nomFichier: string) {
  const url = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nomFichier;
  lien.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
