import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal, WritableSignal } from '@angular/core';
import { AnalysisService } from './analysis.service';
import { RetentionResult, RevenueResult } from './api.models';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

export interface ResultState<T> {
  status: LoadStatus;
  data: T | null;
}

/** Latest saved result per analysis, shared by the home page, owner pages and details page. */
@Injectable({ providedIn: 'root' })
export class ResultsStore {
  private readonly api = inject(AnalysisService);

  readonly retention = signal<ResultState<RetentionResult>>({ status: 'idle', data: null });
  readonly revenue = signal<ResultState<RevenueResult>>({ status: 'idle', data: null });

  /** Loads once; pass `force` after a new run to fetch the fresh result. */
  load(type: 'retention' | 'revenue', force = false): void {
    const target = (type === 'retention' ? this.retention : this.revenue) as WritableSignal<
      ResultState<RetentionResult | RevenueResult>
    >;
    const current = target();
    if (!force && (current.status === 'loading' || current.status === 'ready')) return;
    target.set({ status: 'loading', data: current.data });
    this.api.latest<RetentionResult | RevenueResult>(type).subscribe({
      next: (data) => target.set({ status: 'ready', data }),
      error: (err: unknown) => {
        if (err instanceof HttpErrorResponse && err.status === 404) target.set({ status: 'empty', data: null });
        else if (!(err instanceof HttpErrorResponse && err.status === 401)) {
          target.set({ status: 'error', data: current.data });
        }
      },
    });
  }

  /** Drop cached results, e.g. on logout. */
  reset(): void {
    this.retention.set({ status: 'idle', data: null });
    this.revenue.set({ status: 'idle', data: null });
  }
}
