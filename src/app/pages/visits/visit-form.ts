import { Component, DestroyRef, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FlashService } from '../../core/flash.service';
import { formatPeso, formatPhone, todayIso } from '../../core/format';
import { PatientListItem, Visit } from '../../core/records.models';
import { readApiError, RecordsService } from '../../core/records.service';
import { ToothStrip } from '../../shared/tooth-strip';

type ServiceRow = FormGroup<{
  nature_of_visit: FormControl<string>;
  teeth_operated: FormControl<string>;
  fee: FormControl<number | null>;
}>;

const TOOTH = /^([1-9]|[12]\d|3[0-2]|[A-T])$/;

@Component({
  selector: 'app-visit-form',
  imports: [ReactiveFormsModule, RouterLink, ToothStrip],
  templateUrl: './visit-form.html',
  styleUrl: './visit-form.css',
})
export class VisitForm implements OnInit {
  private readonly records = inject(RecordsService);
  private readonly router = inject(Router);
  private readonly flash = inject(FlashService);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly route = inject(ActivatedRoute);
  private readonly summaryBox = viewChild<ElementRef<HTMLElement>>('summaryBox');
  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly id = this.route.snapshot.paramMap.get('id');
  protected readonly today = todayIso();
  protected readonly peso = formatPeso;
  protected readonly phone = formatPhone;
  protected readonly services = toSignal(this.records.services$);

  protected readonly loading = signal(!!this.id);
  protected readonly saving = signal(false);
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly summary = signal<{ field: string; text: string }[]>([]);
  protected readonly pageError = signal<string | null>(null);

  // Patient picker
  protected readonly patient = signal<{ patient_id: string; name: string; contact_number?: string } | null>(null);
  protected readonly patientQuery = signal('');
  protected readonly results = signal<PatientListItem[]>([]);
  protected readonly searchStatus = signal('');

  protected readonly form = this.fb.group({
    date_visited: [this.today],
    services: this.fb.array<ServiceRow>([]),
  });

  protected readonly total = signal(0);

  get rows(): FormArray<ServiceRow> {
    return this.form.controls.services;
  }

  constructor() {
    this.addRow();
    this.form.valueChanges.subscribe(() => {
      this.total.set(this.computeTotal());
      this.dropFixedErrors();
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.searchTimer));
  }

  ngOnInit(): void {
    if (this.id) {
      this.records.getVisit(this.id).subscribe({
        next: (v) => this.fill(v),
        error: (err: unknown) => {
          this.loading.set(false);
          this.pageError.set(readApiError(err, 'This visit could not be loaded.').message);
        },
      });
      return;
    }
    const preset = this.route.snapshot.queryParamMap.get('patient');
    if (preset && /^P\d+$/.test(preset)) {
      this.records.getPatient(preset).subscribe({
        next: (p) => this.patient.set({ patient_id: p.patient_id, name: p.name, contact_number: p.contact_number }),
      });
    }
  }

  // ------------------------------------------------------------ patient picker

  protected onPatientSearch(value: string): void {
    this.patientQuery.set(value);
    clearTimeout(this.searchTimer);
    const q = value.trim();
    if (q.length < 2) {
      this.results.set([]);
      this.searchStatus.set(q ? 'Type at least 2 characters.' : '');
      return;
    }
    this.searchTimer = setTimeout(() => {
      this.records.listPatients(q, 1, 8).subscribe({
        next: (page) => {
          this.results.set(page.items);
          this.searchStatus.set(
            page.total === 0
              ? 'No patients found. Add them on the Patients page first.'
              : page.total > page.items.length
                ? `${page.total} matches, showing the first ${page.items.length}. Type more to narrow down.`
                : `${page.total} match${page.total === 1 ? '' : 'es'}.`,
          );
        },
        error: () => this.searchStatus.set('Search failed. Check that the backend is running.'),
      });
    }, 250);
  }

  protected choosePatient(p: PatientListItem): void {
    this.patient.set({ patient_id: p.patient_id, name: p.name, contact_number: p.contact_number });
    this.results.set([]);
    this.patientQuery.set('');
    this.searchStatus.set('');
    this.dropFixedErrors();
    setTimeout(() => document.getElementById('date_visited')?.focus());
  }

  protected changePatient(): void {
    this.patient.set(null);
    setTimeout(() => document.getElementById('patient_id')?.focus());
  }

  // ------------------------------------------------------------ service rows

  protected addRow(value?: { nature_of_visit: string; teeth_operated: string; fee: number | null }): void {
    this.rows.push(
      this.fb.group({
        nature_of_visit: [value?.nature_of_visit ?? ''],
        teeth_operated: [value?.teeth_operated ?? ''],
        fee: this.fb.control<number | null>(value?.fee ?? null),
      }),
    );
    if (!value) {
      const index = this.rows.length - 1;
      setTimeout(() => document.getElementById(`services.${index}.nature_of_visit`)?.focus());
    }
  }

