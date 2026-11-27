import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
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
  host: { '[class.signed-in]': 'auth.isLoggedIn()' },
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly auth = inject(AuthService);
  protected readonly flash = inject(FlashService);
  /** Hides the logo image if public/logo.jpg has not been added yet. */
  protected readonly logoMissing = signal(false);
  /** Narrow screens only: whether the nav panel under the top bar is open. */
  protected readonly menuOpen = signal(false);
  private readonly menuButton = viewChild<ElementRef<HTMLButtonElement>>('menuButton');

  constructor() {
    inject(Router)
      .events.pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.menuOpen.set(false));
  }

  protected readonly nav: readonly NavItem[] = [
    { path: '/', label: 'Home', icon: 'home' },
    { path: '/patients', label: 'Patients', icon: 'patients' },
    { path: '/visits', label: 'Visits', icon: 'visits' },
    { path: '/retention', label: 'Follow-ups', icon: 'followups' },
    { path: '/revenue', label: 'Revenue', icon: 'revenue' },
    { path: '/analysis', label: 'Analysis details', icon: 'analysis' },
  ];

  /** Closes the narrow-screen menu; on Esc, focus goes back to the Menu button. */
  protected closeMenu(returnFocus = false): void {
    if (!this.menuOpen()) return;
    this.menuOpen.set(false);
    if (returnFocus) this.menuButton()?.nativeElement.focus();
  }

  protected skipToMain(event: Event): void {
    event.preventDefault();
    document.getElementById('main')?.focus();
  }
}
