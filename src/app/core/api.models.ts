export interface LoginResponse {
  token: string;
  expiresIn: string;
}

export interface AnalysisType {
  type: string;
  label: string;
}

export type JobStatus = 'running' | 'succeeded' | 'failed';

export interface JobStep {
  step: string;
  at: string;
  [detail: string]: unknown;
}

export interface AnalysisJob {
  id: string;
  type: string;
  status: JobStatus;
  startedAt: string;
  finishedAt: string | null;
  steps: JobStep[];
  error: string | null;
}

export type SegmentName = 'Frequent' | 'Infrequent' | 'Inactive';

export interface RetentionSegment {
  segment: SegmentName;
  patients: number;
  share: number;
  avg_recency_days: number;
  avg_visits: number;
  avg_total_fee: number;
  total_revenue: number;
  strategy: string;
}

export interface RetentionPatient {
  name: string;
  segment: SegmentName;
  last_visit: string;
  visits: number;
  total_fee: number;
  recency_days: number;
}

export interface EtlReport {
  as_of: string;
  rows_loaded: number;
  duplicates_dropped: number;
  future_rows_dropped: number;
  likely_duplicate_patients: number;
  rows_clean: number;
  visits_clean: number;
  patients_clean: number;
}

export interface RetentionResult {
  type: 'retention';
  generated_at: string;
  payload: {
    as_of: string;
    segments: RetentionSegment[];
    patients: RetentionPatient[];
  };
  metrics: {
    algorithm: string;
    k: number;
    features: string[];
    scaling: string;
    silhouette: number;
    silhouette_by_k: Record<string, number>;
    inertia: number;
    etl: EtlReport;
  };
}
