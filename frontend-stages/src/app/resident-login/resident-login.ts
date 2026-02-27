import { Component, inject, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';


@Component({
  selector: 'app-resident-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="container mt-5">
      <div class="row justify-content-center">
        <div class="col-md-5">
          <div class="card shadow border-primary custom-margin">
            <div class="card-header bg-primary text-white text-center py-3">
              <h4 class="mb-0">🧑‍⚕️ Espace Résident</h4>
              <small>Connexion sécurisée par e-mail</small>
            </div>
            <div class="card-body p-4">

              <!-- Etape 1 : Demande OTP -->
              <div *ngIf="step === 1">
                <div class="mb-3">
                  <label class="form-label">Numéro de CIN / Passeport</label>
                  <input type="text" [(ngModel)]="cin" class="form-control" placeholder="Entrez votre CIN" />
                </div>
                <div class="mb-4">
                  <label class="form-label">Adresse E-mail Institutionnelle</label>
                  <input type="email" [(ngModel)]="email" class="form-control" placeholder="prenom.nom@medecine.tn" />
                  <div class="form-text">Le code de sécurité sera envoyé à cette adresse.</div>
                </div>
                <button class="btn btn-primary w-100" (click)="requestOtp()" [disabled]="isLoading">
                  {{ isLoading ? 'Envoi en cours...' : 'Recevoir mon code' }}
                </button>
              </div>

              <!-- Etape 2 : Vérification OTP -->
              <div *ngIf="step === 2">
                <div class="alert alert-success">
                  Un code a été envoyé à <strong>{{email}}</strong>. Il expire dans 10 minutes.
                </div>
                <div class="mb-4">
                  <label class="form-label">Code de sécurité (6 chiffres)</label>
                  <input type="text" [(ngModel)]="otpCode" class="form-control text-center code-input" placeholder="000000" maxlength="6" />
                </div>
                <button class="btn btn-success w-100 mb-3" (click)="verifyOtp()" [disabled]="isLoading">
                  {{ isLoading ? 'Vérification...' : 'Valider & Se connecter' }}
                </button>
                
                <div class="text-center mb-3">
                  <p class="text-muted mb-1" *ngIf="countdown > 0">
                    Vous pouvez demander un nouveau code dans <strong>{{ formatCountdown() }}</strong>
                  </p>
                  <button class="btn btn-outline-secondary w-100" *ngIf="countdown === 0" (click)="resendOtp()" [disabled]="isLoading">
                    Renvoyer un nouveau code
                  </button>
                </div>

                <button class="btn btn-link w-100" (click)="resetToStep1()" [disabled]="isLoading">
                  Modifier l'email ou le CIN
                </button>
              </div>

              <div *ngIf="errorMessage" class="alert alert-danger mt-3">
                {{ errorMessage }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .custom-margin { margin-top: 5vh; }
    .code-input { font-size: 1.5rem; letter-spacing: 5px; font-weight: bold; }
  `]
})
export class ResidentLoginComponent implements OnDestroy {
  step = 1;
  cin = '';
  email = '';
  otpCode = '';
  isLoading = false;
  errorMessage = '';
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

    this.http.post('http://localhost:3000/api/auth/login/request-otp', { cin: this.cin, email: this.email })
      .subscribe({
        next: (res: any) => {
          this.isLoading = false;
          if (res.success) {
            this.step = 2;
            this.startCountdown(120);
          }
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.isLoading = false;
          if (err.status === 429 && err.error?.waitTime) {
            // Backend blocked it: switch to step 2 and resume timer with remaining time
            this.errorMessage = '';
            this.step = 2;
            this.startCountdown(err.error.waitTime);
          } else {
            this.errorMessage = err.error?.message || "Erreur de connexion au serveur.";
          }
          this.cdr.detectChanges();
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

    this.http.post('http://localhost:3000/api/auth/login/verify-otp', { cin: this.cin, otpCode: this.otpCode })
      .subscribe({
        next: (res: any) => {
          this.isLoading = false;
          this.cdr.detectChanges();
          if (res.success && res.token) {
            localStorage.setItem('resident_token', res.token);
            localStorage.setItem('resident_cin', this.cin);
            this.router.navigate(['/mes-stages']);
          }
        },
        error: (err) => {
          this.isLoading = false;
          this.errorMessage = err.error?.message || "Code invalide.";
          this.otpCode = ''; // Reset empty code to encourage re-typing
          this.cdr.detectChanges();
        }
      });
  }

  resendOtp() {
    this.requestOtp(); // Re-use the existing function. It will trigger step 2 and reset timer on success.
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
