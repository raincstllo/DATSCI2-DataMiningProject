import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { formatDate, formatNumber, formatPhone } from '../../core/format';
import { Page, PatientListItem } from '../../core/records.models';
import { readApiError, RecordsService } from '../../core/records.service';
import { Pager } from '../../shared/pager';
import { ToothStrip } from '../../shared/tooth-strip';

const PAGE_SIZE = 25;

@Component({
  selector: 'app-patient-list',
  imports: [RouterLink, Pager, ToothStrip],
  templateUrl: './patient-list.html',
  styleUrl: './patients.css',
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
