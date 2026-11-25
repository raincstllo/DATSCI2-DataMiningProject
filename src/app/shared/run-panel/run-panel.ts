import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, DestroyRef, inject, input, output, signal } from '@angular/core';
import { AnalysisService } from '../../core/analysis.service';
import { AnalysisJob, JobStep } from '../../core/api.models';
import { ResultsStore } from '../../core/results.store';
import { formatDate, formatMonth, formatNumber, formatPeso } from '../../core/format';

const POLL_MS = 1000;

const num = (v: unknown): string => (typeof v === 'number' ? formatNumber(v) : String(v ?? ''));
const peso = (v: unknown): string => (typeof v === 'number' ? formatPeso(v) : String(v ?? ''));

/** Plain-language text for each pipeline step reported by analysis/run.py. */
const STEP_TEXT: Record<string, (s: JobStep) => string> = {
  start: () => 'Pipeline started',
  extract: (s) => `Loaded ${num(s['rows'])} visit rows from MongoDB`,
  drop_exact_duplicates: (s) => `Removed ${num(s['dropped'])} exact duplicate rows`,
  drop_future_dates: (s) =>
    `Removed ${num(s['dropped'])} rows dated after ${formatDate(String(s['cutoff']))}`,
  clean: (s) =>
    `Clean data ready: ${num(s['rows'])} rows, ${num(s['visits'])} visits, ` +
    `${num(s['patients'])} patients`,
  // Retention
  features: (s) =>
    `Built features for ${num(s['patients'])} patients: days since last visit, ` +
    'number of visits, total spend',
  k_scan: () => 'Compared 2 to 6 segments by silhouette score',
  kmeans: (s) =>
    `Grouped patients into ${num(s['k'])} segments with K-Means ` +
    `(silhouette score ${Number(s['silhouette']).toFixed(3)})`,
  // Revenue
  monthly_series: (s) =>
    `Built monthly totals: ${num(s['months'])} complete months × ${num(s['services'])} ` +
    `services, up to ${formatMonth(String(s['last_month']))}`,
  forecast_features: (s) =>
    `Built ${num(s['rows'])} rows of forecast features: past months, 3-month average, ` +
    'time of year, service',
  random_forest: (s) =>
    `Trained a Random Forest on ${num(s['train_months'])} months and tested it on the last ` +
    `${num(s['test_months'])}: average monthly error ${peso(s['mae'])}`,
  forecast: (s) => {
    const months = Array.isArray(s['months']) ? (s['months'] as string[]) : [];
    return months.length
      ? `Forecast ${formatMonth(months[0])} to ${formatMonth(months[months.length - 1])}`
      : 'Forecast the next months';
  },
  apriori: (s) =>
    `Found ${num(s['rules'])} service combinations in ${num(s['baskets'])} patient histories ` +
    'with Apriori',
  saved: () => 'Saved results to MongoDB',
  done: () => 'Analysis complete',
  error: (s) => `Failed: ${String(s['message'] ?? 'unknown error')}`,
};

/** "Run analysis" button with a live list of pipeline steps. */
@Component({
  selector: 'app-run-panel',
  templateUrl: './run-panel.html',
  styleUrl: './run-panel.css',
})
export class RunPanel {
  private readonly api = inject(AnalysisService);
  private readonly store = inject(ResultsStore);
  private pollTimer: ReturnType<typeof setTimeout> | undefined;

  readonly type = input.required<'retention' | 'revenue'>();
  readonly heading = input('Run analysis');
  readonly buttonLabel = input('Run analysis');
  readonly description = input('');
  /** Unique id prefix when several panels share a page. */
  readonly idPrefix = input('run');
  /** Use 3 when the panel sits inside a section that already has an h2. */
  readonly headingLevel = input<2 | 3>(2);
  readonly completed = output<void>();

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
  /** The pipeline reported "done" but the process is still shutting Spark down. */
  protected readonly finishing = computed(
    () => this.running() && this.job()?.steps.at(-1)?.step === 'done',
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

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.pollTimer));
  }

  protected run(): void {
    this.runError.set(null);
    this.api.run(this.type()).subscribe({
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

  private track(job: AnalysisJob): void {
    this.job.set(job);
    clearTimeout(this.pollTimer);
    if (job.status === 'running') {
      this.pollTimer = setTimeout(() => this.poll(job.id), POLL_MS);
    } else if (job.status === 'succeeded' && (job.type === 'retention' || job.type === 'revenue')) {
      this.store.load(job.type, true);
      if (job.type === this.type()) this.completed.emit();
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
}
