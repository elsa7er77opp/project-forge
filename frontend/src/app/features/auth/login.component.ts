import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/auth/auth.service';
import { AuthLayoutComponent } from './auth-layout.component';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, AuthLayoutComponent],
  styleUrls: ['./auth-form.scss'],
  template: `
    <app-auth-layout>
      <div class="form__head">
        <h2 class="form__title">Welcome back</h2>
        <p class="form__sub">Sign in to your engineering workspace.</p>
      </div>

      @if (error()) {
        <div class="form__error">{{ error() }}</div>
      }

      <form class="form" [formGroup]="form" (ngSubmit)="submit()">
        <div class="field">
          <label class="field__label" for="email">Email</label>
          <input
            id="email"
            type="email"
            class="input"
            formControlName="email"
            placeholder="you@company.com"
            autocomplete="email"
            [class.input--invalid]="invalid('email')"
          />
          @if (invalid('email')) {
            <span class="field__error">Enter a valid email address.</span>
          }
        </div>

        <div class="field">
          <label class="field__label" for="password">Password</label>
          <input
            id="password"
            type="password"
            class="input"
            formControlName="password"
            placeholder="••••••••"
            autocomplete="current-password"
            [class.input--invalid]="invalid('password')"
          />
          @if (invalid('password')) {
            <span class="field__error">Password is required.</span>
          }
        </div>

        <button class="btn btn--primary btn--block" type="submit" [disabled]="loading()">
          @if (loading()) {
            <span class="spinner"></span>
          } @else {
            Sign in
          }
        </button>
      </form>

      @if (showDemoHint) {
        <div class="demo">
          <span>Demo account: <code>admin&#64;forge.dev</code></span>
          <button type="button" (click)="fillDemoEmail()">Use demo email</button>
        </div>
      }

      <p class="form__footer">
        Don't have a workspace? <a routerLink="/register">Create one</a>
      </p>
      <!-- The two public entry points. A visitor who lands here without an
           account should be able to reach the published work without one. -->
      <p class="form__footer">
        <a routerLink="/projects/public">Browse public projects</a>
        <span class="auth-sep">·</span>
        <a routerLink="/organisations">Find an organisation</a>
      </p>
    </app-auth-layout>
  `,
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal('');

  /**
   * The demonstration email is offered only when the app is served locally,
   * and the password is never shown or filled.
   *
   * A password in the bundle is a published password: it is readable by every
   * visitor, it cannot be rotated without a release, and it stays in version
   * control after it is changed. Whoever is demonstrating knows the password
   * and can type it; nobody else needs it.
   */
  readonly showDemoHint =
    typeof location !== 'undefined' &&
    ['localhost', '127.0.0.1'].includes(location.hostname);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  invalid(control: string): boolean {
    const c = this.form.get(control);
    return !!c && c.invalid && (c.touched || c.dirty);
  }

  fillDemoEmail(): void {
    this.form.patchValue({ email: 'admin@forge.dev' });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set('');
    const { email, password } = this.form.getRawValue();
    this.auth.login(email, password).subscribe({
      next: () => this.router.navigate(['/dashboard']),
      error: (err: HttpErrorResponse) => {
        this.error.set(err.error?.error ?? 'Unable to sign in. Please try again.');
        this.loading.set(false);
      },
    });
  }
}
