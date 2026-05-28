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
  // Optional link to the services catalog (Sprint 4.6B, ADR 0015).
  // Pure label — duration is NOT propagated automatically.
  service_id: string | null;
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

// Clinical Documents v0.1 — Sprint 4.3B (ADR 0011).
//
// Second clinical module: documents (receita, atestado, declaração, exame,
// orientação). Reuses clinical_read_audit (recurso='document' is already in the
// allowlist since 4.2B-1), audit_logs, and the requireClinicalRole gate.
//
// Lifecycle invariants enforced both by DB CHECK and the DAO:
//   - status: draft → finalized → canceled  (one-way; no restore; no re-edit
//     after finalized; no DELETE in any state).
//   - body/title/metadata_json: mutable only while status='draft'.
//   - finalized: requires finalized_at + finalized_by_user_id.
//   - canceled : requires canceled_at + canceled_by_user_id + cancel_reason_code.

export type ClinicalDocumentType =
  | 'receipt_simple'
  | 'attestation'
  | 'declaration'
  | 'exam_request'
  | 'orientation';

export type ClinicalDocumentStatus = 'draft' | 'finalized' | 'canceled';

export type ClinicalDocumentCancelReasonCode =
  | 'error'
  | 'duplicate'
  | 'patient_request'
  | 'other';

export interface ClinicalDocumentRow {
  id: string;
  clinica_id: string;
  patient_id: string;
  // Encounter linkage is OPTIONAL by ADR 0011 §3.5. When set, the service
  // verifies same clinica + same patient.
  encounter_id: string | null;
  author_user_id: string;
  doc_type: ClinicalDocumentType;
  // Title is required; service supplies a default when client omits.
  title: string;
  // Body holds the clinical text. NULL in draft; non-empty required to finalize.
  // Capped at 10 000 chars by DB CHECK + service.
  body: string | null;
  // Per-type semi-structured fields. Validated by service (not DB CHECK) to
  // keep template iteration cheap. NEVER carries PII bruta (CPF/phone): the
  // PDF reads PII from the patient record at render time (minimization).
  metadata_json: Record<string, unknown> | null;
  status: ClinicalDocumentStatus;
  finalized_at: Date | null;
  finalized_by_user_id: string | null;
  canceled_at: Date | null;
  canceled_by_user_id: string | null;
  cancel_reason_code: ClinicalDocumentCancelReasonCode | null;
  // Free-text cancel reason capped at 200 chars by DB CHECK. NEVER logged.
  // NEVER written to audit_logs (no column for it; mirrors clinical_encounters).
  cancel_reason_text: string | null;
  // Soft self-reference: this document replaces an earlier finalized one that
  // was canceled. UI may surface "substitui o doc de DD/MM/AAAA" with this.
  supersedes_document_id: string | null;
  created_at: Date;
  updated_at: Date;
}

// Financial Module v0.1 — Sprint 4.4B (ADR 0012).
//
// ADMINISTRATIVE module (not clinical). `financial_charges` rows NEVER carry
// diagnosis/CID/clinical content; `notes` is administrative free-text capped
// at 500 chars. See ADR 0012 §2 and §5 for full out-of-scope list.
//
// Lifecycle invariants enforced both by DB CHECK and the DAO:
//   - status: pending → paid | canceled (one-way; no reversal; no restore;
//     no DELETE in any state).
//   - paid:     requires paid_at + paid_by_user_id + payment_method.
//   - canceled: requires canceled_at + canceled_by_user_id.
//   - pending:  carries no paid_*/canceled_* fields.

export type FinancialChargeStatus = 'pending' | 'paid' | 'canceled';

export type FinancialPaymentMethod =
  | 'cash'
  | 'pix'
  | 'card'
  | 'bank_transfer'
  | 'other';

export interface FinancialChargeRow {
  id: string;
  clinica_id: string;
  patient_id: string;
  // Optional integration link with the agenda (ADR 0012 §16). Service
  // validates same-clinica + same-patient when set; SET NULL on appointment
  // delete (deletion is impossible by current invariants, but the FK protects
  // the row from orphaning if that ever changes).
  appointment_id: string | null;
  created_by_user_id: string;
  // Administrative label of the charge (e.g. "Consulta clínica 27/05").
  // 1..500 chars (DB CHECK + service). Logger REDACTS this field.
  description: string;
  // Integer cents (ADR 0012 §6.1 design note) — avoids floating-point issues.
  // Must be > 0 (DB CHECK + service). Logger REDACTS this field in v0.1.
  amount_cents: number;
  // ISO-4217 currency code. CHECK fixes 'BRL' for v0.1.
  currency: 'BRL';
  due_date: string | null;
  status: FinancialChargeStatus;
  paid_at: Date | null;
  paid_by_user_id: string | null;
  payment_method: FinancialPaymentMethod | null;
  // Optional free-text cancel reason capped at 200 chars by DB CHECK. Logger
  // REDACTS this field.
  cancel_reason: string | null;
  canceled_at: Date | null;
  canceled_by_user_id: string | null;
  // Administrative notes, max 500 chars by DB CHECK. NEVER contains clinical
  // content (invariant — ADR 0012 §6.1). Logger REDACTS this field.
  notes: string | null;
  // Optional link to the services catalog (Sprint 4.6B, ADR 0015).
  // Pure label — price is NEVER auto-propagated to amount_cents.
  service_id: string | null;
  // Convênios v0.1 — Sprint 4.7B (ADR 0016). All five fields NULL by default
  // (retrocompat with existing rows). `payer_type` NULL = particular by
  // convention. reference_price_cents from service_insurance_prices NEVER
  // auto-propagates to amount_cents (humano decide).
  payer_type: 'private' | 'insurance' | 'mixed' | null;
  insurance_provider_id: string | null;
  patient_insurance_id: string | null;
  copay_amount_cents: number | null;
  insurance_amount_cents: number | null;
  created_at: Date;
  updated_at: Date;
}

