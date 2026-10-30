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

  private payload(): any {
    const token = this.getToken();
    if (!token) return null;
    try {
      return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    } catch (e) {
      return null;
    }
  }

  getUserName(): string {
    const payload = this.payload();
    if (!payload) return '';
    return payload.nom_prenom || payload.nom || payload.login || (this.isAdmin() ? 'Administrateur' : 'Résident');
  }

  // Rôle de l'administrateur connecté : « admin » (tout) ou « lecture » (consultation seule).
  // Simple affichage : le serveur contrôle lui-même chaque modification.
  droits(): 'admin' | 'lecture' {
    return this.payload()?.droits === 'lecture' ? 'lecture' : 'admin';
  }

  peutModifier(): boolean {
    return this.isAdmin() && this.droits() === 'admin';
  }

  idAdmin(): number | null {
    return this.isAdmin() ? this.payload()?.id ?? null : null;
  }
}
