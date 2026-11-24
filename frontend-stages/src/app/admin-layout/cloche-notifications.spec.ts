import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { ClocheNotifications, alertesDepuis } from './cloche-notifications';
import { environment } from '../../environments/environment';

const RESUME = {
  signalements: { ouverts: 2, plusAncien: '2026-11-20T10:00:00Z' },
  fichesNonAnnoncees: { residents: 185, fiches: 256 },
  rappels: { disponibles: true, residents: 12 },
  envoiPossible: true
};

describe('Cloche de notifications', () => {
  let fixture: ComponentFixture<ClocheNotifications>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClocheNotifications],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
    fixture = TestBed.createComponent(ClocheNotifications);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    httpMock.verify();
  });

  it('compte les sujets en attente et les liste du plus urgent au moins urgent', async () => {
    await new Promise((r) => setTimeout(r, 0)); // premier relevé, lancé par un minuteur
    httpMock.expectOne(`${environment.apiUrl}/admin/notifications/resume`).flush(RESUME);
    fixture.detectChanges();
    const page: HTMLElement = fixture.nativeElement;
    expect(page.querySelector('.cloche-badge')?.textContent).toBe('3');
    expect(page.querySelector('.cloche-badge')?.classList).toContain('critique');

    fixture.componentInstance.ouvert.set(true);
    fixture.detectChanges();
    const titres = Array.from(page.querySelectorAll('.cloche-item strong')).map((e) => e.textContent);
    expect(titres).toEqual(['2 signalement(s) à traiter', '256 fiche(s) pas encore annoncée(s)', '12 rappel(s) possible(s)']);
    expect(Array.from(page.querySelectorAll('a')).map((a) => a.getAttribute('href'))).toContain('/admin/statistiques?onglet=diffusion');
  });

  it('ne propose pas de rappel tant que la migration manque', async () => {
    await new Promise((r) => setTimeout(r, 0));
    httpMock.expectOne(`${environment.apiUrl}/admin/notifications/resume`).flush(RESUME);
    expect(alertesDepuis({ ...RESUME, rappels: { disponibles: false, residents: 12 } }).map((a) => a.cle)).toEqual(['signalements', 'annonces']);
    expect(alertesDepuis({ ...RESUME, signalements: { ouverts: 0, plusAncien: null }, fichesNonAnnoncees: { residents: 0, fiches: 0 },
      rappels: { disponibles: true, residents: 0 } })).toEqual([]);
  });
});
