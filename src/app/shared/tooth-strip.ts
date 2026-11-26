import { Component } from '@angular/core';

/** FDI tooth numbers for the upper arch, printed across the head of each record card. */
const UPPER_ARCH = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];

@Component({
  selector: 'app-tooth-strip',
  host: { class: 'fdi', 'aria-hidden': 'true' },
  template: `
    @for (n of numbers; track n) {
      <span>{{ n }}</span>
    }
  `,
})
export class ToothStrip {
  protected readonly numbers = UPPER_ARCH;
}
