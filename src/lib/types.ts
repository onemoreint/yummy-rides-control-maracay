export type AppRole = 'admin' | 'operator';
export type AffiliationStatus = 'activo' | 'pendiente' | 'suspendido' | 'retirado';
export type ReviewStatus = 'pendiente' | 'aprobado' | 'observado';
export type DocOwner = 'driver' | 'motorcycle';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: AppRole;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Driver {
  id: string;
  code: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  second_last_name: string | null;
  id_prefix: 'V' | 'E';
  id_number: string;
  birth_date: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  municipality: string | null;
  parish: string | null;
  state: string | null;
  photo_path: string | null;
  emergency_name: string | null;
  emergency_relationship: string | null;
  emergency_phone: string | null;
  join_date: string | null;
  status: AffiliationStatus;
  is_draft: boolean;
  draft_step: number | null;
  internal_notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Motorcycle {
  id: string;
  code: string;
  brand: string;
  model: string;
  year: number | null;
  color: string | null;
  plate: string;
  chassis_serial: string | null;
  engine_serial: string | null;
  displacement_cc: number | null;
  owner_name: string;
  owner_id_doc: string | null;
  photo_front_path: string | null;
  photo_side_path: string | null;
  photo_plate_path: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Assignment {
  id: string;
  driver_id: string;
  motorcycle_id: string;
  start_date: string;
  end_date: string | null;
  is_current: boolean;
  notes: string | null;
  end_reason: string | null;
  assigned_by: string | null;
  created_at: string;
}

export interface DocumentType {
  key: string;
  label: string;
  applies_to: DocOwner;
  has_expiry: boolean;
  active: boolean;
  sort_order: number;
}

export interface DocumentRow {
  id: string;
  owner_type: DocOwner;
  driver_id: string | null;
  motorcycle_id: string | null;
  doc_type: string;
  file_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  issue_date: string | null;
  expiry_date: string | null;
  review_status: ReviewStatus;
  notes: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

export interface AffiliationHistory {
  id: string;
  driver_id: string;
  previous_status: AffiliationStatus | null;
  new_status: AffiliationStatus;
  effective_date: string;
  reason: string | null;
  notes: string | null;
  changed_by: string | null;
  changed_by_name: string | null;
  created_at: string;
}

export interface AuditLog {
  id: number;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  table_name: string;
  record_id: string | null;
  driver_id: string | null;
  summary: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
}

export interface DashboardStats {
  drivers_total: number;
  drivers_activo: number;
  drivers_pendiente: number;
  drivers_suspendido: number;
  drivers_retirado: number;
  drivers_borrador: number;
  motorcycles_total: number;
  docs_pending_review: number;
  docs_expiring_30: number;
  docs_expired: number;
}

export interface DocumentAlert {
  id: string;
  owner_type: DocOwner;
  driver_id: string | null;
  motorcycle_id: string | null;
  doc_type: string;
  doc_label: string;
  expiry_date: string;
  days_left: number;
  alert_level: 'vencido' | '7' | '15' | '30';
  driver_name: string | null;
  driver_code: string | null;
  motorcycle_plate: string | null;
}

export interface CurrentMoto {
  driver_id: string;
  assignment_id: string;
  start_date: string;
  motorcycle_id: string;
  motorcycle_code: string;
  plate: string;
  brand: string;
  model: string;
  color: string | null;
  year: number | null;
}
