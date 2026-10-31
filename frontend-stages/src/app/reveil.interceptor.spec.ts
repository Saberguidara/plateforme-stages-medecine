import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { reveilInterceptor } from './reveil.interceptor';
import { ReveilServeurService } from './services/reveil-serveur';

describe('Intercepteur de réveil du serveur', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let reveil: ReveilServeurService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([reveilInterceptor])), provideHttpClientTesting()]
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    reveil = TestBed.inject(ReveilServeurService);
  });

  afterEach(() => {
    httpMock.verify();
    vi.useRealTimers();
  });

  it("affiche le bandeau seulement si la réponse tarde, puis le retire", () => {
    http.get('/api/stats').subscribe();
    const req = httpMock.expectOne('/api/stats');

    vi.advanceTimersByTime(ReveilServeurService.DELAI_MS - 1);
    expect(reveil.enAttente()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(reveil.enAttente()).toBe(true);

    req.flush({});
    expect(reveil.enAttente()).toBe(false);
  });

  it('retente une lecture quand l\'hébergeur répond 503 pendant le réveil', () => {
    let resultat: unknown;
    http.get('/api/stats').subscribe((r) => (resultat = r));

    httpMock.expectOne('/api/stats').flush('', { status: 503, statusText: 'Service Unavailable' });
    vi.advanceTimersByTime(5000);
    httpMock.expectOne('/api/stats').flush({ ok: true });

    expect(resultat).toEqual({ ok: true });
  });

  it('ne retente ni les envois ni les vraies erreurs', () => {
    let erreur: any;
    http.post('/api/auth/login/request-otp', {}).subscribe({ error: (e) => (erreur = e) });
    httpMock.expectOne('/api/auth/login/request-otp').flush('', { status: 503, statusText: 'Service Unavailable' });
    expect(erreur.status).toBe(503);

    http.get('/api/fiches').subscribe({ error: (e) => (erreur = e) });
    httpMock.expectOne('/api/fiches').flush('', { status: 404, statusText: 'Not Found' });
    vi.advanceTimersByTime(5000);
    httpMock.expectNone('/api/fiches');
    expect(erreur.status).toBe(404);
  });
});
