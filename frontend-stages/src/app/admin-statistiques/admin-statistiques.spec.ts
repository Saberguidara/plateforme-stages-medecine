import { ComponentFixture, TestBed } from '@angular/core/testing';
import { convertToParamMap, provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { AdminStatistiques, filtresDepuis, intensite } from './admin-statistiques';
import { environment } from '../../environments/environment';

const api = environment.apiUrl;

const AFFECTATIONS = {
  filtres: { annee: 2026, semestre: '', promotion: null, faculte: '', hopital: '' },
  totaux: { fiches: 512, residents: 202, hopitaux: 33, services: 97 },
  types: { trimestre: 237, semestre: 273, rattrapage: 2 },
  parHopital: [
    { hopital: 'Hôpital Hédi Chaker de Sfax', fiches: 119, residents: 70, trimestres: 118, semestres: 0, rattrapages: 1 },
    { hopital: 'Direction Régionale de la Santé de Sfax', fiches: 109, residents: 89, trimestres: 0, semestres: 109, rattrapages: 0 }
  ],
  parService: [{ service: "Médecine d'Urgence", fiches: 60, hopitaux: 8 }],
  parNiveau: [{ niveau: 1, fiches: 259, residents: 82 }, { niveau: 2, fiches: 117, residents: 61 }],
  parFaculte: [{ faculte: 'FMSfax', residents: 190, fiches: 493 }],
  carte: {
    colonnes: ['T1', 'T2', 'S1'], max: 60,
    lignes: [
      { hopital: 'Hôpital Hédi Chaker de Sfax', total: 55, valeurs: { T1: 28, T2: 27, S1: 0 } },
      { hopital: 'Autres (21 hôpitaux)', autres: true, total: 27, valeurs: { T1: 3, T2: 6, S1: 18 } }
    ]
  },
  evolution: [
    { semestre: 'S1', annee: 2026, libelle: 'S1 2026', fiches: 250, residents: 190 },
    { semestre: 'S2', annee: 2026, libelle: 'S2 2026', fiches: 262, residents: 190 }
  ]
};

describe('AdminStatistiques', () => {
  let fixture: ComponentFixture<AdminStatistiques>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminStatistiques],
      providers: [provideRouter([{ path: '**', component: AdminStatistiques }]), provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
    fixture = TestBed.createComponent(AdminStatistiques);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne(`${api}/admin/statistiques/options`)
      .flush({ annees: [2026, 2025], promotions: [2026, 2025, 2024], facultes: ['FMSfax'], hopitaux: ['Hôpital Hédi Chaker de Sfax'] });
  });

  afterEach(() => {
    // Liste des vues enregistrées, chargée par le bouton « Enregistrer la vue »
    httpMock.match((r) => r.url === `${environment.apiUrl}/admin/vues`).forEach((r) => r.flush({ disponible: true, vues: [] }));
    httpMock.verify();
  });

  async function rendre() {
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it("affiche la vue d'ensemble : totaux, évolution, types de période", async () => {
    httpMock.expectOne((r) => r.url === `${api}/admin/statistiques/affectations`).flush(AFFECTATIONS);
    const page = await rendre();
    expect(Array.from(page.querySelectorAll('.kpi-valeur')).map((e) => e.textContent?.trim())).toEqual(['512', '202', '33', '97']);
    expect(page.querySelector('app-courbe-semestres svg')?.getAttribute('aria-label')).toContain('de 250 (S1 2026) à 262 (S2 2026)');
    expect(page.querySelector('.anneau')?.getAttribute('aria-label')).toBe('46.3 % de trimestres, 53.3 % de semestres, 0.4 % de rattrapages');
    expect(page.textContent).toContain('1ère année');
  });

  it("ouvre le détail d'une case de la carte, mais pas celui de la ligne « Autres »", async () => {
    httpMock.expectOne((r) => r.url === `${api}/admin/statistiques/affectations`).flush(AFFECTATIONS);
    fixture.componentInstance.onglet.set('affectations');
    const page = await rendre();

    const cases = page.querySelectorAll<HTMLButtonElement>('button.carte-case');
    expect(cases.length).toBe(2); // 28 et 27 ; les zéros et la ligne « Autres » ne sont pas cliquables
    cases[0].click();
    const req = httpMock.expectOne((r) => r.url === `${api}/admin/statistiques/affectations/detail`);
    expect(req.request.params.get('hopital')).toBe('Hôpital Hédi Chaker de Sfax');
    expect(req.request.params.get('colonne')).toBe('T1');
    req.flush({ hopital: 'Hôpital Hédi Chaker de Sfax', colonne: 'T1', annee: 2026, residents: 2,
      services: [{ service: 'Cardiologie', residents: 2 }],
      liste: [{ id: 7, nom_prenom: 'RÉSIDENT TEST', service: 'Cardiologie', periode: 'T1', niveau: 2 }] });
    await rendre();
    expect(page.querySelector('.detail-case')?.textContent).toContain('RÉSIDENT TEST');
    expect(page.querySelector('.detail-case a[href="/admin/residents/7"]')).toBeTruthy();
  });

  it("met les filtres dans l'adresse", async () => {
    httpMock.expectOne((r) => r.url === `${api}/admin/statistiques/affectations`).flush(AFFECTATIONS);
    const router = TestBed.inject(Router);
    fixture.componentInstance.modifier({ semestre: 'S2', promotion: 2025 });
    await fixture.whenStable();
    expect(router.url).toContain('semestre=S2');
    expect(router.url).toContain('promotion=2025');
    const req = httpMock.expectOne((r) => r.url === `${api}/admin/statistiques/affectations`);
    expect(req.request.params.get('semestre')).toBe('S2');
    req.flush(AFFECTATIONS);
  });
});

describe('Calculs des statistiques', () => {
  it("lit les filtres de l'adresse en écartant les valeurs invalides", () => {
    expect(filtresDepuis(convertToParamMap({ annee: '2025', semestre: 'S1', promotion: '2024', faculte: 'FMSfax' }), 2026))
      .toEqual({ annee: 2025, semestre: 'S1', promotion: 2024, faculte: 'FMSfax', hopital: '' });
    expect(filtresDepuis(convertToParamMap({ annee: 'abc', semestre: 'S9', promotion: 'x' }), 2026))
      .toEqual({ annee: 2026, semestre: '', promotion: null, faculte: '', hopital: '' });
  });

  it("gradue l'intensité des cases de la carte", () => {
    expect([0, 10, 20, 40, 60].map((v) => intensite(v, 60))).toEqual([0, 1, 2, 3, 4]);
    expect(intensite(5, 0)).toBe(0);
  });
});
