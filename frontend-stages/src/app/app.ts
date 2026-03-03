import { Component, inject, PLATFORM_ID } from '@angular/core';
import { RouterOutlet, Router } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  title = 'frontend-stages';
  router = inject(Router);
  platformId = inject(PLATFORM_ID);

  isLoginPage(): boolean {
    const url = this.router.url.split('?')[0];
    return url === '/login' || url === '/admin' || url === '/';
  }

  getUserName(): string {
    if (!isPlatformBrowser(this.platformId)) return '';

    const adminToken = localStorage.getItem('admin_token');
    const residentToken = localStorage.getItem('resident_token');
    const token = adminToken || residentToken;

    if (!token) return '';

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (adminToken) return payload.login || 'Administrateur';
      if (residentToken) return payload.nom_prenom || 'Résident';
    } catch (e) {
      return '';
    }
    return '';
  }

  logout() {
    if (!isPlatformBrowser(this.platformId)) return;
    const isAdmin = !!localStorage.getItem('admin_token');
    localStorage.removeItem('admin_token');
    localStorage.removeItem('resident_token');
    localStorage.removeItem('resident_cin');
    this.router.navigate([isAdmin ? '/admin' : '/login']);
  }
}