import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';

import { ResidentSearchComponent } from './resident-search';
import { ApiService } from '../services/api';

const ANNEE = new Date().getFullYear();
const SEMESTRE = new Date().getMonth() < 6 ? 'S1' : 'S2';
const PERIODES = SEMESTRE === 'S1' ? ['S1', 'T1', 'T2', 'R1'] : ['S2', 'T3', 'T4', 'R2'];

function dossier(surcharge: Record<string, unknown> = {}) {
  return {
    id: 1, cin: '12345678', nom_prenom: 'Résident Test', specialite: 'Médecine de famille',
    promotion: ANNEE - 1, niveau: 2, parcours_termine: false, duree: 3,
    semestreCourant: { semestre: SEMESTRE, annee: ANNEE, periodes: PERIODES },
    fiches: [
      { id: 1, periode: 'S1', annee: ANNEE - 1, service: 'A', hopital: 'H', dates: '', dernier_telechargement: '2025-01-10' },
      { id: 2, periode: SEMESTRE, annee: ANNEE, service: 'B', hopital: 'H', dates: '', dernier_telechargement: null }
    ],
    ...surcharge
  };
}

describe('ResidentSearchComponent', () => {
  let fixture: ComponentFixture<ResidentSearchComponent>;
  let reponse: ReturnType<typeof dossier>;

  async function creer() {
    await TestBed.configureTestingModule({
      imports: [ResidentSearchComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        { provide: ApiService, useValue: { getResidentByCin: () => of(reponse) } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(ResidentSearchComponent);
    await fixture.whenStable();
    return fixture.componentInstance;
  }

  beforeEach(() => localStorage.setItem('resident_cin', '12345678'));
  afterEach(() => localStorage.removeItem('resident_cin'));

  it('met en avant la fiche du semestre en cours', async () => {
    reponse = dossier();
    const c = await creer();
    expect(c.fichesDuSemestre().map((f) => f.id)).toEqual([2]);
    expect(c.anneeEnCours()).toBe('2ème année');
    expect(fixture.nativeElement.textContent).toContain('Pas encore téléchargée');
  });

  it('montre la progression sur les trois années', async () => {
    reponse = dossier();
    const c = await creer();
    expect(c.etapes().map((e) => e.etat)).toEqual(['faite', 'courante', 'a-venir']);
    expect(c.parcours().map((a) => a.titre)).toEqual(['2ème année', '1ère année']);
  });

  it('affiche « Parcours terminé » après la 3e année', async () => {
    reponse = dossier({ niveau: null, parcours_termine: true, promotion: ANNEE - 3 });
    const c = await creer();
    expect(c.anneeEnCours()).toBe('Parcours terminé');
    expect(c.etapes().every((e) => e.etat === 'faite')).toBe(true);
  });
});
