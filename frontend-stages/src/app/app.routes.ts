import { Routes, CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';

import { ResidentLoginComponent } from './resident-login/resident-login';
import { AuthService } from './services/auth';

export const adminGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);
  const token = localStorage.getItem('admin_token');
  if (token) return true;
  return router.parseUrl('/admin/connexion');
};

// Gestion des comptes : réservée aux administrateurs complets (le serveur le vérifie aussi).
export const gestionComptesGuard: CanActivateFn = () => {
  return inject(AuthService).peutModifier() || inject(Router).parseUrl('/admin/tableau-de-bord');
};

export const residentGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);
  const token = localStorage.getItem('resident_token');
  if (token) return true;
  return router.parseUrl('/login'); // Redirect to login if not authenticated
};

// Seule la page de connexion des résidents est chargée d'emblée ; les autres écrans
// (dont toute l'administration) ne sont téléchargés qu'à l'ouverture.
export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: ResidentLoginComponent, title: 'Connexion résident' },
  {
    path: 'mes-stages',
    canActivate: [residentGuard],
    title: 'Mes fiches de stage',
    loadComponent: () => import('./resident-search/resident-search').then((m) => m.ResidentSearchComponent)
  },
  {
    path: 'admin/connexion',
    title: 'Connexion administration',
    loadComponent: () => import('./admin-login/admin-login').then((m) => m.AdminLogin)
  },
  // Anciennes adresses de l'administration (favoris)
  { path: 'admin/dashboard', redirectTo: 'admin/tableau-de-bord', pathMatch: 'full' },
  { path: 'admin/dashboard/import', redirectTo: 'admin/imports' },
  { path: 'admin/dashboard/data', redirectTo: 'admin/residents' },
  { path: 'admin/dashboard/search', redirectTo: 'admin/residents' },
  { path: 'admin/dashboard/add', redirectTo: 'admin/residents/nouveau' },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () => import('./admin-layout/admin-layout').then((m) => m.AdminLayout),
    children: [
      { path: '', redirectTo: 'tableau-de-bord', pathMatch: 'full' },
      {
        path: 'tableau-de-bord',
        title: 'Tableau de bord',
        loadComponent: () => import('./admin-dashboard/admin-dashboard').then((m) => m.AdminDashboard)
      },
      {
        path: 'residents',
        title: 'Résidents',
        loadComponent: () => import('./admin-data/admin-data').then((m) => m.AdminData)
      },
      {
        path: 'residents/nouveau',
        title: 'Nouveau résident',
        loadComponent: () => import('./admin-add/admin-add').then((m) => m.AdminAdd)
      },
      {
        path: 'residents/:id',
        title: 'Dossier résident',
        loadComponent: () => import('./admin-dossier/admin-dossier').then((m) => m.AdminDossier)
      },
      {
        path: 'imports',
        title: 'Import de stages',
        loadComponent: () => import('./admin-import/admin-import').then((m) => m.AdminImport)
      },
      {
        path: 'historique',
        title: 'Historique',
        loadComponent: () => import('./admin-historique/admin-historique').then((m) => m.AdminHistorique)
      },
      {
        path: 'referentiels',
        title: 'Hôpitaux et services',
        loadComponent: () => import('./admin-referentiels/admin-referentiels').then((m) => m.AdminReferentiels)
      },
      {
        path: 'exports',
        title: 'Exports',
        loadComponent: () => import('./admin-exports/admin-exports').then((m) => m.AdminExports)
      },
      {
        path: 'comptes',
        title: 'Comptes administrateurs',
        canActivate: [gestionComptesGuard],
        loadComponent: () => import('./admin-comptes/admin-comptes').then((m) => m.AdminComptes)
      }
    ]
  },
  { path: '**', redirectTo: 'login' }
];
