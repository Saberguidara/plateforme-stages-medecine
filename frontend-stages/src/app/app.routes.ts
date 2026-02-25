import { Routes, CanActivateFn, Router, UrlTree } from '@angular/router';
import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

// Import de tes composants (Vérifie que les noms correspondent bien à tes fichiers)
import { ResidentSearchComponent } from './resident-search/resident-search';
import { AdminDashboard } from './admin-dashboard/admin-dashboard';
import { AdminLogin } from './admin-login/admin-login';

export const adminGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);
  const platformId = inject(PLATFORM_ID);

  // Allow SSR to proceed
  if (!isPlatformBrowser(platformId)) return true;

  // Check if token exists in localStorage
  const token = localStorage.getItem('admin_token');
  if (token) {
    console.log('[Guard] Token found, allowing access');
    return true;
  }

  console.log('[Guard] No token, redirecting to /admin login');
  return router.parseUrl('/admin');
};

export const routes: Routes = [
  { path: '', component: ResidentSearchComponent },
  { path: 'admin', component: AdminLogin },
  { path: 'admin/dashboard', component: AdminDashboard, canActivate: [adminGuard] },
  { path: '**', redirectTo: '' }
];