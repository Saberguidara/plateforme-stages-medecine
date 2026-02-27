import { Routes, CanActivateFn, Router } from '@angular/router';
import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

import { ResidentLoginComponent } from './resident-login/resident-login';
import { ResidentSearchComponent } from './resident-search/resident-search';
import { AdminDashboard } from './admin-dashboard/admin-dashboard';
import { AdminLogin } from './admin-login/admin-login';

export const adminGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);
  const platformId = inject(PLATFORM_ID);
  if (!isPlatformBrowser(platformId)) return true;
  const token = localStorage.getItem('admin_token');
  if (token) return true;
  return router.parseUrl('/admin');
};

export const residentGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);
  const platformId = inject(PLATFORM_ID);
  if (!isPlatformBrowser(platformId)) return true;
  const token = localStorage.getItem('resident_token');
  if (token) return true;
  return router.parseUrl('/login'); // Redirect to login if not authenticated
};

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: ResidentLoginComponent },
  { path: 'mes-stages', component: ResidentSearchComponent, canActivate: [residentGuard] },
  { path: 'admin', component: AdminLogin },
  { path: 'admin/dashboard', component: AdminDashboard, canActivate: [adminGuard] },
  { path: '**', redirectTo: 'login' }
];