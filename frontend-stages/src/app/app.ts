import { Component, inject, PLATFORM_ID } from '@angular/core';
import { RouterOutlet, Router } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { AuthService } from './services/auth';

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
  authService = inject(AuthService);

  isLoginPage(): boolean {
    const url = this.router.url.split('?')[0];
    return url === '/login' || url === '/admin' || url === '/';
  }

  getUserName(): string {
    return this.authService.getUserName();
  }

  logout() {
    const isAdmin = this.authService.isAdmin();
    this.authService.logout();
    this.router.navigate([isAdmin ? '/admin' : '/login']);
  }
}