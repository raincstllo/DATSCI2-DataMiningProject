import { Component, ElementRef, input, viewChild } from '@angular/core';

/**
 * Accessible confirm dialog built on the native <dialog> element (focus is trapped and
 * Escape cancels). Usage: `if (await dialog.ask()) { ... }`.
 */
@Component({
  selector: 'app-confirm-dialog',
  template: `
    <dialog #dialog class="confirm" aria-labelledby="confirm-title" aria-describedby="confirm-text" (close)="onClose()">
      <h2 id="confirm-title">{{ heading() }}</h2>
      <p id="confirm-text">{{ message() }}</p>
      <div class="actions">
        <button type="button" class="btn btn-secondary" (click)="finish(false)" autofocus>Cancel</button>
        <button type="button" class="btn btn-danger" (click)="finish(true)">{{ confirmLabel() }}</button>
      </div>
    </dialog>
  `,
})
export class ConfirmDialog {
  readonly heading = input('Are you sure?');
  readonly message = input('');
  readonly confirmLabel = input('Delete');

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private resolve: ((ok: boolean) => void) | null = null;
  private returnFocus: HTMLElement | null = null;

  ask(): Promise<boolean> {
    this.returnFocus = document.activeElement as HTMLElement | null;
    this.dialog().nativeElement.showModal();
    return new Promise((resolve) => (this.resolve = resolve));
  }

  protected finish(ok: boolean): void {
    this.resolve?.(ok);
    this.resolve = null;
    this.dialog().nativeElement.close();
  }

  protected onClose(): void {
    // Escape key or programmatic close without a choice counts as Cancel.
    this.resolve?.(false);
    this.resolve = null;
    this.returnFocus?.focus();
  }
}
