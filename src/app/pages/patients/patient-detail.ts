import { Component, computed, inject, OnInit, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FlashService } from '../../core/flash.service';
import { formatDate, formatPeso, formatPhone, todayIso } from '../../core/format';
import { PatientDetail as Detail } from '../../core/records.models';
import { readApiError, RecordsService } from '../../core/records.service';
import { ConfirmDialog } from '../../shared/confirm-dialog';

@Component({
  selector: 'app-patient-detail',
  imports: [RouterLink, ConfirmDialog],
  template: `
    <div class="stack">
      <p><a routerLink="/patients">← All patients</a></p>

      @if (error(); as message) {
        <p class="alert alert-error" role="alert">{{ message }}</p>
      }

      @if (patient(); as p) {
        <div class="page-head">
          <h1>{{ p.name }}</h1>
          <div class="actions">
            <a class="btn" routerLink="/visits/new" [queryParams]="{ patient: p.patient_id }">Log visit</a>
            <a class="btn btn-secondary" [routerLink]="['/patients', p.patient_id, 'edit']">Edit</a>
            @if (p.visits.length === 0) {
              <button type="button" class="btn btn-secondary" (click)="remove()">Delete</button>
            }
          </div>
        </div>

        <section class="card" aria-labelledby="info-heading">
          <h2 id="info-heading">Details</h2>
          <dl class="details">
            <div><dt>Patient ID</dt><dd>{{ p.patient_id }}</dd></div>
            <div>
              <dt>Mobile number</dt>
              <dd><a [href]="'tel:' + p.contact_number">{{ phone(p.contact_number) }}</a></dd>
            </div>
            <div><dt>Visits</dt><dd>{{ p.visits.length }}</dd></div>
            <div><dt>Total spent</dt><dd>{{ peso(totalSpent()) }}</dd></div>
            <div><dt>First visit</dt><dd>{{ firstVisit() ? date(firstVisit()!) : '—' }}</dd></div>
            <div><dt>Last visit</dt><dd>{{ lastVisit() ? date(lastVisit()!) : '—' }}</dd></div>
          </dl>
          @if (p.visits.length > 0) {
            <p class="hint">To delete this patient, delete their visits first.</p>
          }
        </section>

        <section class="card" aria-labelledby="history-heading">
          <h2 id="history-heading">Visit history</h2>
          @if (p.visits.length) {
            <div class="table-wrap" tabindex="0" role="region" aria-label="Visit history table">
              <table>
                <caption class="visually-hidden">Visit history, newest first</caption>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Visit ID</th>
                    <th scope="col">Services</th>
                    <th scope="col" class="num">Total</th>
                    <th scope="col"><span class="visually-hidden">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (v of p.visits; track v.visit_id) {
                    <tr>
                      <th scope="row">
                        {{ date(v.date_visited) }}
                        @if (v.date_visited > today) {
                          <span class="tag tag-warning">Future date, not used in analysis</span>
                        }
                      </th>
                      <td>{{ v.visit_id }}</td>
                      <td class="cell-wrap">{{ serviceText(v) }}</td>
                      <td class="num">{{ peso(v.total_fee) }}</td>
                      <td>
                        <a class="btn btn-secondary btn-small" [routerLink]="['/visits', v.visit_id, 'edit']"
                          >Edit <span class="visually-hidden">visit {{ v.visit_id }}</span></a
                        >
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <p>No visits recorded yet.</p>
          }
        </section>

        <app-confirm-dialog
          heading="Delete this patient?"
          [message]="'This permanently deletes ' + p.name + ' (' + p.patient_id + ').'"
          confirmLabel="Delete patient"
        />
      } @else if (!error()) {
        <p role="status">Loading…</p>
      }
    </div>
  `,
  styles: `
    .details {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr));
      gap: 0.75rem;
      margin: 0 0 0.5rem;
    }
    dt {
      font-size: 0.85rem;
      color: var(--text-secondary);
    }
    dd {
      margin: 0;
      font-weight: 600;
    }
  `,
})
export class PatientDetailPage implements OnInit {
  private readonly records = inject(RecordsService);
  private readonly router = inject(Router);
  private readonly flash = inject(FlashService);
  private readonly confirm = viewChild(ConfirmDialog);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';

  protected readonly today = todayIso();
  protected readonly phone = formatPhone;
  protected readonly peso = formatPeso;
  protected readonly date = formatDate;
  protected readonly patient = signal<Detail | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly totalSpent = computed(() =>
    (this.patient()?.visits ?? []).reduce((sum, v) => sum + v.total_fee, 0),
  );
  protected readonly lastVisit = computed(() => this.patient()?.visits[0]?.date_visited ?? null);
  protected readonly firstVisit = computed(() => this.patient()?.visits.at(-1)?.date_visited ?? null);

  ngOnInit(): void {
    this.records.getPatient(this.id).subscribe({
      next: (p) => this.patient.set(p),
      error: (err: unknown) => this.error.set(readApiError(err, 'This patient could not be loaded.').message),
    });
  }

  protected serviceText(v: Detail['visits'][number]): string {
    return v.services
      .map((s) => (s.teeth_operated.length ? `${s.nature_of_visit} (${s.teeth_operated.join(', ')})` : s.nature_of_visit))
      .join(', ');
  }

  protected async remove(): Promise<void> {
    const p = this.patient();
    if (!p || !(await this.confirm()?.ask())) return;
    this.records.deletePatient(p.patient_id).subscribe({
      next: () => {
        this.flash.show(`${p.name} (${p.patient_id}) deleted.`);
        this.router.navigate(['/patients']);
      },
      error: (err: unknown) => this.error.set(readApiError(err, 'The patient could not be deleted.').message),
    });
  }
}
