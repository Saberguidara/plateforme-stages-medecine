import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';

import { PaletteCommandes, correspond, normaliser } from './palette-commandes';
import { lireDisposition } from '../admin-dashboard/admin-dashboard';
import { EnregistrerVue } from '../admin-shared/enregistrer-vue';
import { environment } from '../../environments/environment';

const api = environment.apiUrl;

@Component({ standalone: true, template: '' })
class Vide {}

describe('Palette de commandes', () => {
  let fixture: ComponentFixture<PaletteCommandes>;
  let httpMock: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PaletteCommandes],
      providers: [provideRouter([{ path: '**', component: Vide }]), provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
    fixture = TestBed.createComponent(PaletteCommandes);
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  function ouvrirAvecCtrlK() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    fixture.detectChanges();
    httpMock.expectOne(`${api}/admin/vues`).flush({ disponible: true, vues: [
      { id: 3, nom: '3e année sans fiche', ecran: 'residents', parametres: { promo: '2024', alerte: 'sans-fiche-semestre' }, cree_par: 'admin' }
    ] });
    fixture.detectChanges();
  }

  it("s'ouvre avec Ctrl+K et liste écrans, vues et actions", () => {
    ouvrirAvecCtrlK();
    const page: HTMLElement = fixture.nativeElement;
    expect(page.querySelector('[role="dialog"]')).toBeTruthy();
    const groupes = Array.from(page.querySelectorAll('.palette-groupe')).map((g) => g.textContent);
    expect(groupes).toEqual(['Vues enregistrées', 'Écrans', 'Actions']);
  });

  it('filtre sans tenir compte des accents et ouvre la vue choisie avec Entrée', async () => {
    ouvrirAvecCtrlK();
    fixture.componentInstance.saisir('annee sans');
    fixture.detectChanges();
    expect(fixture.componentInstance.resultats().map((c) => c.libelle)).toEqual(['3e année sans fiche']);

    fixture.componentInstance.valider(new Event('keydown'));
    await fixture.whenStable();
    expect(router.url).toBe('/admin/residents?promo=2024&alerte=sans-fiche-semestre');
    expect(fixture.componentInstance.ouverte()).toBe(false);
  });

  it('cherche les résidents à partir de deux lettres', async () => {
    ouvrirAvecCtrlK();
    fixture.componentInstance.saisir('tr');
    await new Promise((r) => setTimeout(r, 250));
    httpMock.expectOne((r) => r.url === `${api}/admin/recherche`)
      .flush([{ id: 7, cin: '01234567', nom_prenom: 'TRABELSI AMIRA', niveau: 2, parcours_termine: false }]);
    fixture.detectChanges();
    const premiers = fixture.componentInstance.resultats();
    expect(premiers[0]).toMatchObject({ groupe: 'Résidents', libelle: 'TRABELSI AMIRA', detail: '01234567 · 2A' });
  });

  it('compare les mots sans accents ni majuscules', () => {
    expect(normaliser('Hôpitaux et Services')).toBe('hopitaux et services');
    expect(correspond({ libelle: 'Statistiques · Qualité', motsCles: 'score doublons' }, 'qualite score')).toBe(true);
    expect(correspond({ libelle: 'Exports' }, 'qualite')).toBe(false);
  });
});

describe('Disposition du tableau de bord', () => {
  it('complète une disposition enregistrée et ignore les sections inconnues', () => {
    const d = lireDisposition(JSON.stringify({ ordre: ['activite', 'inconnue', 'indicateurs'], masquees: ['promotions', 'x'] }));
    expect(d.ordre.slice(0, 2)).toEqual(['activite', 'indicateurs']);
    expect(d.ordre).toHaveLength(7);
    expect(d.masquees).toEqual(['promotions']);
    expect(lireDisposition('pas du json').masquees).toEqual([]);
  });
});

describe('Enregistrer la vue', () => {
  it("enregistre l'écran avec les filtres de l'adresse", async () => {
    @Component({ standalone: true, imports: [EnregistrerVue], template: '<app-enregistrer-vue ecran="residents"></app-enregistrer-vue>' })
    class Hote {}
    await TestBed.configureTestingModule({
      imports: [Hote],
      providers: [provideRouter([{ path: '**', component: Hote }]), provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
    const router = TestBed.inject(Router);
    const httpMock = TestBed.inject(HttpTestingController);
    await router.navigateByUrl('/admin/residents?promo=2024&alerte=a-relancer');
    const fixture = TestBed.createComponent(Hote);
    fixture.detectChanges();
    httpMock.expectOne(`${api}/admin/vues`).flush({ disponible: true, vues: [] });

    const composant = fixture.debugElement.children[0].componentInstance as EnregistrerVue;
    composant.nom.set('Promo 2024 à relancer');
    composant.enregistrer(new Event('submit'));
    const req = httpMock.expectOne((r) => r.method === 'POST' && r.url === `${api}/admin/vues`);
    expect(req.request.body.ecran).toBe('residents');
    expect(req.request.body.nom).toBe('Promo 2024 à relancer');
    req.flush({ id: 1, nom: 'Promo 2024 à relancer', ecran: 'residents', parametres: {}, cree_par: 'admin', message: 'ok' });
    expect(composant.vues.vues().map((v) => v.nom)).toEqual(['Promo 2024 à relancer']);
    httpMock.verify();
  });
});
