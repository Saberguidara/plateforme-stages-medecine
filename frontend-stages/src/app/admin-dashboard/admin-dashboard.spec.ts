import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { AdminDashboard, delaiLisible, evolution, semestresProposes } from './admin-dashboard';
import { echelle } from '../admin-shared/graphiques';
import { environment } from '../../environments/environment';

describe('AdminDashboard', () => {
  let fixture: ComponentFixture<AdminDashboard>;
  let httpMock: HttpTestingController;
  const api = environment.apiUrl;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminDashboard],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();

    fixture = TestBed.createComponent(AdminDashboard);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  const AUCUNE_NOTIFICATION = { semestre: 'S2', annee: 2026, residents: 0, fiches: 0, sansEmail: 0, envoiPossible: true };

  const STATS = {
    semestre: { semestre: 'S2', annee: 2026 },
    promotions: [
      { niveau: 1, promotion: 2026, total: 12 },
      { niveau: 2, promotion: 2025, total: 9 },
      { niveau: 3, promotion: 2024, total: 7 }
    ],
    actifs: 28, fichesSemestre: 40, residentsAvecFiche: 25, sansFicheSemestre: 3, sansEmail: 4,
    sansStage: 1, ficheRecuperee: 10, aRelancer: 15, absentsRegistre: null, derniersImports: []
  };

  const semestre = (libelle: string, fiches: number, telechargees: number) => {
    const [s, a] = libelle.split(' ');
    return { semestre: s, annee: Number(a), libelle, fiches, residents: fiches - 2, annoncees: fiches, telechargees,
      tauxRecuperation: Math.round((telechargees / fiches) * 100) };
  };

  const SYNTHESE = {
    semestre: { semestre: 'S2', annee: 2026, libelle: 'S2 2026' },
    comparaison: { semestre: 'S2', annee: 2025, libelle: 'S2 2025' },
    enCours: true,
    indicateurs: {
      residents: { valeur: 38, precedent: 30 },
      fiches: { valeur: 40, precedent: 32 },
      tauxRecuperation: { valeur: 70, precedent: 64 },
      signalements: { ouverts: 1, plusAncien: '2026-10-30T10:00:00Z', recus: 4, traites: 3, delaiMedianHeures: 43 }
    },
    diffusion: { creees: 40, annoncees: 36, telechargees: 28 },
    semestres: [semestre('S1 2024', 20, 10), semestre('S2 2024', 24, 14), semestre('S1 2025', 28, 18),
      semestre('S2 2025', 32, 20), semestre('S1 2026', 36, 24), semestre('S2 2026', 40, 28)],
    semaines: [
      { debut: '2026-08-31', telechargements: 5, envois: 36 },
      { debut: '2026-09-07', telechargements: 12, envois: 0 },
      { debut: '2026-09-14', telechargements: 3, envois: 0 }
    ]
  };

  // Toutes les requêtes du tableau de bord ; « stats » peut échouer pour tester l'état d'erreur.
  function repondre(options: { stats?: object | 'erreur'; signalements?: object[]; notifications?: object } = {}) {
    const stats = httpMock.expectOne(`${api}/admin/statistiques`);
    if (options.stats === 'erreur') stats.flush('Erreur', { status: 500, statusText: 'Server Error' });
    else stats.flush(options.stats ?? STATS);
    httpMock.expectOne((r) => r.url === `${api}/admin/statistiques/synthese`).flush(SYNTHESE);
    httpMock.expectOne((r) => r.url === `${api}/admin/signalements`).flush(options.signalements ?? []);
    httpMock.expectOne(`${api}/admin/notifications/fiches`).flush(options.notifications ?? AUCUNE_NOTIFICATION);
  }

  // Le fil d'activité n'apparaît qu'une fois les statistiques reçues
  async function rendre() {
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.match((r) => r.url === `${api}/admin/journal`).forEach((req) => req.flush({ data: [], total: 0, page: 1, limit: 6 }));
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('compare les indicateurs du semestre au même semestre de l\'année précédente', async () => {
    repondre();
    const page = await rendre();

    const cartes = Array.from(page.querySelectorAll('.kpi-carte')).map((c) => c.textContent?.replace(/\s+/g, ' '));
    expect(page.querySelector('.kpi-carte .kpi-libelle')?.textContent).toBe('Résidents en stage');
    expect(page.querySelector('.kpi-carte .kpi-valeur')?.textContent?.trim()).toBe('38');
    expect(cartes[0]).toContain('▲ 8 par rapport à S2 2025');
    expect(cartes[1]).toContain('▲ 25 % par rapport à S2 2025');
    expect(cartes[2]).toContain('70 %');
    expect(cartes[2]).toContain('▲ 6 pts par rapport à S2 2025');
    expect(cartes[3]).toContain('traités en 43 h (médiane)');
    expect(page.querySelectorAll('app-sparkline svg').length).toBe(3);
    expect(page.querySelector('app-histogramme-semaines svg')?.getAttribute('aria-label')).toContain('20 téléchargement(s) sur 3 semaines');
    expect(page.textContent).toContain('Annoncées par e-mail');
  });

  it('relit la synthèse quand on choisit un autre semestre', async () => {
    repondre();
    await rendre();
    const autre = fixture.componentInstance.semestres[2];
    fixture.componentInstance.choisirSemestre(`${autre.semestre}-${autre.annee}`);
    const req = httpMock.expectOne((r) => r.url === `${api}/admin/statistiques/synthese`);
    expect(req.request.params.get('semestre')).toBe(autre.semestre);
    expect(req.request.params.get('annee')).toBe(String(autre.annee));
    req.flush(SYNTHESE);
  });

  it('classe les sujets à traiter par urgence, avec des liens vers la liste filtrée', async () => {
    repondre();
    const page = await rendre();

    const titres = Array.from(page.querySelectorAll('.sujet strong')).map((e) => e.textContent);
    expect(titres).toEqual(['Fiches à récupérer', 'Résidents sans e-mail', 'Sans fiche ce semestre', 'Résidents sans aucun stage']);
    const liens = Array.from(page.querySelectorAll<HTMLAnchorElement>('a.sujet-corps, a.tuile')).map((a) => a.getAttribute('href'));
    expect(liens).toContain('/admin/residents?alerte=a-relancer');
    expect(liens).toContain('/admin/residents?email=sans&actifs=1');
    expect(liens).toContain('/admin/residents?promo=2026&actifs=1');
  });

  it("affiche un état d'erreur si le serveur ne répond pas", async () => {
    repondre({ stats: 'erreur' });
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Statistiques indisponibles');
  });

  it('liste les erreurs signalées par les résidents et les place en tête des sujets', async () => {
    repondre({ signalements: [{ id: 3, fiche_id: 10, resident_id: 4, motif: 'hopital', message: 'Mauvais hôpital', cree_le: '2026-10-30T10:00:00Z',
      traite_le: null, traite_par: null, nom_prenom: 'Résident Test', periode: 'S2', annee: 2026, hopital: 'CHU', service: 'Urgences' }] });
    const page = await rendre();

    expect(page.querySelector('.sujet strong')?.textContent).toBe('Erreurs signalées par les résidents');
    expect(page.textContent).not.toContain('Aucun signalement');
    expect(page.textContent).toContain("L'hôpital");
    expect(page.textContent).toContain('Mauvais hôpital');
    expect(page.querySelector('a[href="/admin/residents/4"]')).toBeTruthy();
  });

  it("garde le bloc des signalements quand il n'y en a aucun", async () => {
    repondre();
    const page = await rendre();
    expect(page.textContent).toContain('Aucun signalement');
  });

  it('propose de prévenir par e-mail les résidents dont la fiche est disponible', async () => {
    repondre({ notifications: { ...AUCUNE_NOTIFICATION, residents: 12, fiches: 14, sansEmail: 3 } });
    const page = await rendre();

    expect(page.textContent).toContain('14 fiche(s) du semestre pas encore annoncée(s)');
    expect(page.textContent).toContain("3 autre(s) n'ont pas d'e-mail");
    // Le bouton n'est affiché qu'aux administrateurs complets ; l'envoi lui-même est vérifié ici.
    fixture.componentInstance.envoyerNotifications();
    httpMock.expectOne((r) => r.method === 'POST' && r.url === `${api}/admin/notifications/fiches`)
      .flush({ envoyes: 12, fiches: 14, echecs: 0, message: '12 résident(s) prévenu(s) par e-mail.' });
    httpMock.expectOne(`${api}/admin/notifications/fiches`).flush(AUCUNE_NOTIFICATION);
    httpMock.expectOne((r) => r.url === `${api}/admin/statistiques/synthese`).flush(SYNTHESE);
  });
});

