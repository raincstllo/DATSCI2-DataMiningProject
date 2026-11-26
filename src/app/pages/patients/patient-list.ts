import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { formatDate, formatNumber, formatPhone } from '../../core/format';
import { Page, PatientListItem } from '../../core/records.models';
import { readApiError, RecordsService } from '../../core/records.service';
import { Pager } from '../../shared/pager';

const PAGE_SIZE = 25;

@Component({
  selector: 'app-patient-list',
  imports: [RouterLink, Pager],
  template: `
    <div class="stack">
      <div class="page-head">
        <h1>Patients</h1>
        <a class="btn" routerLink="/patients/new">Add patient</a>
      </div>

      <section class="card" aria-labelledby="list-heading">
        <h2 id="list-heading" class="visually-hidden">Patient list</h2>
        <div class="filters">
          <div class="field">
            <label for="patient-search">Search by name, patient ID or number</label>
            <input
              id="patient-search"
              type="search"
              autocomplete="off"
              [value]="query()"
              (input)="onSearch($any($event.target).value)"
            />
          </div>
        </div>

        <p role="status" class="muted">{{ status() }}</p>

        @if (error(); as message) {
          <p class="alert alert-error" role="alert">{{ message }}</p>
        }

        @if (data(); as d) {
          @if (d.items.length) {
            <div class="table-wrap" tabindex="0" role="region" aria-label="Patients table">
              <table>
                <caption class="visually-hidden">Patients, newest first</caption>
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Patient ID</th>
                    <th scope="col">Contact number</th>
                    <th scope="col" class="num">Visits</th>
                    <th scope="col">Last visit</th>
                  </tr>
                </thead>
                <tbody>
                  @for (p of d.items; track p.patient_id) {
                    <tr>
                      <th scope="row">
                        <a [routerLink]="['/patients', p.patient_id]">{{ p.name }}</a>
                      </th>
                      <td>{{ p.patient_id }}</td>
                      <td>{{ phone(p.contact_number) }}</td>
                      <td class="num">{{ p.visit_count }}</td>
                      <td>{{ p.last_visit ? date(p.last_visit) : 'No visits yet' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
          <app-pager
            [page]="page()"
            [total]="d.total"
            [pageSize]="pageSize"
            label="Patient list pages"
            (pageChange)="goTo($event)"
          />
        }
      </section>
    </div>
  `,
})
export class PatientList implements OnInit {
  private readonly records = inject(RecordsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly pageSize = PAGE_SIZE;
  protected readonly phone = formatPhone;
  protected readonly date = formatDate;
  protected readonly query = signal('');
  protected readonly page = signal(1);
  protected readonly data = signal<Page<PatientListItem> | null>(null);
  protected readonly status = signal('Loading patients…');
  protected readonly error = signal<string | null>(null);

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.searchTimer));
  }

  ngOnInit(): void {
    const qp = this.route.snapshot.queryParamMap;
    this.query.set(qp.get('q') ?? '');
    this.page.set(Math.max(1, Number(qp.get('page')) || 1));
    this.load();
  }

  protected onSearch(value: string): void {
    this.query.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.page.set(1);
      this.load();
    }, 300);
  }

  protected goTo(page: number): void {
    this.page.set(page);
    this.load();
  }

  private load(): void {
    // Keep the search in the URL so Back returns to the same list.
    this.router.navigate([], {
      queryParams: { q: this.query() || null, page: this.page() > 1 ? this.page() : null },
      replaceUrl: true,
    });
    this.records.listPatients(this.query().trim(), this.page(), PAGE_SIZE).subscribe({
      next: (d) => {
        this.error.set(null);
        this.data.set(d);
        const from = (d.page - 1) * d.pageSize + 1;
        const to = Math.min(d.total, d.page * d.pageSize);
        this.status.set(
          d.total
            ? `Showing ${formatNumber(from)}–${formatNumber(to)} of ${formatNumber(d.total)} patients`
            : 'No patients match',
        );
      },
      error: (err: unknown) => {
        this.status.set('');
        this.error.set(readApiError(err, 'The patient list could not be loaded.').message);
      },
    });
  }
}
