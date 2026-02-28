import { Component, inject } from '@angular/core';
import { RouterOutlet, Router } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule], // Il est crucial qu'il n'y ait que RouterOutlet ici
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  title = 'frontend-stages';
  router = inject(Router);

  isLoginPage(): boolean {
    const url = this.router.url.split('?')[0];
    return url === '/login' || url === '/admin' || url === '/';
  }
}