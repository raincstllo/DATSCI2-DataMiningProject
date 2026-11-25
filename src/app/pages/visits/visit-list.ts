import { Component, DestroyRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { formatDate, formatNumber, formatPeso, todayIso } from '../../core/format';
import { Page, Visit } from '../../core/records.models';
import { readApiError, RecordsService } from '../../core/records.service';
import { ConfirmDialog } from '../../shared/confirm-dialog';
import { Pager } from '../../shared/pager';

const PAGE_SIZE = 25;

@Component({
  selector: 'app-visit-list',
  imports: [RouterLink, Pager, ConfirmDialog],
  template: `
    <div class="stack">
      <div class="page-head">
        <h1>Visits</h1>
        <a class="btn" routerLink="/visits/new">Log visit</a>
      </div>

      <section class="card" aria-labelledby="list-heading">
        <h2 id="list-heading" class="visually-hidden">Visit list</h2>
        <form class="filters" role="search" aria-label="Filter visits" (submit)="$event.preventDefault()">
          <div class="field">
            <label for="visit-search">Patient name, patient ID or visit ID</label>
            <input id="visit-search" type="search" autocomplete="off" [value]="q()" (input)="setText($any($event.target).value)" />
          </div>
          <div class="field">
            <label for="visit-service">Service</label>
            <select id="visit-service" [value]="service()" (change)="setFilter('service', $any($event.target).value)">
              <option value="">All services</option>
              @for (s of services() ?? []; track s) {
                <option [value]="s">{{ s }}</option>
              }
            </select>
          </div>
          <div class="field">
            <label for="visit-from">From</label>
            <input id="visit-from" type="date" [value]="from()" (change)="setFilter('from', $any($event.target).value)" />
          </div>
          <div class="field">
            <label for="visit-to">To</label>
            <input id="visit-to" type="date" [value]="to()" (change)="setFilter('to', $any($event.target).value)" />
          </div>
        </form>

        <p role="status" class="muted">{{ status() }}</p>
        @if (error(); as message) {
          <p class="alert alert-error" role="alert">{{ message }}</p>
        }

        @if (data(); as d) {
          @if (d.items.length) {
            <div class="table-wrap" tabindex="0" role="region" aria-label="Visits table">
              <table>
                <caption class="visually-hidden">Visits, newest first</caption>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Patient</th>
                    <th scope="col">Services</th>
                    <th scope="col" class="num">Total</th>
                    <th scope="col">Visit ID</th>
                    <th scope="col"><span class="visually-hidden">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (v of d.items; track v.visit_id) {
                    <tr>
                      <th scope="row">
                        {{ date(v.date_visited) }}
                        @if (v.date_visited > today) {
                          <span class="tag tag-warning">Future date, not used in analysis</span>
                        }
                      </th>
                      <td>
                        <a [routerLink]="['/patients', v.patient_id]">{{ v.patient_name ?? v.patient_id }}</a>
                      </td>
                      <td class="cell-wrap">{{ serviceText(v) }}</td>
                      <td class="num">{{ peso(v.total_fee) }}</td>
                      <td>{{ v.visit_id }}</td>
                      <td>
                        <div class="actions">
                          <a class="btn btn-secondary btn-small" [routerLink]="['/visits', v.visit_id, 'edit']"
                            >Edit <span class="visually-hidden">visit {{ v.visit_id }}</span></a
                          >
                          <button type="button" class="btn btn-secondary btn-small" (click)="remove(v)">
                            Delete <span class="visually-hidden">visit {{ v.visit_id }}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
          <app-pager [page]="page()" [total]="d.total" [pageSize]="pageSize" label="Visit list pages" (pageChange)="goTo($event)" />
        }
      </section>

      <app-confirm-dialog heading="Delete this visit?" [message]="deleteMessage()" confirmLabel="Delete visit" />
    </div>
  `,
})
export class VisitList implements OnInit {
  private readonly records = inject(RecordsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly confirm = viewChild(ConfirmDialog);
  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly pageSize = PAGE_SIZE;
  protected readonly today = todayIso();
  protected readonly date = formatDate;
  protected readonly peso = formatPeso;
  protected readonly services = toSignal(this.records.services$);

  protected readonly q = signal('');
  protected readonly service = signal('');
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly page = signal(1);
  protected readonly data = signal<Page<Visit> | null>(null);
  protected readonly status = signal('Loading visits…');
  protected readonly error = signal<string | null>(null);
  protected readonly deleteMessage = signal('');

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.searchTimer));
  }

  ngOnInit(): void {
    const qp = this.route.snapshot.queryParamMap;
    this.q.set(qp.get('q') ?? '');
    this.service.set(qp.get('service') ?? '');
    this.from.set(qp.get('from') ?? '');
    this.to.set(qp.get('to') ?? '');
    this.page.set(Math.max(1, Number(qp.get('page')) || 1));
    this.load();
  }

  protected setText(value: string): void {
    this.q.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.goTo(1), 300);
  }

  protected setFilter(name: 'service' | 'from' | 'to', value: string): void {
    ({ service: this.service, from: this.from, to: this.to })[name].set(value);
    this.goTo(1);
  }

  protected goTo(page: number): void {
    this.page.set(page);
    this.load();
  }

  protected serviceText(v: Visit): string {
    return v.services
      .map((s) => (s.teeth_operated.length ? `${s.nature_of_visit} (${s.teeth_operated.join(', ')})` : s.nature_of_visit))
      .join(', ');
  }

  protected async remove(v: Visit): Promise<void> {
    this.deleteMessage.set(
      `This permanently deletes visit ${v.visit_id} (${formatDate(v.date_visited)}, ` +
        `${v.patient_name ?? v.patient_id}, ${formatPeso(v.total_fee)}).`,
    );
    if (!(await this.confirm()?.ask())) return;
    this.records.deleteVisit(v.visit_id).subscribe({
      next: () => {
        this.load();
        this.status.set(`Visit ${v.visit_id} deleted.`);
      },
      error: (err: unknown) => this.error.set(readApiError(err, 'The visit could not be deleted.').message),
    });
  }

  private load(): void {
    const filters = {
      q: this.q().trim(),
      service: this.service(),
      from: this.from(),
      to: this.to(),
      page: this.page(),
      pageSize: PAGE_SIZE,
    };
    this.router.navigate([], {
      queryParams: {
        q: filters.q || null,
        service: filters.service || null,
        from: filters.from || null,
        to: filters.to || null,
        page: filters.page > 1 ? filters.page : null,
      },
      replaceUrl: true,
    });
    this.records.listVisits(filters).subscribe({
      next: (d) => {
        this.error.set(null);
        this.data.set(d);
        const first = (d.page - 1) * d.pageSize + 1;
        const last = Math.min(d.total, d.page * d.pageSize);
        this.status.set(
          d.total
            ? `Showing ${formatNumber(first)}–${formatNumber(last)} of ${formatNumber(d.total)} visits`
            : 'No visits match',
        );
      },
      error: (err: unknown) => {
        this.status.set('');
        this.error.set(readApiError(err, 'The visit list could not be loaded.').message);
      },
    });
  }
}
