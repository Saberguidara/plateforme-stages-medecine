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

  it('affiche les chiffres du semestre avec des liens vers la liste filtrée', async () => {
    httpMock.expectOne(`${environment.apiUrl}/admin/statistiques`).flush({
      semestre: { semestre: 'S2', annee: 2026 },
      promotions: [
        { niveau: 1, promotion: 2026, total: 12 },
        { niveau: 2, promotion: 2025, total: 9 },
        { niveau: 3, promotion: 2024, total: 7 }
      ],
      actifs: 28, fichesSemestre: 40, residentsAvecFiche: 25, sansFicheSemestre: 3, sansEmail: 4,
      sansStage: 1, ficheRecuperee: 10, aRelancer: 15, absentsRegistre: null, derniersImports: []
    });
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
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Statistiques indisponibles');
  });
});
