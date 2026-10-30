import { Routes, CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';

import { ResidentLoginComponent } from './resident-login/resident-login';

export const adminGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);
  const token = localStorage.getItem('admin_token');
  if (token) return true;
  return router.parseUrl('/admin');
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
    path: 'admin',
    title: 'Connexion administration',
    loadComponent: () => import('./admin-login/admin-login').then((m) => m.AdminLogin)
  },
  {
    path: 'admin/dashboard',
    canActivate: [adminGuard],
    title: 'Administration',
    loadComponent: () => import('./admin-dashboard/admin-dashboard').then((m) => m.AdminDashboard)
  },
  {
    path: 'admin/dashboard/import',
    canActivate: [adminGuard],
    title: 'Import de stages',
    loadComponent: () => import('./admin-import/admin-import').then((m) => m.AdminImport)
  },
  {
    path: 'admin/dashboard/data',
    canActivate: [adminGuard],
    title: 'Résidents et fiches',
    loadComponent: () => import('./admin-data/admin-data').then((m) => m.AdminData)
  },
  {
    path: 'admin/dashboard/search',
    canActivate: [adminGuard],
    title: 'Rechercher un résident',
    loadComponent: () => import('./admin-search/admin-search').then((m) => m.AdminSearch)
  },
  {
    path: 'admin/dashboard/add',
    canActivate: [adminGuard],
    title: 'Ajouter un résident',
    loadComponent: () => import('./admin-add/admin-add').then((m) => m.AdminAdd)
  },
  { path: '**', redirectTo: 'login' }
];
