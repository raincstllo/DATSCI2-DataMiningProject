import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly errorBox = viewChild<ElementRef<HTMLElement>>('errorBox');

  protected readonly expired = inject(ActivatedRoute).snapshot.queryParamMap.has('expired');
  protected readonly submitting = signal(false);
  protected readonly submitted = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    username: ['', [Validators.required, Validators.maxLength(100)]],
    password: ['', [Validators.required, Validators.maxLength(200)]],
  });

  protected invalid(name: 'username' | 'password'): boolean {
    return this.submitted() && this.form.controls[name].invalid;
  }

  protected submit(): void {
    this.submitted.set(true);
    this.error.set(null);
    if (this.form.invalid) {
      const first = this.form.controls.username.invalid ? 'username' : 'password';
      document.getElementById(first)?.focus();
      return;
    }

    this.submitting.set(true);
    const { username, password } = this.form.getRawValue();
    this.auth.login(username, password).subscribe({
      next: () => this.router.navigate(['/retention']),
      error: (err: unknown) => {
        this.submitting.set(false);
        this.form.controls.password.reset();
        this.error.set(this.messageFor(err));
        setTimeout(() => this.errorBox()?.nativeElement.focus());
      },
    });
  }

  private messageFor(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 401) return 'The username or password is incorrect.';
      if (err.status === 429) return 'Too many failed attempts. Wait 15 minutes, then try again.';
      if (err.status === 0 || err.status >= 500) {
        return 'The server could not be reached. Check that the backend is running.';
      }
    }
    return 'Login failed. Please try again.';
  }
}
