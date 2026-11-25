import { Component, computed, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChartConfiguration, ChartData } from 'chart.js';
import { BaseChartDirective, provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { ChartThemeService } from '../../core/chart-theme';
import {
  formatDateTime,
  formatMonth,
  formatMonthLong,
  formatNumber,
  formatPercent,
  formatPeso,
  formatPesoCompact,
} from '../../core/format';
import { ResultsStore } from '../../core/results.store';
import { RunPanel } from '../../shared/run-panel/run-panel';
import { ToothStrip } from '../../shared/tooth-strip';

const HISTORY_MONTHS = 12;
const TOP_SERVICES = 5;
const TOP_PAIRS = 3;
/** Only pairings clearly above chance are shown to the owner. */
const MIN_LIFT = 1.2;

/** Rounds to a friendly figure for headlines: 154,964 -> 155,000. */
const roundPeso = (n: number): string => formatPeso(Math.round(n / 1000) * 1000);

/** Owner view of the revenue analysis: what to expect and what to prepare for. */
@Component({
  selector: 'app-revenue',
  imports: [BaseChartDirective, RunPanel, RouterLink, ToothStrip],
  providers: [provideCharts(withDefaultRegisterables())],
  templateUrl: './revenue.html',
  styleUrl: './revenue.css',
})
export class Revenue implements OnInit {
  private readonly store = inject(ResultsStore);
  private readonly themes = inject(ChartThemeService);

  protected readonly state = this.store.revenue;
  protected readonly result = computed(() => this.state().data);
  protected readonly fmt = {
    peso: formatPeso,
    roundPeso,
    number: formatNumber,
    percent: formatPercent,
    month: formatMonth,
    monthLong: formatMonthLong,
    dateTime: formatDateTime,
  };

  protected readonly round = Math.round;
  protected readonly next = computed(() => this.result()?.payload.forecast[0] ?? null);
  protected readonly later = computed(() => this.result()?.payload.forecast.slice(1) ?? []);
  protected readonly last = computed(() => this.result()?.payload.history.at(-1) ?? null);
  protected readonly nextIsCurrent = computed(() => {
    const r = this.result();
    const n = this.next();
    return !!r && !!n && n.month.slice(0, 7) === r.payload.as_of.slice(0, 7);
  });
  protected readonly topServices = computed(() => (this.result()?.payload.services ?? []).slice(0, TOP_SERVICES));

  /** Strongest one-to-one pairings, each pair shown once, written as advice. */
  protected readonly pairs = computed(() => {
    const seen = new Set<string>();
    const out: { a: string; b: string; share: number }[] = [];
    for (const rule of this.result()?.payload.rules ?? []) {
      if (rule.if.length !== 1 || rule.then.length !== 1 || rule.lift < MIN_LIFT) continue;
      const key = [rule.if[0], rule.then[0]].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ a: rule.if[0], b: rule.then[0], share: rule.confidence });
      if (out.length === TOP_PAIRS) break;
    }
    return out;
  });

  // ------------------------------------------------------------ chart: last 12 months + forecast

  protected readonly rows = computed(() => {
    const r = this.result();
    if (!r) return [];
    return [
      ...r.payload.history.slice(-HISTORY_MONTHS).map((h) => ({
        month: h.month,
        actual: h.revenue as number | null,
        forecast: null as number | null,
        low: null as number | null,
        high: null as number | null,
      })),
      ...r.payload.forecast.map((f) => ({ month: f.month, actual: null, forecast: f.revenue, low: f.low, high: f.high })),
    ];
  });

  protected readonly chartData = computed<ChartData<'line', (number | null)[]>>(() => {
    const t = this.themes.theme();
    const rows = this.rows();
    let lastActual = -1;
    rows.forEach((r, i) => {
      if (r.actual !== null) lastActual = i;
    });
    return {
      labels: rows.map((r) => formatMonth(r.month)),
      datasets: [
        // Filled marks: recorded revenue.
        {
          label: 'Recorded',
          data: rows.map((r) => r.actual),
          borderColor: t.accent,
          backgroundColor: t.accent,
          pointStyle: 'circle',
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 2,
        },
        // Outlined marks on a dashed line: expected revenue, joined to the last recorded month.
        {
          label: 'Expected',
          data: rows.map((r, i) => (i === lastActual ? r.actual : r.forecast)),
          borderColor: t.accent,
          backgroundColor: t.surface,
          pointBackgroundColor: t.surface,
          pointBorderColor: t.accent,
          pointBorderWidth: 2,
          pointStyle: 'circle',
          pointRadius: rows.map((_, i) => (i === lastActual ? 0 : 5)),
          pointHoverRadius: 7,
          borderWidth: 2,
          borderDash: [6, 4],
        },
        {
          label: 'Likely range',
          data: rows.map((r) => r.high),
          borderColor: 'transparent',
          backgroundColor: `${t.accent}2e`,
          pointRadius: 0,
          pointHitRadius: 0,
          fill: '+1',
        },
        { label: '', data: rows.map((r) => r.low), borderColor: 'transparent', pointRadius: 0, pointHitRadius: 0, fill: false },
      ],
    };
  });

  protected readonly chartOptions = computed<ChartConfiguration<'line'>['options']>(() => {
    const t = this.themes.theme();
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: t.reducedMotion ? false : { duration: 400 },
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          ticks: { color: t.muted, maxRotation: 0, autoSkip: true, autoSkipPadding: 12 },
          grid: { display: false },
          border: { color: t.axis },
        },
        y: {
          min: 0,
          ticks: { color: t.muted, callback: (v) => formatPesoCompact(Number(v)) },
          grid: { color: t.grid },
          border: { display: false },
        },
      },
      plugins: {
        // The legend is printed above the chart with the charting marks.
        legend: { display: false },
        tooltip: {
          filter: (item) => !!item.dataset.label && item.parsed.y !== null,
          callbacks: {
            label: (item) => {
              if (item.dataset.label === 'Likely range') {
                const low = this.rows()[item.dataIndex]?.low ?? 0;
                return `Likely range: ${formatPeso(low)} to ${formatPeso(item.parsed.y ?? 0)}`;
              }
              return `${item.dataset.label}: ${formatPeso(item.parsed.y ?? 0)}`;
            },
          },
        },
      },
    };
  });

  protected readonly chartLabel = computed(() => {
    const rows = this.rows();
    const actual = rows.filter((r) => r.actual !== null);
    const expected = rows.filter((r) => r.forecast !== null);
    if (!actual.length) return '';
    return (
      `Line chart of monthly revenue. Recorded, ${formatMonth(actual[0].month)} to ` +
      `${formatMonth(actual[actual.length - 1].month)}: ` +
      actual.map((r) => `${formatMonth(r.month)} ${formatPeso(r.actual!)}`).join(', ') +
      '. Expected: ' +
      expected.map((r) => `${formatMonth(r.month)} ${formatPeso(r.forecast!)} (likely ${formatPeso(r.low!)} to ${formatPeso(r.high!)})`).join(', ') +
      '.'
    );
  });

  ngOnInit(): void {
    this.store.load('revenue');
  }
}
