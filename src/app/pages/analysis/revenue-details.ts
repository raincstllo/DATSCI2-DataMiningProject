import { Component, computed, inject } from '@angular/core';
import { ChartConfiguration, ChartData } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { ModelComparison } from '../../core/api.models';
import { ChartTheme, ChartThemeService, SERIES_SHAPES } from '../../core/chart-theme';
import {
  formatChange,
  formatDateTime,
  formatMonth,
  formatMonthLong,
  formatNumber,
  formatPercent,
  formatPeso,
  formatPesoCompact,
} from '../../core/format';
import { ResultsStore } from '../../core/results.store';

type ModelKey = keyof ModelComparison;

const MODEL_NAMES: Record<ModelKey, string> = {
  random_forest: 'Random Forest',
  last_month_baseline: 'Last-month baseline',
  average_baseline: 'Average baseline',
};
const MODEL_KEYS = Object.keys(MODEL_NAMES) as ModelKey[];

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

/** Technical view of the revenue analysis: accuracy vs baselines, features, rules. */
@Component({
  selector: 'app-revenue-details',
  imports: [BaseChartDirective],
  templateUrl: './revenue-details.html',
  styleUrl: './analysis.css',
})
export class RevenueDetails {
  private readonly themes = inject(ChartThemeService);
  protected readonly state = inject(ResultsStore).revenue;
  protected readonly result = computed(() => this.state().data);
  protected readonly modelKeys = MODEL_KEYS;
  protected readonly modelNames = MODEL_NAMES;
  protected readonly fmt = {
    peso: formatPeso,
    number: formatNumber,
    percent: formatPercent,
    change: formatChange,
    month: formatMonth,
    monthLong: formatMonthLong,
    dateTime: formatDateTime,
  };

  protected readonly nextMonth = computed(() => this.result()?.payload.forecast[0] ?? null);

  protected readonly verdict = computed(() => {
    const r = this.result();
    if (!r) return null;
    const totals = r.metrics.forecast.revenue.monthly_total;
    const best = MODEL_KEYS.reduce((a, b) => (totals[b].mae < totals[a].mae ? b : a));
    const rf = totals.random_forest.mae;
    if (best === 'random_forest') {
      return { best, text: `The Random Forest predicted the held-out months best, off by ${formatPeso(rf)} per month on average.` };
    }
    return {
      best,
      text:
        `The ${MODEL_NAMES[best].toLowerCase()} (off by ${formatPeso(totals[best].mae)} per month) ` +
        `predicted the held-out months better than the Random Forest (${formatPeso(rf)}). Monthly revenue ` +
        'has stayed within a steady range with no clear trend or seasonal pattern, so there is little for ' +
        'the model to learn beyond the average. The owner pages present the forecast as a planning range.',
    };
  });

  // ------------------------------------------------------------ held-out check

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
      layout: { padding: { right: 12 } },
      scales: {
        x: { ...axis(t, 'Held-out month'), grid: { display: false } },
        y: { ...axis(t, 'Revenue', true), min: 0 },
      },
      plugins: {
        legend: { labels: { color: t.text, usePointStyle: true, padding: 16 } },
        tooltip: { callbacks: { label: (item) => `${item.dataset.label}: ${formatPeso(item.parsed.y ?? 0)}` } },
      },
    };
  });

  protected readonly checkLabel = computed(() => {
    const rows = this.result()?.payload.test_check ?? [];
    const parts = rows.map(
      (r) =>
        `${formatMonth(r.month)}: actual ${formatPeso(r.actual)}, Random Forest ${formatPeso(r.random_forest)}, ` +
        `last-month baseline ${formatPeso(r.last_month)}`,
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
          backgroundColor: t.accent,
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
      layout: { padding: { right: 20 } },
      scales: {
        x: { ...axis(t, 'Forecast revenue', true), min: 0 },
        y: {
          ticks: {
            color: t.text,
            // On phone-width charts, break long service names onto two lines.
            callback(value) {
              const name = this.getLabelForValue(Number(value));
              if (this.chart.width >= 420 || name.length <= 16) return name;
              const cut = name.lastIndexOf(' ', 16);
              return cut > 0 ? [name.slice(0, cut), name.slice(cut + 1)] : name;
            },
          },
          grid: { display: false },
          border: { color: t.axis },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (item) => {
              const s = this.result()?.payload.services[item.dataIndex];
              return s ? `${formatPeso(s.forecast_revenue)} from about ${s.forecast_cases} cases` : '';
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
    const parts = (this.result()?.payload.feature_importance ?? []).map((f) => `${f.feature} ${formatPercent(f.importance)}`);
    return `Bar chart of feature importance in the revenue model. ${parts.join(', ')}.`;
  });
}
