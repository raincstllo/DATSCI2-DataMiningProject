export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Patient {
  patient_id: string;
  name: string;
  contact_number: string;
  created_at?: string;
  updated_at?: string;
}

export interface PatientListItem extends Patient {
  visit_count: number;
  last_visit: string | null;
}

export interface ServiceLine {
  nature_of_visit: string;
  teeth_operated: string[];
  fee: number;
}

export interface Visit {
  visit_id: string;
  patient_id: string;
  patient_name?: string | null;
  date_visited: string;
  services: ServiceLine[];
  total_fee: number;
}

export interface PatientDetail extends Patient {
  visits: Visit[];
}

export interface PatientInput {
  name: string;
  contact_number: string;
}

export interface VisitInput {
  patient_id: string;
  date_visited: string;
  services: { nature_of_visit: string; teeth_operated: string; fee: number | null }[];
}

export interface VisitFilters {
  q?: string;
  service?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

/** Error body for 400 responses: one message per field path, e.g. "services.0.fee". */
export interface FieldErrors {
  error: string;
  fields?: Record<string, string>;
}

export interface VisitSummary {
  from: string;
  to: string;
  visits: number;
  patients: number;
  services: number;
  revenue: number;
}
