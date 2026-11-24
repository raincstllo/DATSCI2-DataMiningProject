import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AnalysisJob } from './api.models';

@Injectable({ providedIn: 'root' })
export class AnalysisService {
  private readonly http = inject(HttpClient);

  run(type: string): Observable<AnalysisJob> {
    return this.http.post<AnalysisJob>(`/api/analysis/${encodeURIComponent(type)}/run`, {});
  }

  job(id: string): Observable<AnalysisJob> {
    return this.http.get<AnalysisJob>(`/api/analysis/jobs/${encodeURIComponent(id)}`);
  }

  latest<T>(type: string): Observable<T> {
    return this.http.get<T>(`/api/results/${encodeURIComponent(type)}/latest`);
  }
}
