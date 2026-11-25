import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ChartConfiguration, ChartData, TooltipItem } from 'chart.js';
import { BaseChartDirective, provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { AnalysisService } from '../../core/analysis.service';
import { RetentionPatient, RetentionResult, SegmentName } from '../../core/api.models';
import { ChartThemeService, SEGMENT_SHAPE_NAMES, SEGMENT_SHAPES } from '../../core/chart-theme';
import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatPeso,
  formatPesoCompact,
  formatPhone,
} from '../../core/format';
import { RunPanel } from '../../shared/run-panel/run-panel';

type LoadState = 'loading' | 'empty' | 'ready' | 'error';
type SortKey = 'recency' | 'spend' | 'name';

const TYPE = 'retention';
const PAGE_SIZE = 25;
const SEGMENTS: SegmentName[] = ['Frequent', 'Infrequent', 'Inactive'];

@Component({
  selector: 'app-retention',
  imports: [BaseChartDirective, RunPanel],
  // Registered here so Chart.js is only downloaded with this page.
  providers: [provideCharts(withDefaultRegisterables())],
  templateUrl: './retention.html',
  styleUrl: './retention.css',
})
export class Retention implements OnInit {
  private readonly api = inject(AnalysisService);
  private readonly themes = inject(ChartThemeService);

  protected readonly segments = SEGMENTS;
  protected readonly shapeNames = SEGMENT_SHAPE_NAMES;
  protected readonly fmt = {
    peso: formatPeso,
    phone: formatPhone,
    number: formatNumber,
    percent: formatPercent,
    date: formatDate,
    dateTime: formatDateTime,
  };

  protected readonly loadState = signal<LoadState>('loading');
  protected readonly result = signal<RetentionResult | null>(null);

  // Follow-up list
  protected readonly segmentFilter = signal<'all' | SegmentName>('all');
  protected readonly search = signal('');
  protected readonly sort = signal<SortKey>('recency');
  protected readonly page = signal(0);

