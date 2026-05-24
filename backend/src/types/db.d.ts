import 'knex/types/tables';

export type UserPapel = 'admin_sistema' | 'dono_clinica' | 'secretaria';

export interface UserRow {
  id: string;
  nome: string;
  email: string;
  senha_hash: string;
  papel: UserPapel;
  clinica_id: string | null;
  ativo: boolean;
  ultimo_login_em: Date | null;
  // MFA/TOTP (Sprint 3.19). Secrets are encrypted at rest; never exposed via API.
  mfa_enabled: boolean;
  mfa_secret_encrypted: string | null;
  mfa_pending_secret_encrypted: string | null;
  mfa_pending_created_at: Date | null;
  mfa_enabled_at: Date | null;
  mfa_last_verified_at: Date | null;
  criado_em: Date;
  atualizado_em: Date;
}

export interface ClinicRow {
  id: string;
  nome: string;
  cnpj: string | null;
  responsavel_id: string;
  plano: string;
  consentimento_lgpd: boolean;
  contrato_aceito_em: Date | null;
  // Short opaque code the owner shares so a secretaria can request to join
  // (Sprint 3.24). Stored normalized (no dash); the API formats it for display.
  invite_code: string;
  criado_em: Date;
  atualizado_em: Date;
}

// Clinic join requests (Sprint 3.24). A secretaria (no clinic yet) requests to
// join a clinic by its invite_code; the owner approves/rejects. requested_role is
// DB-constrained to 'secretaria' so approval can never grant a privileged role.
// 'revoked' was added in Sprint 3.25: an owner-initiated removal of a clinic
// member (recorded as a historical row; users.clinica_id is the source of truth
// for the current vínculo).
export type ClinicJoinRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'revoked';

export interface ClinicJoinRequestRow {
  id: string;
  clinic_id: string;
  user_id: string;
  requested_role: 'secretaria';
  status: ClinicJoinRequestStatus;
  decided_by_user_id: string | null;
  decided_at: Date | null;
  message: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface AuditLogRow {
  id: string;
  usuario_id: string | null;
  clinica_id: string | null;
  acao: string;
  recurso: string | null;
  recurso_id: string | null;
  ip: string | null;
  user_agent: string | null;
  request_id: string | null;
  criado_em: Date;
}

export interface ImportFileRow {
  id: string;
  clinica_id: string;
  usuario_id: string;
  nome_original: string;
  nome_interno: string;
  mime_type: string;
  extensao: string;
  // pg returns BIGINT as a string; we coerce to number at the model boundary.
  tamanho_bytes: string | number;
  sha256: string;
  status: string;
  criado_em: Date;
}

export interface ImportSessionRow {
  id: string;
  clinica_id: string;
  import_file_id: string;
  usuario_id: string;
  status: string;
  // jsonb columns: pg returns them already parsed. Typed loosely here to avoid a
  // types <-> models import cycle; the model casts to the concrete shapes.
  mapping_json: Record<string, string | null>;
  validation_summary_json: Record<string, unknown>;
  field_stats_json: Record<string, unknown> | null;
  issues_sample_json: unknown[] | null;
  // Sprint 2.18 — receipt of a successful import. Counts + metadata only; no
  // patient values are ever stored here.
  import_summary_json: Record<string, unknown> | null;
  imported_at: Date | null;
  imported_by_user_id: string | null;
  criado_em: Date;
  atualizado_em: Date;
}

export interface PatientRow {
  id: string;
  clinica_id: string;
  import_session_id: string | null;
  nome: string;
  telefone: string | null;
  email: string | null;
  cpf: string | null;
  data_nascimento: string | null;
  convenio: string | null;
  numero_carteirinha: string | null;
  status: string;
  origem: string;
  // Provenance of safe duplicate merge B-safe (Sprint 3.33; ADR 0007). When an
  // archived secondary was merged into a surviving primary, these point at the
  // primary. Both null on active rows that were never merged.
  merged_into_id: string | null;
  merged_at: Date | null;
  criado_em: Date;
  atualizado_em: Date;
}

// MFA backup (recovery) codes (Sprint 3.21). Only the argon2 HASH is stored;
// single-use via used_at. Codes exist only while the user has MFA enabled.
export interface UserMfaBackupCodeRow {
  id: string;
  user_id: string;
  code_hash: string;
  used_at: Date | null;
  created_at: Date;
}

// Administrative Scheduling (Sprint 3.14). Administrative data only — no clinical
// fields. Tenant-scoped by clinica_id.
export interface ClinicProfessionalRow {
  id: string;
  clinica_id: string;
  name: string;
  specialty_label: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface AppointmentRow {
  id: string;
  clinica_id: string;
  patient_id: string;
  professional_id: string | null;
  starts_at: Date;
  ends_at: Date;
  status: string;
  administrative_notes: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

declare module 'knex/types/tables' {
  interface Tables {
    users: UserRow;
    clinics: ClinicRow;
    audit_logs: AuditLogRow;
    import_files: ImportFileRow;
    import_sessions: ImportSessionRow;
    patients: PatientRow;
    user_mfa_backup_codes: UserMfaBackupCodeRow;
    clinic_professionals: ClinicProfessionalRow;
    appointments: AppointmentRow;
    clinic_join_requests: ClinicJoinRequestRow;
  }
}
