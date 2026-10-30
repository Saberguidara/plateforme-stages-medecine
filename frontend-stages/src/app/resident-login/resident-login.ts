import { Component, inject, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-resident-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="auth-page-wrapper">
      <div class="auth-floating-card">
        <!-- Panneau Gauche : Arrière-plan flou + Logo -->
      <div class="split-left">
        <div class="overlay"></div>
        <div class="overlay-tint"></div>
        <div class="left-content">
          <div class="logo-transparent-wrapper mb-2">
            <img src="logo.png" alt="Logo Faculté" class="split-logo-animated">
          </div>
          <div class="welcome-text-container">
            <p class="welcome-overline-animated">Bienvenue sur la</p>
            <h1 class="welcome-title-animated">
              <span class="line-1">Plateforme</span>
              <span class="line-2">de Stages</span>
            </h1>
            <p class="welcome-subtitle-animated">Faculté de Médecine de Sfax</p>
          </div>
        </div>
      </div>

      <!-- Panneau Droit : Formulaire -->
      <div class="split-right">
        <div class="login-form-container">
          <div class="abstract-login-wrapper">
            <div class="text-center pt-4 pb-4">
              <h2 class="abstract-title">ESPACE RÉSIDENT</h2>
              <p class="abstract-subtitle">Connexion sécurisée par e-mail</p>
            </div>
            
            <div class="px-4 pb-4">
              <!-- Etape 1 : Demande OTP -->
              <div *ngIf="step === 1" class="fade-in mt-2">
                <div class="flat-input-group mb-5">
                  <input type="text" [(ngModel)]="cin" (keyup.enter)="requestOtp()" class="flat-input" id="flatCIN" placeholder=" " autocomplete="username" autocapitalize="characters" />
                  <label for="flatCIN" class="flat-label">Numéro de CIN / Passeport</label>
                </div>
                <div class="flat-input-group mb-5">
                  <input type="email" [(ngModel)]="email" (keyup.enter)="requestOtp()" class="flat-input" id="flatEmail" placeholder=" " autocomplete="email" inputmode="email" />
                  <label for="flatEmail" class="flat-label">Adresse E-mail</label>
                  <div class="form-text small mt-1 opacity-75">L'adresse enregistrée par le service des stages.</div>
                </div>
                <button class="pill-btn-orange w-100 mt-4 interactive-btn" (click)="requestOtp()" [disabled]="isLoading">
                  {{ isLoading ? 'Envoi...' : 'RECEVOIR MON CODE' }}
                </button>
              </div>

              <!-- Etape 2 : Vérification OTP -->
              <div *ngIf="step === 2" class="fade-in mt-2">
                <div class="alert alert-success border-0 bg-success bg-opacity-10 text-success text-center small">
                  {{ infoMessage || 'Un code a été envoyé par e-mail.' }} Le code expire dans 10 minutes.
                </div>
                <div class="flat-input-group mt-5 mb-5 text-center">
                  <input type="text" [(ngModel)]="otpCode" (keyup.enter)="verifyOtp()" class="flat-input text-center code-input" id="flatOTP" placeholder=" " maxlength="6" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" />
                  <label for="flatOTP" class="flat-label fw-normal" style="left:50%; transform:translateX(-50%);">Code de sécurité (6 chiffres)</label>
                </div>
                <button class="pill-btn-orange w-100 mt-4 interactive-btn" (click)="verifyOtp()" [disabled]="isLoading">
                  {{ isLoading ? '...' : 'SE CONNECTER' }}
                </button>
                
                <div class="text-center mt-4 mb-3">
                  <p class="text-muted small mb-2" *ngIf="countdown > 0">
                    Nouveau code disponible dans <strong class="text-primary">{{ formatCountdown() }}</strong>
                  </p>
                  <button class="btn btn-link text-secondary text-decoration-none small interactive-btn" *ngIf="countdown === 0" (click)="resendOtp()" [disabled]="isLoading">
                    Renvoyer un nouveau code
                  </button>
                </div>

                <div class="text-center">
                  <button class="btn btn-link text-decoration-none small text-muted interactive-btn" (click)="resetToStep1()" [disabled]="isLoading">
                    Modifier l'email ou le CIN
                  </button>
                </div>
              </div>

              <div *ngIf="errorMessage" class="alert alert-danger mt-4 border-0 bg-danger bg-opacity-10 text-danger fade-in text-center">
                {{ errorMessage }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .auth-page-wrapper { min-height: 100vh; width: 100vw; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; background: #000; }
    .auth-page-wrapper::before { content: ''; position: absolute; inset: -30px; background: url('/auth_photo.png') no-repeat center center; background-size: cover; filter: blur(8px); z-index: 0; opacity: 0.7; }
    
    .auth-floating-card { position: relative; z-index: 10; display: flex; width: 90%; max-width: 1200px; min-height: 650px; background: #f5f0e6; border-radius: 30px; overflow: hidden; box-shadow: 0 40px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.1); animation: floatUp 1s cubic-bezier(0.2, 0.8, 0.2, 1); }
    
    .split-left { flex: 0 0 50%; max-width: 50%; position: relative; background: url('/auth_photo.png') no-repeat center center; background-size: cover; display: flex; align-items: center; justify-content: center; overflow: hidden; border: 15px solid #f5f0e6; border-radius: 40px; box-sizing: border-box; }
    .split-left .overlay { position: absolute; inset: -20px; background: inherit; filter: blur(4px); z-index: 1; }
    .split-left .overlay-tint { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.5); z-index: 2; }
    .split-left .left-content { position: relative; z-index: 3; text-align: center; color: #f5f0e6; padding: 0 40px; }
    
    .logo-transparent-wrapper { display: flex; align-items: center; justify-content: center; }
    .split-logo-animated { max-width: 180px; opacity: 0; animation: logoEntrance 1.5s cubic-bezier(0.16, 1, 0.3, 1) forwards, subtlePulse 3.5s ease-in-out infinite alternate 1.5s; }
    
    .welcome-text-container { margin-top: 15px; text-align: center; }
    .welcome-overline-animated { font-size: 1.1rem; font-weight: 300; color: rgba(245, 240, 230, 0.9); letter-spacing: 4px; text-transform: uppercase; margin-bottom: 10px; opacity: 0; animation: fadeUpReveal 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards 0.3s; text-shadow: 0 2px 10px rgba(0,0,0,0.5); }
    .welcome-title-animated { font-family: 'Georgia', serif; font-weight: 700; font-size: 3.8rem; line-height: 1.05; margin: 0; color: #f5f0e6; text-shadow: 0 4px 15px rgba(0,0,0,0.6), 0 0 25px rgba(245, 240, 230, 0.3); }
    .welcome-title-animated .line-1 { display: block; opacity: 0; animation: fadeUpReveal 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards 0.5s; }
    .welcome-title-animated .line-2 { display: block; opacity: 0; animation: fadeUpReveal 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards 0.7s; }
    .welcome-subtitle-animated { font-weight: 400; font-size: 1.2rem; letter-spacing: 2px; color: rgba(245, 240, 230, 0.9); margin-top: 25px; opacity: 0; border-top: 1px solid rgba(245, 240, 230, 0.2); padding-top: 15px; display: inline-block; animation: fadeUpReveal 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards 0.9s; text-shadow: 0 2px 10px rgba(0,0,0,0.5); }

    .split-right { flex: 0 0 50%; max-width: 50%; position: relative; background-color: #f5f0e6; display: flex; align-items: center; justify-content: center; }
    .login-form-container { width: 100%; max-width: 480px; padding: 30px; position: relative; z-index: 10; animation: slideUpFade 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }
    
    .abstract-login-wrapper { padding: 20px; }
    .abstract-title { font-size: 2.2rem; font-weight: 300; color: #333; letter-spacing: 1px; margin-bottom: 5px; }
    .abstract-subtitle { font-size: 1rem; color: #555; text-align: center; margin-bottom: 40px; }

    .flat-input-group { position: relative; margin-bottom: 30px; }
    .flat-input { width: 100%; background: transparent; border: none; border-bottom: 2px solid #555; color: #b5521f; padding: 10px 5px; font-size: 1.1rem; font-weight: 600; outline: none; transition: border-color 0.3s; }
    .flat-input:focus { border-bottom-color: #f47b45; }
    .flat-label { position: absolute; top: 12px; left: 5px; color: #777; font-size: 1.1rem; pointer-events: none; transition: 0.3s ease all; }
    .flat-input:focus ~ .flat-label, .flat-input:not(:placeholder-shown) ~ .flat-label { top: -20px; font-size: 0.85rem; color: #b5521f; }

    .pill-btn-orange { background: #f47b45; color: white; border: none; border-radius: 50rem; padding: 12px 20px; font-size: 1.1rem; font-weight: bold; display: block; box-shadow: 0 4px 15px rgba(244, 123, 69, 0.4); transition: transform 0.2s, box-shadow 0.2s; letter-spacing: 1px; }
    .pill-btn-orange:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(244, 123, 69, 0.6); }

    .flat-input.code-input { font-size: 1.8rem; letter-spacing: 10px; font-weight: 800; color: #b5521f; }
    
    .interactive-btn { transition: all 0.3s ease; }
    .interactive-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(0,0,0,0.12); }
    .interactive-btn:active:not(:disabled) { transform: translateY(0); }
    
    .fade-in { animation: simpleFadeIn 0.5s ease-out; }

    @keyframes logoEntrance { 0% { opacity: 0; transform: scale(0.85) translateY(-20px); filter: blur(5px) drop-shadow(0 0 0 rgba(245, 240, 230, 0)); } 100% { opacity: 1; transform: scale(1) translateY(0); filter: blur(0px) drop-shadow(0 0 25px rgba(245, 240, 230, 0.5)); } }
    @keyframes subtlePulse { 0% { filter: drop-shadow(0 0 15px rgba(245, 240, 230, 0.4)); transform: scale(1); } 100% { filter: drop-shadow(0 0 35px rgba(245, 240, 230, 0.8)); transform: scale(1.02); } }
    @keyframes fadeUpReveal { 0% { opacity: 0; transform: translateY(30px); filter: blur(4px); } 100% { opacity: 1; transform: translateY(0); filter: blur(0px); } }

    @keyframes floatUp { 0% { opacity: 0; transform: translateY(60px); } 100% { opacity: 1; transform: translateY(0); } }
    @keyframes zoomIn { 0% { opacity: 0; transform: scale(0.9); } 100% { opacity: 1; transform: scale(1); } }
    @keyframes slideUpFade { 0% { opacity: 0; transform: translateY(40px); } 100% { opacity: 1; transform: translateY(0); } }
    @keyframes simpleFadeIn { 0% { opacity: 0; } 100% { opacity: 1; } }

    @media (max-width: 991px) {
      .auth-page-wrapper { display: block; overflow-y: auto; padding: 12px 0; }
      .auth-floating-card { flex-direction: column; width: calc(100% - 24px); min-height: 0; margin: 0 auto; border-radius: 20px; }
      .split-left { min-height: 0; max-width: 100%; flex: none; padding: 18px 16px; border-width: 8px; border-radius: 24px; }
      .split-logo-animated { max-width: 72px; }
      .welcome-text-container { margin-top: 6px; }
      .welcome-overline-animated { font-size: 0.75rem; letter-spacing: 3px; margin-bottom: 4px; }
      .welcome-title-animated { font-size: 1.7rem; }
      .welcome-title-animated .line-1, .welcome-title-animated .line-2 { display: inline; }
      .welcome-subtitle-animated { font-size: 0.85rem; margin-top: 8px; padding-top: 6px; }
      .split-right { min-height: 0; max-width: 100%; flex: none; padding: 0; }
      .login-form-container { padding: 8px 12px 16px; }
      .abstract-login-wrapper { padding: 8px; }
      .abstract-login-wrapper .pt-4 { padding-top: 0.5rem !important; }
      .abstract-title { font-size: 1.6rem; }
      .abstract-subtitle { margin-bottom: 16px; }
      .flat-input-group.mb-5 { margin-bottom: 1.75rem !important; }
    }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation: none !important; transition: none !important; }
      .split-logo-animated, .welcome-overline-animated, .welcome-title-animated .line-1,
      .welcome-title-animated .line-2, .welcome-subtitle-animated, .login-form-container { opacity: 1; }
    }
  `]
})
export class ResidentLoginComponent implements OnDestroy {
  step = 1;
  cin = '';
  email = '';
  otpCode = '';
  isLoading = false;
  errorMessage = '';
  infoMessage = '';
  countdown = 120; // 2 minutes (120 seconds)
  private intervalId: any;

  private http = inject(HttpClient);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  ngOnDestroy() {
    this.clearTimer();
  }

  requestOtp() {
    if (!this.cin || !this.email) {
      this.errorMessage = "Veuillez remplir votre CIN et votre Email.";
      return;
    }
    this.errorMessage = '';
    this.isLoading = true;

    this.http.post(`${environment.apiUrl}/auth/login/request-otp`, { cin: this.cin, email: this.email })
      .subscribe({
        next: (res: any) => {
          setTimeout(() => {
            this.isLoading = false;
            if (res.success) {
              this.infoMessage = res.message || '';
              this.step = 2;
              this.startCountdown(120);
            }
          }, 0);
        },
        error: (err) => {
          setTimeout(() => {
            this.isLoading = false;
            if (err.status === 429 && err.error?.waitTime) {
              this.errorMessage = '';
              this.step = 2;
              this.startCountdown(err.error.waitTime);
            } else {
              this.errorMessage = err.error?.message || "Erreur de connexion au serveur.";
            }
          }, 0);
        }
      });
  }

  verifyOtp() {
    if (!this.otpCode) {
      this.errorMessage = "Veuillez entrer le code reçu par email.";
      return;
    }
    this.errorMessage = '';
    this.isLoading = true;

    this.http.post(`${environment.apiUrl}/auth/login/verify-otp`, { cin: this.cin, otpCode: this.otpCode })
      .subscribe({
        next: (res: any) => {
          setTimeout(() => {
            this.isLoading = false;
            if (res.success && res.token) {
              localStorage.removeItem('admin_token'); // Éviter conflit avec un ancien token admin
              localStorage.setItem('resident_token', res.token);
              localStorage.setItem('resident_cin', res.cin || this.cin);
              this.router.navigate(['/mes-stages']);
            }
          }, 0);
        },
        error: (err) => {
          setTimeout(() => {
            this.isLoading = false;
            this.errorMessage = err.error?.message || "Code invalide.";
            this.otpCode = '';
          }, 0);
        }
      });
  }

  resendOtp() {
    this.requestOtp();
  }

  startCountdown(seconds: number = 120) {
    this.countdown = seconds;
    this.clearTimer();
    this.intervalId = setInterval(() => {
      if (this.countdown > 0) {
        this.countdown--;
        this.cdr.detectChanges();
      } else {
        this.clearTimer();
        this.cdr.detectChanges();
      }
    }, 1000);
  }

  clearTimer() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  formatCountdown(): string {
    const minutes = Math.floor(this.countdown / 60);
    const seconds = this.countdown % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  }

  resetToStep1() {
    this.step = 1;
    this.otpCode = '';
    this.clearTimer();
    this.cdr.detectChanges();
  }
}
