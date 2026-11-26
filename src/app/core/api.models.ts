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
  patient_id: string;
  name: string;
  contact_number: string;
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
  inconsistent_patient_ids?: number;
  rows_clean: number;
  visits_clean: number;
  patients_clean: number;
}

export interface ErrorMetrics {
  mae: number;
  rmse: number;
}

export interface ModelComparison {
  random_forest: ErrorMetrics;
  last_month_baseline: ErrorMetrics;
  average_baseline: ErrorMetrics;
}

export interface TargetEvaluation {
  train_months: number;
  test_months: number;
  train_rows: number;
  test_rows: number;
  per_service: ModelComparison;
  monthly_total: ModelComparison;
}

export interface ServiceForecast {
  service: string;
  last_month_revenue: number;
  last_month_cases: number;
  forecast_revenue: number;
  forecast_cases: number;
  change: number | null;
}

export interface ServiceRule {
  if: string[];
  then: string[];
  support: number;
  confidence: number;
  lift: number;
  patients: number;
}

export interface RevenueResult {
  type: 'revenue';
  generated_at: string;
  payload: {
    as_of: string;
    last_complete_month: string;
    history: { month: string; revenue: number; cases: number }[];
    forecast: { month: string; revenue: number; cases: number; low: number; high: number }[];
    test_check: { month: string; actual: number; random_forest: number; last_month: number }[];
    services: ServiceForecast[];
    feature_importance: { feature: string; importance: number }[];
    rules: ServiceRule[];
    itemsets: { services: string[]; support: number; patients: number }[];
  };
  metrics: {
    forecast: {
      algorithm: string;
      split: string;
      features: string[];
      horizon_months: number;
      revenue: TargetEvaluation;
      cases: TargetEvaluation;
    };
    rules: {
      algorithm: string;
      baskets: number;
      basket_level: string;
      multi_service_visits: number;
      min_support: number;
      min_confidence: number;
      min_lift: number;
      itemsets: number;
      rules: number;
    };
    etl: EtlReport;
  };
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