// Catálogo de Serviços v0.1 — Sprint 4.6B (ADR 0015).
// ADMINISTRATIVE / COMMERCIAL label only. NEVER contains clinical content;
// `price_cents` is reference-only and is NEVER auto-propagated to
// financial_charges.amount_cents; `duration_minutes` is a UI suggestion.
export interface ClinicServiceRow {
  id: string;
  clinica_id: string;
  name: string;
  category: string | null;
  description: string | null;
  duration_minutes: number | null;
  price_cents: number | null;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

// Binding row: a professional offers a service. Soft-delete via active.
// Composite PK (professional_id, service_id) — a single row per pair;
// re-linking flips active back to true at the service layer.
export interface ProfessionalServiceRow {
  professional_id: string;
  service_id: string;
  clinica_id: string;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

// Convênios v0.1 — Sprint 4.7B (ADR 0016).
// ADMINISTRATIVE / COMMERCIAL layer. NEVER carries clinical content;
// `reference_price_cents` is reference-only and NEVER auto-propagates to
// `financial_charges.amount_cents`. `member_number` and `holder_name` are PII
// and are redacted by the logger (config/logger.ts).

export type FinancialPayerType = 'private' | 'insurance' | 'mixed';

export interface InsuranceProviderRow {
  id: string;
  clinica_id: string;
  name: string;
  notes: string | null;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface InsurancePlanRow {
  id: string;
  clinica_id: string;
  provider_id: string;
  name: string;
  notes: string | null;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface PatientInsuranceRow {
  id: string;
  clinica_id: string;
  patient_id: string;
  // provider_id is NOT NULL at INSERT time, but SET NULL on provider hard-
  // deletion (no app path hits this; defense-in-depth FK behavior).
  provider_id: string | null;
  plan_id: string | null;
  // PII — number of the carteirinha. Redacted by logger (Sprint 4.7B).
  member_number: string | null;
  // PII — titular (if patient is dependent). Redacted by logger.
  holder_name: string | null;
  valid_until: string | null;
  notes: string | null;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ServiceInsurancePriceRow {
  id: string;
  clinica_id: string;
  service_id: string;
  provider_id: string;
  plan_id: string | null;
  reference_price_cents: number | null;
  notes: string | null;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

// Estoque básico v0.1 — Sprint 4.8B (ADR 0017).
// ADMINISTRATIVE / OPERATIONAL module. NEVER carries clinical content;
// `notes` and `reason` are administrative free-text only and are redacted by
// the logger (config/logger.ts). `current_quantity` is mutated ONLY by the
// service inside a SELECT FOR UPDATE transaction alongside the matching
// inventory_movements insert.
export type InventoryMovementType = 'entry' | 'exit' | 'adjustment' | 'loss';

export interface InventoryItemRow {
  id: string;
  clinica_id: string;
  name: string;
  category: string | null;
  unit: string;
  current_quantity: number;
  minimum_quantity: number;
  location: string | null;
  // Administrative free-text. NEVER clinical content (invariant — ADR 0017 §5.3).
  // Logger redacts via the existing 'notes' path.
  notes: string | null;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

// APPEND-ONLY at the application layer. There is no UPDATE/DELETE method on
// inventoryMovementDao. Corrections are issued as new `adjustment` rows.
export interface InventoryMovementRow {
  id: string;
  clinica_id: string;
  item_id: string;
  movement_type: InventoryMovementType;
  // Signed integer; sign convention per movement_type enforced by the service.
  quantity_delta: number;
  // Administrative free-text. NEVER clinical content (invariant — ADR 0017 §5.3).
  // Logger redacts via the 'reason' path added in this sprint.
  reason: string | null;
  created_by_user_id: string | null;
  created_at: Date;
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
    clinical_documents: ClinicalDocumentRow;
    user_clinical_roles: UserClinicalRoleRow;
    financial_charges: FinancialChargeRow;
    clinic_services: ClinicServiceRow;
    professional_services: ProfessionalServiceRow;
    insurance_providers: InsuranceProviderRow;
    insurance_plans: InsurancePlanRow;
    patient_insurances: PatientInsuranceRow;
    service_insurance_prices: ServiceInsurancePriceRow;
    inventory_items: InventoryItemRow;
    inventory_movements: InventoryMovementRow;
  }
}
