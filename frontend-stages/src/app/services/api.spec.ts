import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { ApiService } from './api';
import { environment } from '../../environments/environment';

describe('ApiService', () => {
  let service: ApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(ApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should call create fiche endpoint', () => {
    service.createFiche({ resident_id: 7, periode: 'S1', annee: 2026, service: 'Cardio', hopital: 'Hedi' })
      .subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/admin/fiches`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.resident_id).toBe(7);
    req.flush({ success: true, message: 'ok', id: 1 });
  });
});