  protected readonly filtered = computed(() => {
    const patients = this.result()?.payload.patients ?? [];
    const seg = this.segmentFilter();
    const q = this.search().trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    const matches = (p: RetentionPatient) =>
      !q ||
      p.name.toLowerCase().includes(q) ||
      (p.patient_id ?? '').toLowerCase().includes(q) ||
      (digits.length >= 3 && (p.contact_number ?? '').includes(digits));
    const rows = patients.filter((p) => (seg === 'all' || p.segment === seg) && matches(p));
    const by: Record<SortKey, (a: RetentionPatient, b: RetentionPatient) => number> = {
      recency: (a, b) => b.recency_days - a.recency_days,
      spend: (a, b) => b.total_fee - a.total_fee,
      name: (a, b) => a.name.localeCompare(b.name),
    };
    return [...rows].sort(by[this.sort()]);
  });
  protected readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.filtered().length / PAGE_SIZE)),
  );
  protected readonly pageRows = computed(() =>
    this.filtered().slice(this.page() * PAGE_SIZE, (this.page() + 1) * PAGE_SIZE),
  );
  protected readonly rangeText = computed(() => {
    const total = this.filtered().length;
    if (!total) return 'No patients match';
    const from = this.page() * PAGE_SIZE + 1;
    const to = Math.min(total, from + PAGE_SIZE - 1);
    return `Showing ${formatNumber(from)}–${formatNumber(to)} of ${formatNumber(total)} patients`;
  });

  // Evaluation
  protected readonly silhouetteRows = computed(() => {
    const r = this.result();
    if (!r) return [];
    return Object.entries(r.metrics.silhouette_by_k)
      .map(([k, score]) => ({ k: Number(k), score, used: Number(k) === r.metrics.k }))
      .sort((a, b) => a.k - b.k);
  });

  // Charts
  protected readonly scatterData = computed<ChartData<'scatter'>>(() => {
    const t = this.themes.theme();
    const patients = this.result()?.payload.patients ?? [];
    return {
      datasets: SEGMENTS.map((seg) => ({
        label: `${seg} (${SEGMENT_SHAPE_NAMES[seg]})`,
        data: patients
          .filter((p) => p.segment === seg)
          .map((p) => ({ x: p.recency_days, y: p.total_fee })),
        pointStyle: SEGMENT_SHAPES[seg],
        backgroundColor: t.segments[seg],
        borderColor: t.surface,
        borderWidth: 1.5,
        pointRadius: 5,
        pointHoverRadius: 7,
        pointHitRadius: 8,
      })),
    };
  });

  protected readonly scatterOptions = computed<ChartConfiguration<'scatter'>['options']>(() => {
    const t = this.themes.theme();
    const axis = (title: string) => ({
      title: { display: true, text: title, color: t.muted },
      ticks: { color: t.muted },
      grid: { color: t.grid },
      border: { color: t.axis },
    });
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: t.reducedMotion ? false : { duration: 400 },
      scales: {
        x: { ...axis('Days since last visit'), min: 0 },
        y: {
          ...axis('Total spend (log scale)'),
          type: 'logarithmic',
          // Start below the lowest fee so the cheapest visits don't sit on the axis line.
          min: 200,
          ticks: {
            color: t.muted,
            callback: (value) => {
              const v = Number(value);
              const lead = v / 10 ** Math.floor(Math.log10(v));
              return [1, 2, 5].includes(Math.round(lead)) ? formatPesoCompact(v) : '';
            },
          },
        },
      },
      plugins: {
        legend: {
          position: 'top',
          labels: { color: t.text, usePointStyle: true, padding: 16 },
        },
        tooltip: {
          callbacks: {
            label: (item: TooltipItem<'scatter'>) => {
              const seg = SEGMENTS[item.datasetIndex];
              return `${seg}: ${formatNumber(item.parsed.x ?? 0)} days since last visit, ` +
                `${formatPeso(item.parsed.y ?? 0)} total spend`;
            },
          },
        },
      },
    };
  });

  protected readonly scatterLabel = computed(() => {
    const r = this.result();
    if (!r) return '';
    const parts = r.payload.segments.map(
      (s) =>
        `${s.segment}, shown as ${SEGMENT_SHAPE_NAMES[s.segment]}s: ${formatNumber(s.patients)} ` +
        `patients, average ${formatNumber(Math.round(s.avg_recency_days))} days since last ` +
        `visit, average spend ${formatPeso(s.avg_total_fee)}`,
    );
    return (
      `Scatter chart of ${formatNumber(r.payload.patients.length)} patients, days since last ` +
      `visit against total spend, by segment. ${parts.join('. ')}.`
    );
  });

  protected readonly silhouetteData = computed<ChartData<'bar'>>(() => {
    const t = this.themes.theme();
    const rows = this.silhouetteRows();
    return {
      labels: rows.map((r) => (r.used ? `${r.k} (used)` : String(r.k))),
      datasets: [
        {
          label: 'Silhouette score',
          data: rows.map((r) => r.score),
          backgroundColor: t.accent,
          borderRadius: { topLeft: 4, topRight: 4 },
          borderSkipped: 'start',
          maxBarThickness: 24,
        },
      ],
    };
  });

  protected readonly silhouetteOptions = computed<ChartConfiguration<'bar'>['options']>(() => {
    const t = this.themes.theme();
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: t.reducedMotion ? false : { duration: 400 },
      scales: {
        x: {
          title: { display: true, text: 'Number of segments (k)', color: t.muted },
          ticks: { color: t.muted },
          grid: { display: false },
          border: { color: t.axis },
        },
        y: {
          title: { display: true, text: 'Silhouette score', color: t.muted },
          ticks: { color: t.muted },
          grid: { color: t.grid },
          border: { display: false },
          min: 0,
          suggestedMax: 0.5,
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (item) => `Silhouette score ${Number(item.parsed.y).toFixed(3)}` },
        },
      },
    };
  });

  protected readonly silhouetteLabel = computed(() => {
    const rows = this.silhouetteRows();
    const values = rows.map((r) => `k=${r.k}: ${r.score.toFixed(3)}${r.used ? ' (used)' : ''}`);
    return `Bar chart of silhouette score by number of segments. ${values.join(', ')}.`;
  });

  ngOnInit(): void {
    this.loadLatest();
  }

  protected setSegment(value: string): void {
    this.segmentFilter.set(value === 'all' ? 'all' : (value as SegmentName));
    this.page.set(0);
  }

  protected setSearch(value: string): void {
    this.search.set(value);
    this.page.set(0);
  }

  protected setSort(value: string): void {
    this.sort.set(value as SortKey);
    this.page.set(0);
  }

  protected goTo(page: number): void {
    this.page.set(Math.min(Math.max(page, 0), this.pageCount() - 1));
  }

  protected loadLatest(): void {
    this.api.latest<RetentionResult>(TYPE).subscribe({
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
