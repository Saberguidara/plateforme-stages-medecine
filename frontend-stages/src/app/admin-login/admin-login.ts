import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-admin-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-login.html',
  styleUrl: './admin-login.css'
})
export class AdminLogin {
  loginSaisi: string = '';
  motDePasseSaisi: string = '';
  messageErreur: string = '';
  isLoading = false;

  constructor(private http: HttpClient, private router: Router) { }

  seConnecter() {
    if (this.isLoading) return;
    this.messageErreur = '';
    this.isLoading = true;
    const identifiants = { login: this.loginSaisi, password: this.motDePasseSaisi };

    this.http.post<any>(`${environment.apiUrl}/auth/admin/login`, identifiants).subscribe({
      next: (reponse) => {
        setTimeout(() => {
          this.isLoading = false;
          if (reponse.success && reponse.token) {
            localStorage.removeItem('resident_token');
            localStorage.removeItem('resident_cin');
            localStorage.setItem('admin_token', reponse.token);
            this.router.navigate(['/admin/tableau-de-bord']);
          } else {
            this.messageErreur = "Identifiants incorrects.";
          }
        }, 0);
      },
      error: (err) => {
        setTimeout(() => {
          this.isLoading = false;
          this.messageErreur = err.error?.message || "Erreur de connexion au serveur.";
        }, 0);
      }
    });
  }
}