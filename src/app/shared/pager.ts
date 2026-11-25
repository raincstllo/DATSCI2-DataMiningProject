import { Component, computed, input, output } from '@angular/core';

/** Previous / Next pagination with a "Page X of Y" label. */
@Component({
  selector: 'app-pager',
  template: `
    @if (pageCount() > 1) {
      <nav class="pager" [attr.aria-label]="label()">
        <button type="button" class="btn btn-secondary" (click)="go(page() - 1)" [disabled]="page() <= 1">
          Previous
        </button>
        <span>Page {{ page() }} of {{ pageCount() }}</span>
        <button type="button" class="btn btn-secondary" (click)="go(page() + 1)" [disabled]="page() >= pageCount()">
          Next
        </button>
      </nav>
    }
  `,
})
export class Pager {
  /** 1-based current page. */
  readonly page = input.required<number>();
  readonly total = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly label = input('Pages');
  readonly pageChange = output<number>();

  protected readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));

  protected go(page: number): void {
    this.pageChange.emit(Math.min(Math.max(page, 1), this.pageCount()));
  }
}
