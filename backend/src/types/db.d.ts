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

// Clinical Prontuário/Atendimento v0.1 — Sprint 4.2B-1 (ADR 0010 + ADR 0009).
// FIRST clinical data in the project. Every read of content is gated by
// `requireClinicalRole` and audited by `clinical_read_audit`. No physical
// delete in any of the four tables (enforced at the DAO layer).

export type ClinicalEncounterStatus = 'active' | 'canceled';
export type ClinicalEncounterCancelReasonCode =
  | 'duplicated'
  | 'wrong_patient'
  | 'data_error'
  | 'other';

export interface ClinicalEncounterRow {
  id: string;
  clinica_id: string;
  patient_id: string;
  attending_user_id: string;
  professional_id: string | null;
  appointment_id: string | null;
  started_at: Date;
  ended_at: Date | null;
  status: ClinicalEncounterStatus;
  canceled_at: Date | null;
  canceled_by_user_id: string | null;
  cancel_reason_code: ClinicalEncounterCancelReasonCode | null;
  // Free-text reason capped at 200 chars by DB CHECK. NEVER logged. NEVER
  // written to audit_logs (no column for it there).
  cancel_reason_text: string | null;
  created_at: Date;
  updated_at: Date;
}

export type ClinicalNoteRectificationReasonCode =
  | 'typo'
  | 'clinical_correction'
  | 'add_info'
  | 'other';

export interface ClinicalEncounterNoteRow {
  id: string;
  // Denormalized for direct tenant filtering without joining encounters.
  clinica_id: string;
  encounter_id: string;
  author_user_id: string;
  // The 5 textual clinical fields (all OPTIONAL individually; at least one
  // is required — enforced by DB CHECK + service). Length caps mirror ADR
  // 0010 §3.2: chief_complaint ≤ 2000, anamnesis ≤ 8000, evolution ≤ 8000,
  // plan ≤ 4000, internal_note ≤ 2000.
  chief_complaint: string | null;
  anamnesis: string | null;
  evolution: string | null;
  plan: string | null;
  // internal_note: visible ONLY to the note's author + dono_clinica + gestor_clinica.
  // The DAO/service must redact this field for any other reader. Other roles
  // (funcionario_administrativo / financeiro / admin_sistema) cannot reach
  // clinical endpoints at all (403 at the middleware), but defense in depth
  // requires the field to be droppable at the DAO layer too.
  internal_note: string | null;
  // Rectification chain: a new note that supersedes an older one points to
  // it here and must carry a reason code. Original notes are NEVER updated.
  revises_note_id: string | null;
  rectification_reason_code: ClinicalNoteRectificationReasonCode | null;
  created_at: Date;
}

export interface ClinicalReadAuditRow {
  id: string;
  // Mirrors audit_logs: SET NULL on user/clinic delete to preserve evidence.
  clinica_id: string | null;
  usuario_id: string | null;
  // Snapshot of the EFFECTIVE role at the moment of the read. Anti-stale:
  // if the role is revoked later, the historical row preserves the role
  // that was in force when the read happened.
  papel_at_read: string;
  // Convention: every action MUST start with 'clinical.' (DB CHECK enforces).
  // Examples: 'clinical.encounter.read', 'clinical.encounter.list',
  // 'clinical.timeline.list' (ADR 0010 §8.2).
  acao: string;
  recurso: 'encounter' | 'note' | 'timeline' | 'document' | 'report' | 'attachment';
  recurso_id: string | null;
  // paciente_id is an INTERNAL PSEUDONYMIZED IDENTIFIER (UUID) — personal
  // data under LGPD. Required for LGPD-art.18 transparency to the data
  // subject (who read my chart?). NEVER logged outside this table; NEVER
  // paired with PII (no name/CPF/phone/email/clinical content in this row).
  paciente_id: string | null;
  request_id: string | null;
  ip: string | null;
  user_agent: string | null;
  // Mirrors audit_logs column name (Portuguese) rather than created_at.
  criado_em: Date;
}

// New clinical roles live in their own table (parallel to users.papel) so the
// legacy 'dono_clinica' / 'secretaria' / 'admin_sistema' enum and the JWT/auth
// pipeline keep working unchanged. financeiro is reserved for Sprint 4.4 and
// is NOT in the DB CHECK allowlist yet.
export type UserClinicalRoleName = 'profissional_clinico' | 'gestor_clinica';

export interface UserClinicalRoleRow {
  id: string;
  user_id: string;
  clinica_id: string;
  role: UserClinicalRoleName;
  granted_by_user_id: string | null;
  granted_at: Date;
  // revoked_at IS NULL = active grant. Active uniqueness is enforced by a
  // partial unique index on (user_id, clinica_id, role) WHERE revoked_at IS NULL.
  revoked_at: Date | null;
  revoked_by_user_id: string | null;
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
    clinical_encounters: ClinicalEncounterRow;
    clinical_encounter_notes: ClinicalEncounterNoteRow;
    clinical_read_audit: ClinicalReadAuditRow;
    user_clinical_roles: UserClinicalRoleRow;
  }
}
