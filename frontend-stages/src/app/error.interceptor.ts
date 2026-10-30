import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
    const router = inject(Router);
    
    return next(req).pipe(
        catchError((error: HttpErrorResponse) => {
            if (error.status === 401) {
                const isAdmin = typeof localStorage !== 'undefined' && !!localStorage.getItem('admin_token');
                
                if (typeof localStorage !== 'undefined') {
                    localStorage.removeItem('admin_token');
                    localStorage.removeItem('resident_token');
                    localStorage.removeItem('resident_cin');
                }
                
                // Avoid redirecting if already on login pages
                const currentUrl = router.url.split('?')[0];
                if (currentUrl !== '/login' && currentUrl !== '/admin/connexion') {
                    router.navigate([isAdmin ? '/admin/connexion' : '/login']);
                }
            }
            return throwError(() => error);
        })
    );
};