  protected removeRow(index: number): void {
    this.rows.removeAt(index);
    this.errors.set({});
    this.summary.set([]);
    setTimeout(() => document.getElementById('add-service')?.focus());
  }

  private computeTotal(): number {
    return this.rows.controls.reduce((sum, row) => sum + (Number(row.controls.fee.value) || 0), 0);
  }

  // ------------------------------------------------------------ save

  protected focusField(event: Event, field: string): void {
    event.preventDefault();
    document.getElementById(field)?.focus();
  }

  protected err(path: string): string | undefined {
    return this.errors()[path];
  }

  protected save(): void {
    this.pageError.set(null);
    const errors = this.validate();
    if (this.showErrors(errors)) return;

    const value = this.form.getRawValue();
    const input = {
      patient_id: this.patient()!.patient_id,
      date_visited: value.date_visited,
      services: value.services.map((s) => ({
        nature_of_visit: s.nature_of_visit,
        teeth_operated: s.teeth_operated,
        fee: s.fee,
      })),
    };
    this.saving.set(true);
    const request = this.id ? this.records.updateVisit(this.id, input) : this.records.createVisit(input);
    request.subscribe({
      next: (v) => {
        this.flash.show(`Visit ${v.visit_id} for ${v.patient_name ?? v.patient_id} saved (${formatPeso(v.total_fee)}).`);
        this.router.navigate(['/patients', v.patient_id]);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        const { message, fields } = readApiError(err, 'The visit could not be saved.');
        if (!this.showErrors(fields)) this.pageError.set(message);
      },
    });
  }

  private validate(): Record<string, string> {
    const errors: Record<string, string> = {};
    if (!this.patient()) errors['patient_id'] = 'Choose a patient.';
    const date = this.form.controls.date_visited.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors['date_visited'] = 'Enter the visit date.';
    else if (date > this.today) errors['date_visited'] = 'The visit date cannot be in the future.';
    if (!this.rows.length) errors['services'] = 'Add at least one service.';
    this.rows.controls.forEach((row, i) => {
      const v = row.getRawValue();
      if (!v.nature_of_visit) errors[`services.${i}.nature_of_visit`] = 'Choose a service.';
      const teeth = v.teeth_operated.split(/[,;\s]+/).filter(Boolean);
      if (!teeth.every((t) => TOOTH.test(t.toUpperCase()))) {
        errors[`services.${i}.teeth_operated`] = 'Use tooth numbers 1–32 or letters A–T, separated by commas.';
      }
      if (v.fee === null || Number.isNaN(Number(v.fee)) || Number(v.fee) < 0) {
        errors[`services.${i}.fee`] = 'Enter the fee (0 or more).';
      }
    });
    return errors;
  }

  /**
   * Removes the messages for fields the owner has since corrected. New problems are not
   * flagged while typing; they still wait for Save.
   */
  private dropFixedErrors(): void {
    const current = this.errors();
    if (!Object.keys(current).length) return;
    const still = this.validate();
    const kept = Object.fromEntries(Object.entries(current).filter(([path]) => path in still));
    if (Object.keys(kept).length === Object.keys(current).length) return;
    this.errors.set(kept);
    this.summary.update((list) => list.filter((e) => e.field in kept));
  }

  /** Shows field errors plus a linked summary; returns true when there were any. */
  private showErrors(errors: Record<string, string>): boolean {
    this.errors.set(errors);
    const label = (path: string): string => {
      if (path === 'patient_id') return 'Patient';
      if (path === 'date_visited') return 'Visit date';
      if (path === 'services') return 'Services';
      const m = /^services\.(\d+)\.(\w+)$/.exec(path);
      if (!m) return 'Service';
      const what = { nature_of_visit: 'service', teeth_operated: 'teeth', fee: 'fee' }[m[2]] ?? m[2];
      return `Service ${Number(m[1]) + 1} ${what}`;
    };
    const list = Object.entries(errors).map(([field, text]) => ({ field, text: `${label(field)}: ${text}` }));
    this.summary.set(list);
    if (list.length) setTimeout(() => this.summaryBox()?.nativeElement.focus());
    return list.length > 0;
  }

  private fill(v: Visit): void {
    this.patient.set({ patient_id: v.patient_id, name: v.patient_name ?? v.patient_id });
    this.form.controls.date_visited.setValue(v.date_visited);
    this.rows.clear();
    for (const s of v.services) {
      this.addRow({ nature_of_visit: s.nature_of_visit, teeth_operated: s.teeth_operated.join(', '), fee: s.fee });
    }
    this.total.set(this.computeTotal());
    this.loading.set(false);
  }
}
