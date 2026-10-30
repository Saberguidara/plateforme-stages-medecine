import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface FichePayload {
  resident_id?: number;
  periode: string;
  annee: number;
  service: string;
  hopital: string;
  url_pdf?: string;
}

export interface ApiMutationResponse {
  success: boolean;
  message: string;
  id?: number;
}

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

  getAllResidents(page: number = 1, limit: number = 20, search: string = '', specialite: string = '', promo: string = '', sortCol: string = '', sortDesc: boolean = false, email: string = ''): Observable<any> {
    const params = { page, limit, search, specialite, promo, sortCol, sortDesc, email };
    return this.http.get<any>(`${this.apiUrl}/admin/residents`, { params });
  }

  getPromotions(): Observable<number[]> {
    return this.http.get<number[]>(`${this.apiUrl}/admin/promotions`);
  }

  createResident(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/admin/residents`, data);
  }

  updateResident(id: number, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/admin/residents/${id}`, data);
  }

  deleteResident(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/admin/residents/${id}`);
  }

  // ===== Fiches / Stages =====

  updateFiche(idFiche: number, donnees: FichePayload): Observable<ApiMutationResponse> {
    return this.http.put<ApiMutationResponse>(`${this.apiUrl}/admin/fiches/${idFiche}`, donnees);
  }

  createFiche(data: FichePayload): Observable<ApiMutationResponse> {
    return this.http.post<ApiMutationResponse>(`${this.apiUrl}/admin/fiches`, data);
  }

  deleteFiche(id: number): Observable<ApiMutationResponse> {
    return this.http.delete<ApiMutationResponse>(`${this.apiUrl}/admin/fiches/${id}`);
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
