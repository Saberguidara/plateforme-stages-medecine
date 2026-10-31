import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, throwError, timer } from 'rxjs';
import { retry } from 'rxjs/operators';
import { ReveilServeurService } from './services/reveil-serveur';

// Pendant le réveil, l'hébergeur peut répondre 502/503/504 : on retente les lectures (GET) sans rien dire.
const REESSAIS = 3;
const ATTENTE_REESSAI_MS = 5000;

export const reveilInterceptor: HttpInterceptorFn = (req, next) => {
    // Un import de fichier peut être long sans que le serveur dorme : pas de bandeau.
    if (req.body instanceof FormData) return next(req);

    const reveil = inject(ReveilServeurService);
    let requete = next(req);
    if (req.method === 'GET') {
        requete = requete.pipe(retry({
            count: REESSAIS,
            delay: (erreur) => [0, 502, 503, 504].includes(erreur?.status) ? timer(ATTENTE_REESSAI_MS) : throwError(() => erreur)
        }));
    }

    return new Observable((abonne) => {
        let signale = false;
        const minuteur = setTimeout(() => { signale = true; reveil.debut(); }, ReveilServeurService.DELAI_MS);
        const abonnement = requete.subscribe(abonne);
        return () => {
            clearTimeout(minuteur);
            if (signale) reveil.fin();
            abonnement.unsubscribe();
        };
    });
};