describe('Calculs du tableau de bord', () => {
  it('propose les six derniers semestres, du plus récent au plus ancien', () => {
    expect(semestresProposes({ semestre: 'S1', annee: 2026 }, 3)).toEqual([
      { semestre: 'S1', annee: 2026 }, { semestre: 'S2', annee: 2025 }, { semestre: 'S1', annee: 2025 }
    ]);
  });

  it("exprime l'évolution en nombre, en pourcentage ou en points", () => {
    expect(evolution({ valeur: 30, precedent: 40 }, 'nombre', 'S2 2025')).toEqual({ texte: '▼ 10 par rapport à S2 2025', sens: 'baisse' });
    expect(evolution({ valeur: 45, precedent: 40 }, 'pourcentage', 'S2 2025').texte).toBe('▲ 12,5 % par rapport à S2 2025');
    expect(evolution({ valeur: 71, precedent: 70 }, 'points', 'S2 2025').texte).toBe('▲ 1 pt par rapport à S2 2025');
    expect(evolution({ valeur: 10, precedent: 10 }, 'nombre', 'S2 2025').sens).toBe('stable');
    expect(evolution({ valeur: 10, precedent: 0 }, 'pourcentage', 'S2 2025').sens).toBe('inconnu');
    expect(evolution({ valeur: 10, precedent: null }, 'nombre', 'S2 2025').texte).toBe('Pas de comparaison avec S2 2025');
  });

  it('écrit les délais de traitement en heures puis en jours', () => {
    expect(delaiLisible(0.5)).toBe("moins d'une heure");
    expect(delaiLisible(5)).toBe('5 h');
    expect(delaiLisible(60)).toBe('2,5 jours');
  });

  it("choisit une graduation ronde pour l'axe des téléchargements", () => {
    expect(echelle(61)).toEqual({ max: 80, pas: 20 });
    expect(echelle(7)).toEqual({ max: 8, pas: 2 });
    expect(echelle(0)).toEqual({ max: 4, pas: 1 });
  });
});
