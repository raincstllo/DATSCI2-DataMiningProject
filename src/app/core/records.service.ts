import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';
import {
  FieldErrors,
  Page,
  Patient,
  PatientDetail,
  PatientInput,
  PatientListItem,
  Visit,
  VisitFilters,
  VisitInput,
  VisitSummary,
} from './records.models';

function params(values: object): HttpParams {
  let p = new HttpParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== '') p = p.set(key, String(value));
  }
  return p;
}

/** Turns an API error into a page message and per-field messages. */
export function readApiError(err: unknown, fallback: string): { message: string; fields: Record<string, string> } {
  if (err instanceof HttpErrorResponse) {
    const body = err.error as Partial<FieldErrors> | null;
    if (err.status === 0 || err.status >= 500) {
      return { message: 'The server could not be reached. Check that the backend is running.', fields: {} };
    }
    return { message: body?.error ?? fallback, fields: body?.fields ?? {} };
  }
  return { message: fallback, fields: {} };
}

@Injectable({ providedIn: 'root' })
export class RecordsService {
  private readonly http = inject(HttpClient);

  /** The fixed list of services, loaded once. */
  readonly services$: Observable<string[]> = this.http
    .get<string[]>('/api/visits/services')
    .pipe(shareReplay(1));

  listPatients(q: string, page: number, pageSize = 25): Observable<Page<PatientListItem>> {
    return this.http.get<Page<PatientListItem>>('/api/patients', { params: params({ q, page, pageSize }) });
  }

  getPatient(id: string): Observable<PatientDetail> {
    return this.http.get<PatientDetail>(`/api/patients/${encodeURIComponent(id)}`);
  }

  createPatient(input: PatientInput): Observable<Patient> {
    return this.http.post<Patient>('/api/patients', input);
  }

  updatePatient(id: string, input: PatientInput): Observable<Patient> {
    return this.http.put<Patient>(`/api/patients/${encodeURIComponent(id)}`, input);
  }

  deletePatient(id: string): Observable<void> {
    return this.http.delete<void>(`/api/patients/${encodeURIComponent(id)}`);
  }

  listVisits(filters: VisitFilters): Observable<Page<Visit>> {
    return this.http.get<Page<Visit>>('/api/visits', { params: params(filters) });
  }

  /** Totals for a date range; defaults to this month so far. */
  visitSummary(from?: string, to?: string): Observable<VisitSummary> {
    return this.http.get<VisitSummary>('/api/visits/summary', { params: params({ from, to }) });
  }

  getVisit(id: string): Observable<Visit> {
    return this.http.get<Visit>(`/api/visits/${encodeURIComponent(id)}`);
  }

  createVisit(input: VisitInput): Observable<Visit> {
    return this.http.post<Visit>('/api/visits', input);
  }

  updateVisit(id: string, input: VisitInput): Observable<Visit> {
    return this.http.put<Visit>(`/api/visits/${encodeURIComponent(id)}`, input);
  }

  deleteVisit(id: string): Observable<void> {
    return this.http.delete<void>(`/api/visits/${encodeURIComponent(id)}`);
  }
}
