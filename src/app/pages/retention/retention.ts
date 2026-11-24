import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { ChartConfiguration, ChartData, TooltipItem } from 'chart.js';
import { BaseChartDirective, provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { AnalysisService } from '../../core/analysis.service';
import {
  AnalysisJob,
  JobStep,
  RetentionPatient,
  RetentionResult,
  SegmentName,
} from '../../core/api.models';
import { ChartThemeService, SEGMENT_SHAPE_NAMES, SEGMENT_SHAPES } from '../../core/chart-theme';
import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatPeso,
  formatPesoCompact,
} from '../../core/format';

type LoadState = 'loading' | 'empty' | 'ready' | 'error';
type SortKey = 'recency' | 'spend' | 'name';

const TYPE = 'retention';
const POLL_MS = 1000;
const PAGE_SIZE = 25;
const SEGMENTS: SegmentName[] = ['Frequent', 'Infrequent', 'Inactive'];

const num = (v: unknown): string => (typeof v === 'number' ? formatNumber(v) : String(v ?? ''));

const STEP_TEXT: Record<string, (s: JobStep) => string> = {
  start: () => 'Pipeline started',
  extract: (s) => `Loaded ${num(s['rows'])} visit rows from MongoDB`,
  drop_exact_duplicates: (s) => `Removed ${num(s['dropped'])} exact duplicate rows`,
  drop_future_dates: (s) =>
    `Removed ${num(s['dropped'])} rows dated after ${formatDate(String(s['cutoff']))}`,
  clean: (s) =>
    `Clean data ready: ${num(s['rows'])} rows, ${num(s['visits'])} visits, ` +
    `${num(s['patients'])} patients`,
  features: (s) =>
    `Built features for ${num(s['patients'])} patients: days since last visit, ` +
    'number of visits, total spend',
  k_scan: () => 'Compared 2 to 6 segments by silhouette score',
  kmeans: (s) =>
    `Grouped patients into ${num(s['k'])} segments with K-Means ` +
    `(silhouette score ${Number(s['silhouette']).toFixed(3)})`,
  saved: () => 'Saved results to MongoDB',
  done: () => 'Analysis complete',
  error: (s) => `Failed: ${String(s['message'] ?? 'unknown error')}`,
};

@Component({
  selector: 'app-retention',
  imports: [BaseChartDirective],
  // Registered here so Chart.js is only downloaded with this page.
  providers: [provideCharts(withDefaultRegisterables())],
  templateUrl: './retention.html',
  styleUrl: './retention.css',
})
export class Retention implements OnInit {
  private readonly api = inject(AnalysisService);
  private readonly themes = inject(ChartThemeService);
  private pollTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly segments = SEGMENTS;
  protected readonly shapeNames = SEGMENT_SHAPE_NAMES;
  protected readonly fmt = {
    peso: formatPeso,
    number: formatNumber,
    percent: formatPercent,
    date: formatDate,
    dateTime: formatDateTime,
  };

  protected readonly loadState = signal<LoadState>('loading');
  protected readonly result = signal<RetentionResult | null>(null);
  protected readonly job = signal<AnalysisJob | null>(null);
  protected readonly runError = signal<string | null>(null);

  protected readonly running = computed(() => this.job()?.status === 'running');
  protected readonly steps = computed(() =>
    (this.job()?.steps ?? []).map((s) => ({
      key: `${s.step}-${s.at}`,
      text: (STEP_TEXT[s.step] ?? (() => s.step))(s),
      error: s.step === 'error',
    })),
  );
  protected readonly liveStatus = computed(() => {
    const job = this.job();
    if (!job) return '';
    if (job.status === 'succeeded') return 'Analysis complete. Results updated.';
    if (job.status === 'failed') return `Analysis failed. ${job.error ?? ''}`;
    if (this.finishing()) return 'Analysis complete. Closing Spark and loading results.';
    const last = this.steps().at(-1);
    return last ? `Running: ${last.text}` : 'Running: starting pipeline';
  });
  /** The pipeline reported "done" but the process is still shutting Spark down. */
  protected readonly finishing = computed(
    () => this.running() && this.job()?.steps.at(-1)?.step === 'done',
  );

  // Follow-up list
  protected readonly segmentFilter = signal<'all' | SegmentName>('all');
  protected readonly search = signal('');
  protected readonly sort = signal<SortKey>('recency');
  protected readonly page = signal(0);

  protected readonly filtered = computed(() => {
    const patients = this.result()?.payload.patients ?? [];
    const seg = this.segmentFilter();
    const q = this.search().trim().toLowerCase();
    const rows = patients.filter(
      (p) => (seg === 'all' || p.segment === seg) && (!q || p.name.toLowerCase().includes(q)),
    );
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

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.pollTimer));
  }

  ngOnInit(): void {
    this.loadLatest();
  }

  protected run(): void {
    this.runError.set(null);
    this.api.run(TYPE).subscribe({
      next: (job) => this.track(job),
      error: (err: unknown) => {
        // Another run is already going: follow that one instead.
        if (err instanceof HttpErrorResponse && err.status === 409 && err.error?.job) {
          this.track(err.error.job as AnalysisJob);
        } else if (!(err instanceof HttpErrorResponse && err.status === 401)) {
          this.runError.set('The analysis could not be started. Check that the backend is running.');
        }
      },
    });
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

  protected segmentOf(name: SegmentName) {
    return this.result()?.payload.segments.find((s) => s.segment === name) ?? null;
  }

  private track(job: AnalysisJob): void {
    this.job.set(job);
    clearTimeout(this.pollTimer);
    if (job.status === 'running') {
      this.pollTimer = setTimeout(() => this.poll(job.id), POLL_MS);
    } else if (job.status === 'succeeded') {
      this.loadLatest();
    }
  }

  private poll(id: string): void {
    this.api.job(id).subscribe({
      next: (job) => this.track(job),
      error: (err: unknown) => {
        if (err instanceof HttpErrorResponse && err.status === 401) return;
        this.runError.set('Lost track of the running analysis. Reload the page to check results.');
      },
    });
  }

  private loadLatest(): void {
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
