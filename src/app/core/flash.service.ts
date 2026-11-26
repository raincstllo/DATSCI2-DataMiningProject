import { Injectable, signal } from '@angular/core';

/** A one-off success message shown after navigating, e.g. "Visit V1717 saved." */
@Injectable({ providedIn: 'root' })
export class FlashService {
  readonly message = signal<string | null>(null);
  private timer: ReturnType<typeof setTimeout> | undefined;

  show(message: string): void {
    clearTimeout(this.timer);
    this.message.set(message);
    this.timer = setTimeout(() => this.message.set(null), 8000);
  }

  clear(): void {
    clearTimeout(this.timer);
    this.message.set(null);
  }
}
