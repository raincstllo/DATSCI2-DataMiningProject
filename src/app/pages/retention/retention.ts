import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RetentionPatient, SegmentName } from '../../core/api.models';
import { formatDate, formatDateTime, formatNumber, formatPercent, formatPeso, formatPhone } from '../../core/format';
import { ResultsStore } from '../../core/results.store';
import { SEGMENT_ACTIONS, SEGMENT_DESCRIPTIONS, SEGMENT_LABELS } from '../../core/segments';
import { Pager } from '../../shared/pager';
import { RunPanel } from '../../shared/run-panel/run-panel';

type SortKey = 'spend' | 'recency' | 'name';

const PAGE_SIZE = 25;
/** Most urgent group first. */
const SEGMENTS: SegmentName[] = ['Inactive', 'Infrequent', 'Frequent'];

/** Owner view of the retention clustering: who to contact and how. */
@Component({
  selector: 'app-retention',
  imports: [RouterLink, RunPanel, Pager],
  templateUrl: './retention.html',
  styleUrl: './retention.css',
})
export class Retention implements OnInit {
  private readonly store = inject(ResultsStore);

  protected readonly state = this.store.retention;
  protected readonly result = computed(() => this.state().data);
  protected readonly segments = SEGMENTS;
  protected readonly labels = SEGMENT_LABELS;
  protected readonly descriptions = SEGMENT_DESCRIPTIONS;
  protected readonly actions = SEGMENT_ACTIONS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly fmt = {
    peso: formatPeso,
    phone: formatPhone,
    number: formatNumber,
    percent: formatPercent,
    date: formatDate,
    dateTime: formatDateTime,
  };

  protected readonly segmentFilter = signal<'all' | SegmentName>('Inactive');
  protected readonly search = signal('');
  protected readonly sort = signal<SortKey>('spend');
  protected readonly page = signal(1);

  protected readonly cards = computed(() => {
    const r = this.result();
    if (!r) return [];
    return SEGMENTS.map((name) => r.payload.segments.find((s) => s.segment === name)).filter((s) => !!s);
  });

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
      spend: (a, b) => b.total_fee - a.total_fee,
      recency: (a, b) => b.recency_days - a.recency_days,
      name: (a, b) => a.name.localeCompare(b.name),
    };
    return [...rows].sort(by[this.sort()]);
  });

  protected readonly pageRows = computed(() =>
    this.filtered().slice((this.page() - 1) * PAGE_SIZE, this.page() * PAGE_SIZE),
  );

  protected readonly rangeText = computed(() => {
    const total = this.filtered().length;
    if (!total) return 'No patients match';
    const from = (this.page() - 1) * PAGE_SIZE + 1;
    const to = Math.min(total, from + PAGE_SIZE - 1);
    return `Showing ${formatNumber(from)}–${formatNumber(to)} of ${formatNumber(total)} patients`;
  });

  ngOnInit(): void {
    this.store.load('retention');
  }

  protected showGroup(name: SegmentName): void {
    this.setSegment(name);
    setTimeout(() => document.getElementById('followup-heading')?.focus());
  }

  protected setSegment(value: string): void {
    this.segmentFilter.set(value === 'all' ? 'all' : (value as SegmentName));
    this.page.set(1);
  }

  protected setSearch(value: string): void {
    this.search.set(value);
    this.page.set(1);
  }

  protected setSort(value: string): void {
    this.sort.set(value as SortKey);
    this.page.set(1);
  }
}
