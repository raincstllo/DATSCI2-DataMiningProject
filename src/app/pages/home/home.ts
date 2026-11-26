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
import { ToothStrip } from '../../shared/tooth-strip';

const RECENT = 10;

interface MonthRow {
  month: string;
  revenue: number;
  cases: number;
  /** Expected total for the current month; null for other months. */
  expected: number | null;
  /** True when the month is still in progress. */
  partial: boolean;
}
const roundPeso = (n: number): string => formatPeso(Math.round(n / 1000) * 1000);

/** Owner's home page: today's picture at a glance plus the latest visits. */
@Component({
  selector: 'app-home',
  imports: [RouterLink, BaseChartDirective, ToothStrip],
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

  /**
   * The last 12 months for the chart. When the stored history stops before this month and the
   * forecast covers this month, this month joins as a partial row: revenue so far plus the
   * expected total.
   */
  protected readonly history = computed<MonthRow[]>(() => {
    const past = this.revenue().data?.payload.history ?? [];
    const f = this.thisMonthForecast();
    const s = this.summary();
    if (f && s && past.length && !past.some((h) => this.isCurrent(h.month))) {
      const current: MonthRow = { month: f.month, revenue: s.revenue, cases: s.services, expected: f.revenue, partial: true };
      return [...past.slice(-11).map((h) => ({ ...h, expected: null, partial: false })), current];
    }
    return past.slice(-12).map((h) => ({
      ...h,
      expected: f && this.isCurrent(h.month) ? f.revenue : null,
      partial: false,
    }));
  });

  /** This month's expected total, when the chart includes the current month. */
  protected readonly currentExpected = computed(() => this.history().find((h) => h.expected !== null)?.expected ?? null);

  protected readonly chartData = computed<ChartData<'bar'>>(() => {
    const t = this.themes.theme();
    const rows = this.history();
    const expected = this.currentExpected();
    return {
      // Short month names; the year shows on the first bar, each January and the current month.
      labels: rows.map((h, i) => {
        const [y, m] = h.month.split('-');
        const short = new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-PH', { month: 'short' });
        return i === 0 || m === '01' || i === rows.length - 1 ? [short, y] : short;
      }),
      datasets: [
        // Outlined mark: this month's expected total, drawn around the recorded bar.
        ...(expected === null
          ? []
          : [
              {
                label: 'Expected',
                data: rows.map((h) => h.expected),
                backgroundColor: 'transparent',
                borderColor: t.accent,
                borderWidth: 2,
                borderSkipped: 'start' as const,
                grouped: false,
                order: 0,
                maxBarThickness: 28,
              },
            ]),
        // Filled mark: recorded revenue.
        {
          label: 'Recorded',
          data: rows.map((h) => h.revenue),
          backgroundColor: t.accent,
          borderSkipped: 'start' as const,
          grouped: false,
          order: 1,
          maxBarThickness: 28,
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
        x: {
          ticks: {
            color: t.muted,
            maxRotation: 0,
            autoSkip: false,
            // On narrow charts, label every 2nd or 3rd month counting back from the current one.
            callback(value, index, ticks) {
              const w = this.chart.width;
              const step = w < 300 ? 3 : w < 420 ? 2 : 1;
              return (ticks.length - 1 - index) % step === 0 ? this.getLabelForValue(Number(value)) : '';
            },
          },
          grid: { display: false },
          border: { color: t.axis },
        },
        y: {
          min: 0,
          ticks: { color: t.muted, maxTicksLimit: 6, callback: (v) => formatPesoCompact(Number(v)) },
          grid: { color: t.grid },
          border: { display: false },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          filter: (item) => item.raw !== null,
          callbacks: { label: (item) => `${item.dataset.label}: ${formatPeso(Number(item.parsed.y))}` },
        },
      },
    };
  });

  protected readonly chartLabel = computed(() => {
    const rows = this.history();
    if (!rows.length) return '';
    return (
      `Bar chart of revenue per month, ${formatMonth(rows[0].month)} to ${formatMonth(rows[rows.length - 1].month)}: ` +
      rows.map((h) => `${formatMonth(h.month)} ${formatPeso(h.revenue)}${h.partial ? ' so far' : ''}`).join(', ') +
      '.' +
      (this.currentExpected() === null
        ? ''
        : ` Expected for this month: about ${roundPeso(this.currentExpected()!)}.`)
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

  /** Visit date without the year when it falls in the current year, so the totals fit on phones. */
  protected visitDate(iso: string): string {
    const full = formatDate(iso);
    return iso.slice(0, 4) === this.today.slice(0, 4) ? full.replace(/,? \d{4}$/, '') : full;
  }

  protected isCurrent(month: string): boolean {
    return month.slice(0, 7) === this.today.slice(0, 7);
  }

  protected serviceText(v: Visit): string {
    return v.services.map((s) => s.nature_of_visit).join(', ');
  }
}
