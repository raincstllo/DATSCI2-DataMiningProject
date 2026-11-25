import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChartConfiguration, ChartData } from 'chart.js';
import { BaseChartDirective, provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { ChartThemeService } from '../../core/chart-theme';
import {
  formatDate,
  formatMonth,
  formatMonthLong,
  formatNumber,
  formatPeso,
  formatPesoCompact,
  todayIso,
} from '../../core/format';
import { Visit, VisitSummary } from '../../core/records.models';
import { readApiError, RecordsService } from '../../core/records.service';
import { ResultsStore } from '../../core/results.store';
import { SEGMENT_LABELS } from '../../core/segments';

const RECENT = 10;
const roundPeso = (n: number): string => formatPeso(Math.round(n / 1000) * 1000);

/** Owner's home page: today's picture at a glance plus the latest visits. */
@Component({
  selector: 'app-home',
  imports: [RouterLink, BaseChartDirective],
  providers: [provideCharts(withDefaultRegisterables())],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements OnInit {
  private readonly records = inject(RecordsService);
  private readonly store = inject(ResultsStore);
  private readonly themes = inject(ChartThemeService);

  protected readonly today = todayIso();
  protected readonly todayText = new Intl.DateTimeFormat('en-PH', { dateStyle: 'full' }).format(new Date());
  protected readonly inactiveLabel = SEGMENT_LABELS.Inactive;
  protected readonly fmt = {
    peso: formatPeso,
    roundPeso,
    number: formatNumber,
    date: formatDate,
    month: formatMonth,
    monthLong: formatMonthLong,
  };

  protected readonly summary = signal<VisitSummary | null>(null);
  protected readonly recent = signal<Visit[] | null>(null);
  protected readonly recentError = signal<string | null>(null);

  protected readonly retention = this.store.retention;
  protected readonly revenue = this.store.revenue;

  protected readonly toContact = computed(
    () => this.retention().data?.payload.segments.find((s) => s.segment === 'Inactive') ?? null,
  );
  protected readonly thisMonthForecast = computed(() => {
    const r = this.revenue().data;
    const f = r?.payload.forecast[0];
    return f && f.month.slice(0, 7) === this.today.slice(0, 7) ? f : null;
  });
  protected readonly topService = computed(() => this.revenue().data?.payload.services[0] ?? null);
  protected readonly needsAnalysis = computed(
    () => this.retention().status === 'empty' || this.revenue().status === 'empty',
  );

  protected readonly history = computed(() => (this.revenue().data?.payload.history ?? []).slice(-12));

  protected readonly chartData = computed<ChartData<'bar'>>(() => {
    const t = this.themes.theme();
    const rows = this.history();
    return {
      labels: rows.map((h) => formatMonth(h.month)),
      datasets: [
        {
          label: 'Revenue',
          data: rows.map((h) => h.revenue),
          backgroundColor: t.accent,
          borderRadius: { topLeft: 4, topRight: 4 },
          borderSkipped: 'start',
          maxBarThickness: 24,
        },
      ],
    };
  });

  protected readonly chartOptions = computed<ChartConfiguration<'bar'>['options']>(() => {
    const t = this.themes.theme();
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: t.reducedMotion ? false : { duration: 400 },
      scales: {
        x: { ticks: { color: t.muted }, grid: { display: false }, border: { color: t.axis } },
        y: {
          min: 0,
          ticks: { color: t.muted, callback: (v) => formatPesoCompact(Number(v)) },
          grid: { color: t.grid },
          border: { display: false },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (item) => formatPeso(Number(item.parsed.y)) } },
      },
    };
  });

  protected readonly chartLabel = computed(() => {
    const rows = this.history();
    if (!rows.length) return '';
    return (
      `Bar chart of revenue per month, ${formatMonth(rows[0].month)} to ${formatMonth(rows[rows.length - 1].month)}: ` +
      rows.map((h) => `${formatMonth(h.month)} ${formatPeso(h.revenue)}`).join(', ') +
      '.'
    );
  });

  ngOnInit(): void {
    this.store.load('retention');
    this.store.load('revenue');
    this.records.visitSummary().subscribe({ next: (s) => this.summary.set(s), error: () => this.summary.set(null) });
    // Only visits up to today: imported records can include later dates.
    this.records.listVisits({ to: this.today, page: 1, pageSize: RECENT }).subscribe({
      next: (page) => this.recent.set(page.items),
      error: (err: unknown) => this.recentError.set(readApiError(err, 'Recent visits could not be loaded.').message),
    });
  }

  protected serviceText(v: Visit): string {
    return v.services.map((s) => s.nature_of_visit).join(', ');
  }
}
