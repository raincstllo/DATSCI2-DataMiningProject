import { Component, computed, inject } from '@angular/core';
import { ChartConfiguration, ChartData, TooltipItem } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { SegmentName } from '../../core/api.models';
import { ChartThemeService, SEGMENT_SHAPE_NAMES, SEGMENT_SHAPES } from '../../core/chart-theme';
import { formatDateTime, formatNumber, formatPeso, formatPesoCompact } from '../../core/format';
import { ResultsStore } from '../../core/results.store';
import { SEGMENT_LABELS } from '../../core/segments';

const SEGMENTS: SegmentName[] = ['Frequent', 'Infrequent', 'Inactive'];

/** Technical view of the retention clustering: scatter, silhouette and data cleaning. */
@Component({
  selector: 'app-retention-details',
  imports: [BaseChartDirective],
  templateUrl: './retention-details.html',
})
export class RetentionDetails {
  private readonly themes = inject(ChartThemeService);
  protected readonly state = inject(ResultsStore).retention;
  protected readonly result = computed(() => this.state().data);
  protected readonly shapeNames = SEGMENT_SHAPE_NAMES;
  protected readonly labels = SEGMENT_LABELS;
  protected readonly fmt = { number: formatNumber, peso: formatPeso, dateTime: formatDateTime };

  protected readonly silhouetteRows = computed(() => {
    const r = this.result();
    if (!r) return [];
    return Object.entries(r.metrics.silhouette_by_k)
      .map(([k, score]) => ({ k: Number(k), score, used: Number(k) === r.metrics.k }))
      .sort((a, b) => a.k - b.k);
  });

  protected readonly scatterData = computed<ChartData<'scatter'>>(() => {
    const t = this.themes.theme();
    const patients = this.result()?.payload.patients ?? [];
    return {
      datasets: SEGMENTS.map((seg) => ({
        label: `${seg} (${SEGMENT_SHAPE_NAMES[seg]})`,
        data: patients.filter((p) => p.segment === seg).map((p) => ({ x: p.recency_days, y: p.total_fee })),
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
        legend: { position: 'top', labels: { color: t.text, usePointStyle: true, padding: 16 } },
        tooltip: {
          callbacks: {
            label: (item: TooltipItem<'scatter'>) =>
              `${SEGMENTS[item.datasetIndex]}: ${formatNumber(item.parsed.x ?? 0)} days since last visit, ` +
              `${formatPeso(item.parsed.y ?? 0)} total spend`,
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
        `${s.segment}, shown as ${SEGMENT_SHAPE_NAMES[s.segment]}s: ${formatNumber(s.patients)} patients, ` +
        `average ${formatNumber(Math.round(s.avg_recency_days))} days since last visit, ` +
        `average spend ${formatPeso(s.avg_total_fee)}`,
    );
    return (
      `Scatter chart of ${formatNumber(r.payload.patients.length)} patients, days since last visit ` +
      `against total spend, by segment. ${parts.join('. ')}.`
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
        tooltip: { callbacks: { label: (item) => `Silhouette score ${Number(item.parsed.y).toFixed(3)}` } },
      },
    };
  });

  protected readonly silhouetteLabel = computed(() => {
    const values = this.silhouetteRows().map((r) => `k=${r.k}: ${r.score.toFixed(3)}${r.used ? ' (used)' : ''}`);
    return `Bar chart of silhouette score by number of segments. ${values.join(', ')}.`;
  });
}
