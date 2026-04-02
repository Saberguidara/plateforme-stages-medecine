import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AuthService {
  getToken(): string | null {
    return localStorage.getItem('admin_token') || localStorage.getItem('resident_token');
  }

  isAdmin(): boolean {
    return !!localStorage.getItem('admin_token');
  }

  isResident(): boolean {
    return !!localStorage.getItem('resident_token');
  }

  logout(): void {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('resident_token');
    localStorage.removeItem('resident_cin');
  }

  getUserName(): string {
    const token = this.getToken();
    if (!token) return '';
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.nom_prenom || payload.login || (this.isAdmin() ? 'Administrateur' : 'Résident');
    } catch (e) {
      return '';
    }
  }
}
