import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FlashService } from '../../core/flash.service';
import { Patient } from '../../core/records.models';
import { readApiError, RecordsService } from '../../core/records.service';

type Field = 'name' | 'contact_number';

const LABELS: Record<Field, string> = { name: 'Full name', contact_number: 'Mobile number' };

@Component({
  selector: 'app-patient-form',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="stack">
      <h1>{{ id ? 'Edit patient' : 'Add patient' }}</h1>

      <div class="card form-card">
        @if (loading()) {
          <p role="status">Loading…</p>
        } @else {
          @if (summary().length) {
            <div class="error-summary" role="alert" tabindex="-1" #summaryBox>
              <h2>Please fix the following</h2>
              <ul>
                @for (e of summary(); track e.field) {
                  <li><a [href]="'#' + e.field" (click)="focusField($event, e.field)">{{ e.text }}</a></li>
                }
              </ul>
            </div>
          }
          @if (pageError(); as message) {
            <p class="alert alert-error" role="alert">
              {{ message }}
              @if (duplicate(); as d) {
                <a [routerLink]="['/patients', d.patient_id]">Open {{ d.name }} ({{ d.patient_id }})</a>
              }
            </p>
          }

          <form [formGroup]="form" (ngSubmit)="save()" novalidate class="form-grid">
            <div class="field">
              <label for="name">Full name</label>
              <input
                id="name"
                type="text"
                formControlName="name"
                autocomplete="off"
                maxlength="100"
                required
                [attr.aria-invalid]="!!errors()['name']"
                [attr.aria-describedby]="errors()['name'] ? 'name-error' : null"
              />
              @if (errors()['name']; as msg) {
                <p class="field-error" id="name-error">{{ msg }}</p>
              }
            </div>

            <div class="field">
              <label for="contact_number">Mobile number</label>
              <input
                id="contact_number"
                type="tel"
                inputmode="numeric"
                formControlName="contact_number"
                autocomplete="off"
                maxlength="16"
                required
                [attr.aria-invalid]="!!errors()['contact_number']"
                [attr.aria-describedby]="'contact-hint' + (errors()['contact_number'] ? ' contact-error' : '')"
              />
              <p class="hint" id="contact-hint">11 digits starting with 09, e.g. 0917 123 4567</p>
              @if (errors()['contact_number']; as msg) {
                <p class="field-error" id="contact-error">{{ msg }}</p>
              }
            </div>

            <div class="actions">
              <button type="submit" class="btn" [disabled]="saving()">
                {{ saving() ? 'Saving…' : id ? 'Save changes' : 'Add patient' }}
              </button>
              <a class="btn btn-secondary" [routerLink]="id ? ['/patients', id] : ['/patients']">Cancel</a>
            </div>
          </form>
        }
      </div>
    </div>
  `,
})
export class PatientForm implements OnInit {
  private readonly records = inject(RecordsService);
  private readonly router = inject(Router);
  private readonly flash = inject(FlashService);
  private readonly summaryBox = viewChild<ElementRef<HTMLElement>>('summaryBox');

  protected readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id');
  protected readonly loading = signal(!!this.id);
  protected readonly saving = signal(false);
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly summary = signal<{ field: string; text: string }[]>([]);
  protected readonly pageError = signal<string | null>(null);
  protected readonly duplicate = signal<Patient | null>(null);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    contact_number: ['', [Validators.required]],
  });

  ngOnInit(): void {
    if (!this.id) return;
    this.records.getPatient(this.id).subscribe({
      next: (p) => {
        this.form.setValue({ name: p.name, contact_number: p.contact_number });
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.pageError.set(readApiError(err, 'This patient could not be loaded.').message);
      },
    });
  }

  protected focusField(event: Event, field: string): void {
    event.preventDefault();
    document.getElementById(field)?.focus();
  }

  protected save(): void {
    this.pageError.set(null);
    this.duplicate.set(null);
    const value = this.form.getRawValue();
    const errors: Record<string, string> = {};
    const name = value.name.replace(/\s+/g, ' ').trim();
    if (name.length < 2) errors['name'] = 'Enter the patient’s full name.';
    const digits = value.contact_number.replace(/[\s-]/g, '').replace(/^\+63/, '0');
    if (!/^09\d{9}$/.test(digits)) errors['contact_number'] = 'Enter an 11-digit mobile number starting with 09.';
    if (this.showErrors(errors)) return;

    this.saving.set(true);
    const input = { name, contact_number: value.contact_number };
    const request = this.id ? this.records.updatePatient(this.id, input) : this.records.createPatient(input);
    request.subscribe({
      next: (p) => {
        this.flash.show(`${p.name} (${p.patient_id}) saved.`);
        this.router.navigate(['/patients', p.patient_id]);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        const { message, fields } = readApiError(err, 'The patient could not be saved.');
        if (err instanceof HttpErrorResponse && err.status === 409 && err.error?.patient) {
          this.duplicate.set(err.error.patient as Patient);
          this.pageError.set('A patient with this name and number is already recorded.');
          return;
        }
        if (!this.showErrors(fields)) this.pageError.set(message);
      },
    });
  }

  /** Shows field errors plus a linked summary; returns true when there were any. */
  private showErrors(errors: Record<string, string>): boolean {
    this.errors.set(errors);
    const list = (Object.keys(LABELS) as Field[])
      .filter((f) => errors[f])
      .map((f) => ({ field: f, text: `${LABELS[f]}: ${errors[f]}` }));
    this.summary.set(list);
    if (list.length) setTimeout(() => this.summaryBox()?.nativeElement.focus());
    return list.length > 0;
  }
}
