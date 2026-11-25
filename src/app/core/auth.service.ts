import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { map, Observable } from 'rxjs';
import { LoginResponse } from './api.models';
import { ResultsStore } from './results.store';

interface Session {
  token: string;
  expiresAt: number;
}

const STORAGE_KEY = 'session';

/** Reads the expiry (ms) from a JWT without trusting anything else in it. */
function tokenExpiry(token: string): number | null {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const exp = (JSON.parse(atob(payload)) as { exp?: unknown }).exp;
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly results = inject(ResultsStore);
  private readonly session = signal<Session | null>(null);
  private expiryTimer: ReturnType<typeof setTimeout> | undefined;

  readonly isLoggedIn = computed(() => this.session() !== null);

  constructor() {
    // sessionStorage: survives a page refresh, cleared when the tab closes.
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) this.start(saved);
  }

  token(): string | null {
    const s = this.session();
    if (!s) return null;
    if (Date.now() >= s.expiresAt) {
      this.logout(true);
      return null;
    }
    return s.token;
  }

  login(username: string, password: string): Observable<void> {
    return this.http
      .post<LoginResponse>('/api/auth/login', { username, password })
      .pipe(map((res) => void this.start(res.token)));
  }

  logout(expired = false): void {
    clearTimeout(this.expiryTimer);
    this.session.set(null);
    this.results.reset();
    sessionStorage.removeItem(STORAGE_KEY);
    this.router.navigate(['/login'], expired ? { queryParams: { expired: 1 } } : {});
  }

  private start(token: string): void {
    const expiresAt = tokenExpiry(token);
    if (!expiresAt || expiresAt <= Date.now()) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(STORAGE_KEY, token);
    this.session.set({ token, expiresAt });
    clearTimeout(this.expiryTimer);
    this.expiryTimer = setTimeout(() => this.logout(true), expiresAt - Date.now());
  }
}
