import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { FlashService } from './core/flash.service';

interface NavItem {
  path: string;
  label: string;
  icon: 'home' | 'patients' | 'visits' | 'followups' | 'revenue' | 'analysis';
}

@Component({
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly auth = inject(AuthService);
  protected readonly flash = inject(FlashService);
  /** Hides the logo image if public/logo.jpg has not been added yet. */
  protected readonly logoMissing = signal(false);

  protected readonly nav: readonly NavItem[] = [
    { path: '/', label: 'Home', icon: 'home' },
    { path: '/patients', label: 'Patients', icon: 'patients' },
    { path: '/visits', label: 'Visits', icon: 'visits' },
    { path: '/retention', label: 'Follow-ups', icon: 'followups' },
    { path: '/revenue', label: 'Revenue', icon: 'revenue' },
    { path: '/analysis', label: 'Analysis details', icon: 'analysis' },
  ];

  protected skipToMain(event: Event): void {
    event.preventDefault();
    document.getElementById('main')?.focus();
  }
}
