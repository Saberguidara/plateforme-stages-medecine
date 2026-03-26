// Interceptor HTTP global — injecte automatiquement le token JWT dans toutes les requêtes
// Compatible SSR : localStorage inaccessible côté serveur → try/catch
import { HttpInterceptorFn } from '@angular/common/http';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
    try {
        const adminToken = localStorage.getItem('admin_token');
        const residentToken = localStorage.getItem('resident_token');
        const token = adminToken || residentToken;
        if (token) {
            const authReq = req.clone({
                setHeaders: { Authorization: `Bearer ${token}` }
            });
            return next(authReq);
        }
    } catch (e) {
        console.log('[INTERCEPTOR] localStorage indisponible (SSR?)', e);
    }
    return next(req);
};
