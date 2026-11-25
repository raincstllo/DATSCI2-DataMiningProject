import { Component, DestroyRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { formatDate, formatNumber, formatPeso, todayIso } from '../../core/format';
import { Page, Visit } from '../../core/records.models';
import { readApiError, RecordsService } from '../../core/records.service';
import { ConfirmDialog } from '../../shared/confirm-dialog';
import { Pager } from '../../shared/pager';
import { ToothStrip } from '../../shared/tooth-strip';

const PAGE_SIZE = 25;

@Component({
  selector: 'app-visit-list',
  imports: [RouterLink, Pager, ConfirmDialog, ToothStrip],
  templateUrl: './visit-list.html',
  styleUrl: './visit-list.css',
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
