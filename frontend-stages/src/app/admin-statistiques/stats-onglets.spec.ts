import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { StatsDiffusion } from './stats-diffusion';
import { StatsQualite, libelleMois } from './stats-qualite';
import { semestreAnalyse } from './admin-statistiques';
import { environment } from '../../environments/environment';

const api = environment.apiUrl;

const DIFFUSION = {
  semestre: { semestre: 'S2', annee: 2026, libelle: 'S2 2026' },
  enCours: true,
  totaux: { fiches: 10, annoncees: 8, telechargees: 6, residentsPrevenus: 7, jamaisTelechargees: 4, jamaisSansEmail: 1 },
  delaiMedianHeures: 30,
  partMoins24h: 38,
  tranches: [
    { cle: 'avant', libelle: "Avant l'e-mail", fiches: 0 }, { cle: 'moins-24h', libelle: 'Moins de 24 h', fiches: 3 },
    { cle: '1-3j', libelle: '1 à 3 jours', fiches: 2 }, { cle: '3-7j', libelle: '3 à 7 jours', fiches: 1 },
    { cle: '1-2sem', libelle: '1 à 2 semaines', fiches: 0 }, { cle: 'plus-2sem', libelle: 'Plus de 2 semaines', fiches: 0 },
    { cle: 'jamais', libelle: 'Jamais téléchargée', fiches: 2 }
  ],
  parNiveau: [{ niveau: 1, fiches: 6, telechargees: 5, taux: 83 }, { niveau: 3, fiches: 4, telechargees: 1, taux: 25 }],
  rappels: { disponibles: true, migrationManquante: false, residents: 2, fiches: 2, sansEmail: 1 }
};

describe('Onglet Diffusion', () => {
  let fixture: ComponentFixture<StatsDiffusion>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatsDiffusion],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
    fixture = TestBed.createComponent(StatsDiffusion);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.componentRef.setInput('semestre', { semestre: 'S2', annee: 2026 });
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('affiche les délais de récupération et propose les rappels', async () => {
    const req = httpMock.expectOne((r) => r.url === `${api}/admin/statistiques/diffusion`);
    expect(req.request.params.get('semestre')).toBe('S2');
    req.flush(DIFFUSION);
    await fixture.whenStable();
    fixture.detectChanges();
    const page: HTMLElement = fixture.nativeElement;

    expect(Array.from(page.querySelectorAll('.kpi-valeur')).map((e) => e.textContent?.replace(/\s+/g, ' ').trim()))
      .toEqual(['8 / 10', '30 h', '38 %', '4']);
    expect(page.querySelector('.colonnes-delai')?.getAttribute('aria-label')).toContain('Moins de 24 h : 3');
    expect(page.querySelector('.barres-h-alerte')).toBeTruthy(); // 3e année sous 50 %
    expect(page.textContent).toContain("2 résident(s) n'ont pas téléchargé leur fiche annoncée depuis plus d'une semaine");
    expect(Array.from(page.querySelectorAll('a')).map((x) => x.getAttribute('href'))).toContain('/admin/residents?alerte=a-relancer&email=sans');

    // Le bouton n'est montré qu'aux administrateurs complets ; l'envoi est vérifié directement
    fixture.componentInstance.envoyer();
    httpMock.expectOne((r) => r.method === 'POST' && r.url === `${api}/admin/statistiques/diffusion/rappels`)
      .flush({ envoyes: 2, fiches: 2, echecs: 0, message: 'Rappel envoyé à 2 résident(s).' });
    httpMock.expectOne((r) => r.url === `${api}/admin/statistiques/diffusion`).flush({ ...DIFFUSION, rappels: { ...DIFFUSION.rappels, residents: 0 } });
  });

  it("explique quand la migration des rappels manque", async () => {
    httpMock.expectOne((r) => r.url === `${api}/admin/statistiques/diffusion`)
      .flush({ ...DIFFUSION, rappels: { disponibles: false, migrationManquante: true, residents: 0, fiches: 0, sansEmail: 0 } });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Rappels pas encore activés');
  });
});

describe('Onglet Qualité', () => {
  let fixture: ComponentFixture<StatsQualite>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatsQualite],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
    fixture = TestBed.createComponent(StatsQualite);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('montre le score et classe les contrôles qui trouvent quelque chose en premier', async () => {
    httpMock.expectOne(`${api}/admin/statistiques/qualite`).flush({
      score: 87, poids: { 'sans-promotion': 0.1, 'sans-email': 0.3 }, residentsActifs: 100, anomalies: 9,
      controles: [
        { cle: 'sans-promotion', gravite: 'info', titre: 'Résidents sans promotion', detail: '', nombre: 0, base: 100, exemples: [] },
        { cle: 'sans-email', gravite: 'critique', titre: 'Résidents en cours sans e-mail', detail: '', nombre: 9, base: 100,
          exemples: [{ id: 4, nom_prenom: 'SANS EMAIL' }] }
      ],
      signalements: { ouverts: 1, recus12Mois: 3, parMotif: [{ motif: 'hopital', signalements: 3 }],
        parHopital: [{ hopital: 'CHU', signalements: 3 }], parMois: [{ mois: '2026-11', traites: 2, delaiMedianHeures: 5 }] }
    });
    await fixture.whenStable();
    fixture.detectChanges();
    const page: HTMLElement = fixture.nativeElement;

    expect(page.querySelector('.jauge')?.getAttribute('aria-label')).toBe('Score de qualité : 87 sur 100');
    expect(Array.from(page.querySelectorAll('.sujet strong')).map((e) => e.textContent))
      .toEqual(['Résidents en cours sans e-mail', 'Résidents sans promotion']);
    expect(Array.from(page.querySelectorAll('a')).map((x) => x.getAttribute('href'))).toContain('/admin/residents?email=sans&actifs=1');
    expect(page.querySelector('a[href="/admin/residents/4"]')).toBeTruthy();
    expect(page.textContent).toContain("L'hôpital");
  });
});

describe('Semestre analysé par la diffusion', () => {
  const novembre2026 = new Date(2026, 10, 24);
  const mars2026 = new Date(2026, 2, 1);
  const f = (annee: number, semestre: '' | 'S1' | 'S2' = '') => ({ annee, semestre, promotion: null, faculte: '', hopital: '' });

  it('prend le semestre choisi, sinon le dernier semestre commencé, jamais un semestre futur', () => {
    expect(semestreAnalyse(f(2026), novembre2026)).toEqual({ semestre: 'S2', annee: 2026 });
    expect(semestreAnalyse(f(2026, 'S1'), novembre2026)).toEqual({ semestre: 'S1', annee: 2026 });
    expect(semestreAnalyse(f(2025), novembre2026)).toEqual({ semestre: 'S2', annee: 2025 });
    expect(semestreAnalyse(f(2026, 'S2'), mars2026)).toEqual({ semestre: 'S1', annee: 2026 });
    expect(semestreAnalyse(f(2027), novembre2026)).toEqual({ semestre: 'S2', annee: 2026 });
  });

  it('écrit le mois en abrégé', () => {
    expect(libelleMois('2026-11')).toBe('nov.');
  });
});
