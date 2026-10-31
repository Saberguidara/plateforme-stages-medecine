import { ApplicationConfig } from '@angular/core';
import { provideRouter, TitleStrategy } from '@angular/router';
import { TitreStrategy } from './shell/titre.strategy';
import { routes } from './app.routes';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './auth.interceptor';
import { errorInterceptor } from './error.interceptor';
import { reveilInterceptor } from './reveil.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    { provide: TitleStrategy, useClass: TitreStrategy },
    provideHttpClient(withFetch(), withInterceptors([authInterceptor, errorInterceptor, reveilInterceptor]))
  ]
};