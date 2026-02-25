import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-admin-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-login.html'
})
export class AdminLogin {
  loginSaisi: string = '';
  motDePasseSaisi: string = '';
  messageErreur: string = '';

  constructor(private http: HttpClient, private router: Router) {}

  seConnecter() {
    this.messageErreur = '';
    const identifiants = { login: this.loginSaisi, password: this.motDePasseSaisi };
    console.log('[AdminLogin] seConnecter called', identifiants);

    this.http.post<any>('http://localhost:3000/api/admin/login', identifiants).subscribe({
      next: (reponse) => {
        console.log('[AdminLogin] Full login response:', reponse);
        console.log('[AdminLogin] response.success:', reponse.success);
        console.log('[AdminLogin] response.token:', reponse.token);
        
        if (reponse.success && reponse.token) {
          // Sauvegarde le token en localStorage
          localStorage.setItem('admin_token', reponse.token);
          console.log('[AdminLogin] ✅ Token saved:', reponse.token);
          console.log('[AdminLogin] Navigating to /admin/dashboard');
          this.router.navigate(['/admin/dashboard']); 
        } else {
          console.error('[AdminLogin] Missing success or token in response');
          this.messageErreur = "Réponse serveur invalide: success=" + reponse.success + ", token=" + !!reponse.token;
        }
      },
      error: (err) => {
        console.error('[AdminLogin] HTTP error:', err);
        this.messageErreur = "Erreur: " + (err.error?.message || err.statusText || "Erreur de connexion");
      }
    });
  }
}