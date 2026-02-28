// ARCH-2 : apiUrl centralisée dans environment.ts
// Auth : le authInterceptor dans app.config.ts injecte automatiquement le token JWT
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  // ===== Résidents =====

  getResidentByCin(cin: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/residents/${cin}`);
  }

  createResident(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/admin/residents`, data);
  }

  updateResident(id: number, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/admin/residents/${id}`, data);
  }

  // ===== Fiches / Stages =====

  updateFiche(idFiche: number, donnees: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/admin/fiches/${idFiche}`, donnees);
  }

  createFiche(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/admin/fiches`, data);
  }

  // ===== Référentiels =====

  getSpecialites(): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/admin/specialites`);
  }

  // ===== Fichiers =====

  getFileUrl(filename: string) {
    if (!filename) return null;
    if (/^https?:\/\//i.test(filename)) return filename;
    return `${this.apiUrl}/files/${encodeURIComponent(filename)}`;
  }

  downloadFile(filenameOrUrl: string) {
    const url = this.getFileUrl(filenameOrUrl) || filenameOrUrl;
    return this.http.get(url, { responseType: 'blob' as 'json' }) as Observable<Blob>;
  }
}