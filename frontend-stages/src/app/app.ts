import { Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from './services/auth';
import { Toasts } from './shell/toasts';
import { PdfViewer } from './shell/pdf-viewer';
import { Reveil } from './shell/reveil';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, CommonModule, Toasts, PdfViewer, Reveil],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  readonly annee = new Date().getFullYear();
  router = inject(Router);
  authService = inject(AuthService);

  isLoginPage(): boolean {
    const url = this.router.url.split('?')[0];
    return url === '/login' || url === '/admin/connexion' || url === '/';
  }

  estConnecte(): boolean {
    return this.authService.isAdmin() || this.authService.isResident();
  }

  getUserName(): string {
    return this.authService.getUserName();
  }

  logout() {
    const isAdmin = this.authService.isAdmin();
    this.authService.logout();
    this.router.navigate([isAdmin ? '/admin/connexion' : '/login']);
  }
}
