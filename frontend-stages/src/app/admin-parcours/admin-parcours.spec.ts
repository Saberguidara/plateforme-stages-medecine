import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { AdminParcours, detailSemestre, resumeSemestre } from './admin-parcours';
import { SemestreParcours } from '../services/api';
import { environment } from '../../environments/environment';

const semestre = (niveau: number, s: 'S1' | 'S2', annee: number, etat: SemestreParcours['etat'],
  stages: SemestreParcours['stages'] = []): SemestreParcours => ({ niveau, semestre: s, annee, etat, stages });

const resident = (id: number, nom: string, promotion: number, incomplets: number, sansFicheCourant = false) => ({
  id, nom_prenom: nom, faculte: 'FMSfax', niveau: 2026 - promotion + 1, promotion, faits: 3, total: 6, incomplets,
  sansFicheCourant, horsParcours: 0,
  semestres: [
    semestre(1, 'S1', promotion, 'fait', [{ periode: 'S1', service: 'Urgences', hopital: 'CHU' }]),
    semestre(1, 'S2', promotion, incomplets ? 'manquant' : 'fait'),
    semestre(2, 'S1', promotion + 1, 'fait'), semestre(2, 'S2', promotion + 1, 'en-cours'),
    semestre(3, 'S1', promotion + 2, 'a-venir'), semestre(3, 'S2', promotion + 2, 'a-venir')
  ]
});

const PARCOURS = {
  courant: { semestre: 'S2', annee: 2026 },
  promotions: [
    { promotion: 2026, niveau: 1, residents: 1, aJour: 1, incomplets: 0, sansFicheCourant: 0 },
    { promotion: 2025, niveau: 2, residents: 2, aJour: 1, incomplets: 1, sansFicheCourant: 0 }
  ],
  residents: [resident(1, 'ALPHA', 2026, 0), resident(2, 'BETA', 2025, 0), resident(3, 'GAMMA', 2025, 1)]
};

describe('AdminParcours', () => {
  let fixture: ComponentFixture<AdminParcours>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminParcours],
      providers: [provideRouter([{ path: '**', component: AdminParcours }]), provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
    fixture = TestBed.createComponent(AdminParcours);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === `${environment.apiUrl}/admin/statistiques/parcours`).flush(PARCOURS);
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  const noms = () => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.tableau-parcours tbody th a')).map((a) => a.textContent);

  it('ouvre la première promotion qui a des parcours à reprendre', () => {
    expect(fixture.componentInstance.promotionAffichee()).toBe(2025);
    expect(noms()).toEqual(['BETA', 'GAMMA']);
    const entetes = (fixture.nativeElement as HTMLElement).querySelectorAll('.tableau-parcours thead th');
    expect(entetes[1].textContent).toContain('S1 2025');
  });

  it('ne garde que les parcours à reprendre, puis filtre par nom', async () => {
    fixture.componentInstance.incompletsSeulement.set(true);
    fixture.detectChanges();
    expect(noms()).toEqual(['GAMMA']);
    fixture.componentInstance.incompletsSeulement.set(false);
    fixture.componentInstance.recherche.set('bet');
    fixture.detectChanges();
    expect(noms()).toEqual(['BETA']);
  });

  it("change de promotion d'un clic", async () => {
    fixture.componentInstance.promotion.set(2026);
    fixture.detectChanges();
    expect(noms()).toEqual(['ALPHA']);
  });
});

describe('Cases du parcours', () => {
  it('résume un semestre par ses services, ou par son état', () => {
    expect(resumeSemestre(semestre(1, 'S1', 2025, 'fait', [
      { periode: 'T1', service: 'Cardiologie', hopital: 'A' }, { periode: 'T2', service: 'Pneumologie', hopital: 'B' }
    ]))).toBe('Cardiologie · Pneumologie');
    expect(resumeSemestre(semestre(1, 'S1', 2025, 'manquant'))).toBe('Aucune fiche');
    expect(resumeSemestre(semestre(1, 'S1', 2025, 'rattrape', [
      { periode: 'T1', service: 'Psychiatrie', hopital: 'A' }, { periode: 'R1', service: 'Urgences', hopital: 'B' }
    ]))).toBe('Psychiatrie · R1 Urgences');
  });

  it("détaille chaque stage dans l'info-bulle", () => {
    expect(detailSemestre(semestre(2, 'S2', 2026, 'en-cours', [{ periode: 'S2', service: 'CSB Agareb', hopital: 'DRS Sfax' }])))
      .toBe('Année 2 · S2 2026 · En cours\nS2 : CSB Agareb (DRS Sfax)');
  });
});
