import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ChartConfiguration, ChartData } from 'chart.js';
import { BaseChartDirective, provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { AnalysisService } from '../../core/analysis.service';
import { ModelComparison, RevenueResult } from '../../core/api.models';
import { ChartTheme, ChartThemeService, SERIES_SHAPES } from '../../core/chart-theme';
import {
  formatChange,
  formatDate,
  formatDateTime,
  formatMonth,
  formatMonthLong,
  formatNumber,
  formatPercent,
  formatPeso,
  formatPesoCompact,
} from '../../core/format';
import { RunPanel } from '../../shared/run-panel/run-panel';

type LoadState = 'loading' | 'empty' | 'ready' | 'error';
type ModelKey = keyof ModelComparison;

const TYPE = 'revenue';
const MODEL_NAMES: Record<ModelKey, string> = {
  random_forest: 'Random Forest',
  last_month_baseline: 'Last-month baseline',
  average_baseline: 'Average baseline',
};
const MODEL_KEYS = Object.keys(MODEL_NAMES) as ModelKey[];

/** Shared axis styling for every chart on this page. */
function axis(t: ChartTheme, title: string, money = false) {
  return {
    title: { display: true, text: title, color: t.muted },
    ticks: {
      color: t.muted,
      ...(money ? { callback: (v: string | number) => formatPesoCompact(Number(v)) } : {}),
    },
    grid: { color: t.grid },
    border: { color: t.axis },
  };
}

@Component({
  selector: 'app-revenue',
  imports: [BaseChartDirective, RunPanel],
  providers: [provideCharts(withDefaultRegisterables())],
  templateUrl: './revenue.html',
  styleUrl: './revenue.css',
})
export class Revenue implements OnInit {
  private readonly api = inject(AnalysisService);
  private readonly themes = inject(ChartThemeService);

  protected readonly fmt = {
    peso: formatPeso,
    pesoCompact: formatPesoCompact,
    number: formatNumber,
    percent: formatPercent,
    change: formatChange,
    month: formatMonth,
    monthLong: formatMonthLong,
    date: formatDate,
    dateTime: formatDateTime,
  };
  protected readonly round = Math.round;
  protected readonly modelKeys = MODEL_KEYS;
  protected readonly modelNames = MODEL_NAMES;

  protected readonly loadState = signal<LoadState>('loading');
  protected readonly result = signal<RevenueResult | null>(null);

  // ------------------------------------------------------------ summary

  protected readonly nextMonth = computed(() => this.result()?.payload.forecast[0] ?? null);
  protected readonly lastMonth = computed(() => this.result()?.payload.history.at(-1) ?? null);
  protected readonly nextIsCurrent = computed(() => {
    const r = this.result();
    const next = this.nextMonth();
    return !!r && !!next && next.month.slice(0, 7) === r.payload.as_of.slice(0, 7);
  });
  protected readonly topService = computed(() => this.result()?.payload.services[0] ?? null);

  /** Which approach predicted the held-out months best, and what that means. */
  protected readonly verdict = computed(() => {
    const r = this.result();
    if (!r) return null;
    const totals = r.metrics.forecast.revenue.monthly_total;
    const best = MODEL_KEYS.reduce((a, b) => (totals[b].mae < totals[a].mae ? b : a));
    const rf = totals.random_forest.mae;
    if (best === 'random_forest') {
      return {
        best,
        text:
          `The Random Forest predicted the held-out months best, off by ${formatPeso(rf)} ` +
          'per month on average.',
      };
    }
    return {
      best,
      text:
        `The ${MODEL_NAMES[best].toLowerCase()} (off by ${formatPeso(totals[best].mae)} per ` +
        `month) predicted the held-out months better than the Random Forest ` +
        `(${formatPeso(rf)}). Monthly revenue has stayed within a steady range with no clear ` +
        'trend or seasonal pattern, so there is little for the model to learn beyond the ' +
        'average. Treat the forecast as a planning range, not an exact figure.',
    };
  });

  // ------------------------------------------------------------ revenue trend

  protected readonly trendRows = computed(() => {
    const r = this.result();
    if (!r) return [];
    return [
      ...r.payload.history.map((h) => ({ month: h.month, actual: h.revenue, forecast: null, low: null, high: null })),
      ...r.payload.forecast.map((f) => ({ month: f.month, actual: null, forecast: f.revenue, low: f.low, high: f.high })),
    ] as { month: string; actual: number | null; forecast: number | null; low: number | null; high: number | null }[];
  });

  protected readonly trendData = computed<ChartData<'line', (number | null)[]>>(() => {
    const t = this.themes.theme();
    const rows = this.trendRows();
    let lastActual = -1;
    rows.forEach((r, i) => {
      if (r.actual !== null) lastActual = i;
    });
    // The forecast line starts at the last actual month so the two connect.
    const forecast = rows.map((r, i) => (i === lastActual ? r.actual : r.forecast));
    return {
      labels: rows.map((r) => formatMonth(r.month)),
      datasets: [
        {
          label: 'Actual',
          data: rows.map((r) => r.actual),
          borderColor: t.series[0],
          backgroundColor: t.series[0],
          pointStyle: SERIES_SHAPES[0],
          pointRadius: 3,
          pointHoverRadius: 6,
          borderWidth: 2,
          spanGaps: false,
        },
        {
          label: 'Forecast',
          data: forecast,
          borderColor: t.series[1],
          backgroundColor: t.series[1],
          pointStyle: SERIES_SHAPES[1],
          pointRadius: 5,
          pointHoverRadius: 7,
          borderWidth: 2,
          borderDash: [6, 4],
        },
        {
          label: 'Likely range',
          data: rows.map((r) => r.high),
          borderColor: 'transparent',
          backgroundColor: `${t.series[1]}33`,
          pointRadius: 0,
          pointHitRadius: 0,
          fill: '+1',
        },
        {
          label: '',
          data: rows.map((r) => r.low),
          borderColor: 'transparent',
          pointRadius: 0,
          pointHitRadius: 0,
          fill: false,
        },
      ],
    };
  });

  protected readonly trendOptions = computed<ChartConfiguration<'line'>['options']>(() => {
    const t = this.themes.theme();
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: t.reducedMotion ? false : { duration: 400 },
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { ...axis(t, 'Month'), grid: { display: false } },
        y: { ...axis(t, 'Revenue', true), min: 0 },
      },
      plugins: {
        legend: {
          labels: {
            color: t.text,
            usePointStyle: true,
            padding: 16,
            filter: (item) => !!item.text,
          },
        },
        tooltip: {
          filter: (item) => !!item.dataset.label && item.parsed.y !== null,
          callbacks: {
            label: (item) => {
              if (item.dataset.label === 'Likely range') {
                const low = this.trendRows()[item.dataIndex]?.low ?? 0;
                return `Likely range: ${formatPeso(low)} to ${formatPeso(item.parsed.y ?? 0)}`;
              }
              return `${item.dataset.label}: ${formatPeso(item.parsed.y ?? 0)}`;
            },
          },
        },
      },
    };
  });

  protected readonly trendLabel = computed(() => {
    const r = this.result();
    if (!r) return '';
    const h = r.payload.history;
    const values = h.map((x) => x.revenue);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const fc = r.payload.forecast
      .map((f) => `${formatMonth(f.month)} ${formatPeso(f.revenue)} (likely ${formatPeso(f.low)} to ${formatPeso(f.high)})`)
      .join(', ');
    return (
      `Line chart of monthly revenue from ${formatMonth(h[0].month)} to ` +
      `${formatMonth(h[h.length - 1].month)}, between ${formatPeso(Math.min(...values))} and ` +
      `${formatPeso(Math.max(...values))}, average ${formatPeso(avg)}. Forecast: ${fc}.`
    );
  });

  // ------------------------------------------------------------ model check

  protected readonly checkData = computed<ChartData<'line'>>(() => {
    const t = this.themes.theme();
    const rows = this.result()?.payload.test_check ?? [];
    const series: [string, (r: (typeof rows)[number]) => number][] = [
      ['Actual', (r) => r.actual],
      ['Random Forest', (r) => r.random_forest],
      ['Last-month baseline', (r) => r.last_month],
    ];
    return {
      labels: rows.map((r) => formatMonth(r.month)),
      datasets: series.map(([label, get], i) => ({
        label,
        data: rows.map(get),
        borderColor: t.series[i],
        backgroundColor: t.series[i],
        pointStyle: SERIES_SHAPES[i],
        pointRadius: 5,
        pointHoverRadius: 7,
        borderWidth: 2,
        borderDash: i === 0 ? [] : [6, 4],
      })),
    };
  });

  protected readonly checkOptions = computed<ChartConfiguration<'line'>['options']>(() => {
    const t = this.themes.theme();
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: t.reducedMotion ? false : { duration: 400 },
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { ...axis(t, 'Held-out month'), grid: { display: false } },
        y: { ...axis(t, 'Revenue', true), min: 0 },
      },
      plugins: {
        legend: { labels: { color: t.text, usePointStyle: true, padding: 16 } },
        tooltip: {
          callbacks: { label: (item) => `${item.dataset.label}: ${formatPeso(item.parsed.y ?? 0)}` },
        },
      },
    };
  });

  protected readonly checkLabel = computed(() => {
    const rows = this.result()?.payload.test_check ?? [];
    const parts = rows.map(
      (r) =>
        `${formatMonth(r.month)}: actual ${formatPeso(r.actual)}, Random Forest ` +
        `${formatPeso(r.random_forest)}, last-month baseline ${formatPeso(r.last_month)}`,
    );
    return `Line chart comparing actual revenue with predictions on held-out months. ${parts.join('. ')}.`;
  });

  // ------------------------------------------------------------ services

  protected readonly servicesData = computed<ChartData<'bar'>>(() => {
    const t = this.themes.theme();
    const rows = this.result()?.payload.services ?? [];
    return {
      labels: rows.map((s) => s.service),
      datasets: [
        {
          label: 'Forecast revenue',
          data: rows.map((s) => s.forecast_revenue),
          backgroundColor: t.series[0],
          borderRadius: 4,
          borderSkipped: 'start',
          maxBarThickness: 24,
        },
      ],
    };
  });

  protected readonly servicesOptions = computed<ChartConfiguration<'bar'>['options']>(() => {
    const t = this.themes.theme();
    return {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: t.reducedMotion ? false : { duration: 400 },
      scales: {
        x: { ...axis(t, 'Forecast revenue', true), min: 0 },
        y: { ticks: { color: t.text }, grid: { display: false }, border: { color: t.axis } },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (item) => {
              const s = this.result()?.payload.services[item.dataIndex];
              return s
                ? `${formatPeso(s.forecast_revenue)} from about ${s.forecast_cases} cases`
                : formatPeso(Number(item.parsed.x));
            },
          },
        },
      },
    };
  });

  protected readonly servicesLabel = computed(() => {
    const r = this.result();
    const next = this.nextMonth();
    if (!r || !next) return '';
    const parts = r.payload.services.map((s) => `${s.service} ${formatPeso(s.forecast_revenue)}`);
    return `Bar chart of forecast revenue by service for ${formatMonthLong(next.month)}. ${parts.join(', ')}.`;
  });

  // ------------------------------------------------------------ feature importance

  protected readonly importanceData = computed<ChartData<'bar'>>(() => {
    const t = this.themes.theme();
    const rows = this.result()?.payload.feature_importance ?? [];
    return {
      labels: rows.map((f) => f.feature),
      datasets: [
        {
          label: 'Importance',
          data: rows.map((f) => f.importance),
          backgroundColor: t.accent,
          borderRadius: 4,
          borderSkipped: 'start',
          maxBarThickness: 24,
        },
      ],
    };
  });

  protected readonly importanceOptions = computed<ChartConfiguration<'bar'>['options']>(() => {
    const t = this.themes.theme();
    return {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: t.reducedMotion ? false : { duration: 400 },
      scales: {
        x: {
          ...axis(t, 'Share of the model’s decisions'),
          min: 0,
          ticks: { color: t.muted, callback: (v) => formatPercent(Number(v)) },
        },
        y: { ticks: { color: t.text }, grid: { display: false }, border: { color: t.axis } },
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (item) => formatPercent(Number(item.parsed.x)) } },
      },
    };
  });

  protected readonly importanceLabel = computed(() => {
    const rows = this.result()?.payload.feature_importance ?? [];
    const parts = rows.map((f) => `${f.feature} ${formatPercent(f.importance)}`);
    return `Bar chart of feature importance in the revenue model. ${parts.join(', ')}.`;
  });

  ngOnInit(): void {
    this.loadLatest();
  }

  protected loadLatest(): void {
    this.api.latest<RevenueResult>(TYPE).subscribe({
      next: (r) => {
        this.result.set(r);
        this.loadState.set('ready');
      },
      error: (err: unknown) => {
        if (err instanceof HttpErrorResponse && err.status === 404) this.loadState.set('empty');
        else if (!(err instanceof HttpErrorResponse && err.status === 401)) {
          this.loadState.set('error');
        }
      },
    });
  }
}
