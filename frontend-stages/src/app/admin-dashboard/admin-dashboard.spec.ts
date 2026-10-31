import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { AdminDashboard } from './admin-dashboard';
import { environment } from '../../environments/environment';

describe('AdminDashboard', () => {
  let fixture: ComponentFixture<AdminDashboard>;
  let httpMock: HttpTestingController;

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

  // Requêtes secondaires du tableau de bord : signalements et e-mails « nouvelle fiche » en attente
  const signalements = (liste: object[] = [], notifications: object = AUCUNE_NOTIFICATION) => {
    httpMock.expectOne((r) => r.url === `${environment.apiUrl}/admin/signalements`).flush(liste);
    httpMock.expectOne(`${environment.apiUrl}/admin/notifications/fiches`).flush(notifications);
  };

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

  it('affiche les chiffres du semestre avec des liens vers la liste filtrée', async () => {
    httpMock.expectOne(`${environment.apiUrl}/admin/statistiques`).flush(STATS);
    signalements();
    await fixture.whenStable();

    const page: HTMLElement = fixture.nativeElement;
    expect(page.textContent).toContain('Semestre en cours · S2 2026');
    const liens = Array.from(page.querySelectorAll<HTMLAnchorElement>('a.tuile')).map((a) => a.getAttribute('href'));
    expect(liens).toContain('/admin/residents?promo=2026&actifs=1');
    expect(liens).toContain('/admin/residents?alerte=a-relancer');
    expect(liens).toContain('/admin/residents?email=sans&actifs=1');
  });

  it("affiche un état d'erreur si le serveur ne répond pas", async () => {
    httpMock.expectOne(`${environment.apiUrl}/admin/statistiques`).flush('Erreur', { status: 500, statusText: 'Server Error' });
    signalements();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Statistiques indisponibles');
  });

  it('liste les erreurs signalées par les résidents', async () => {
    httpMock.expectOne(`${environment.apiUrl}/admin/statistiques`).flush(STATS);
    signalements([{ id: 3, fiche_id: 10, resident_id: 4, motif: 'hopital', message: 'Mauvais hôpital', cree_le: '2026-10-30T10:00:00Z',
      traite_le: null, traite_par: null, nom_prenom: 'Résident Test', periode: 'S2', annee: 2026, hopital: 'CHU', service: 'Urgences' }]);
    await fixture.whenStable();

    const page: HTMLElement = fixture.nativeElement;
    expect(page.textContent).toContain('Erreurs signalées par les résidents');
    expect(page.textContent).toContain("L'hôpital");
    expect(page.textContent).toContain('Mauvais hôpital');
    expect(page.querySelector('a[href="/admin/residents/4"]')).toBeTruthy();
  });

  it('propose de prévenir par e-mail les résidents dont la fiche est disponible', async () => {
    httpMock.expectOne(`${environment.apiUrl}/admin/statistiques`).flush(STATS);
    signalements([], { ...AUCUNE_NOTIFICATION, residents: 12, fiches: 14, sansEmail: 3 });
    await fixture.whenStable();

    const page: HTMLElement = fixture.nativeElement;
    expect(page.textContent).toContain('14 fiche(s) du semestre pas encore annoncée(s)');
    expect(page.textContent).toContain("3 autre(s) n'ont pas d'e-mail");
    // Le bouton n'est affiché qu'aux administrateurs complets ; l'envoi lui-même est vérifié ici.
    fixture.componentInstance.envoyerNotifications();
    httpMock.expectOne((r) => r.method === 'POST' && r.url === `${environment.apiUrl}/admin/notifications/fiches`)
      .flush({ envoyes: 12, fiches: 14, echecs: 0, message: '12 résident(s) prévenu(s) par e-mail.' });
    httpMock.expectOne(`${environment.apiUrl}/admin/notifications/fiches`).flush(AUCUNE_NOTIFICATION);
  });
});
