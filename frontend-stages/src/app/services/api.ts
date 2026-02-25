import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private apiUrl = 'http://localhost:3000/api';

  constructor(private http: HttpClient) { }

  // Méthode pour interroger le backend
  getResidentByCin(cin: string): Observable<any> {
    const reqStart = performance.now();
    console.log(`[API] Fetching resident with CIN: ${cin}`);
    
    return this.http.get(`${this.apiUrl}/residents/${cin}`).pipe(
      tap(data => {
        const reqEnd = performance.now();
        console.log(`[API] HTTP response received in ${reqEnd - reqStart}ms`);
      })
    );
  }
  
  // Méthode pour mettre à jour une fiche (Espace Admin)
  updateFiche(idFiche: number, donnees: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/admin/fiches/${idFiche}`, donnees);
  }

  // Return absolute URL for files stored in backend /uploads
  getFileUrl(filename: string) {
    if (!filename) return null;
    // if already an absolute URL, return as-is
    if (/^https?:\/\//i.test(filename)) return filename;
    // Use the safer API endpoint which returns clearer errors and can be protected later
    return `http://localhost:3000/api/files/${encodeURIComponent(filename)}`;
  }

  // Download file as Blob
  downloadFile(filenameOrUrl: string) {
    const url = this.getFileUrl(filenameOrUrl) || filenameOrUrl;
    // Angular typing for responseType blob requires casting
    return this.http.get(url, { responseType: 'blob' as 'json' }) as Observable<Blob>;
  }
}