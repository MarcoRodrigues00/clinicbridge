// Thin client for the ClinicBridge backend (Sprint 1 / 1.5).
//
// Design choices:
// - All functions throw `ApiError` on failure; callers translate to UI state.
// - No global token store — `getMe()` takes the token explicitly, which keeps
//   this module easy to test and free of cycles with authStorage.
// - We never read `message` from the network without sanitization; we only
//   surface the `error.message` field that the backend explicitly produces.

import {
  DEMO_BLOCKED_MESSAGE,
  isDemoWriteBlock,
  isWriteBlockedInDemo,
  notifyDemoBlocked,
} from './demoMode';

const DEFAULT_BASE_URL = 'http://localhost:3001';

function resolveBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_BASE_URL;
  if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) {
    return fromEnv.replace(/\/+$/, '');
  }
  return DEFAULT_BASE_URL;
}

const BASE_URL = resolveBaseUrl();

export interface SafeUser {
  id: string;
  nome: string;
  email: string;
  papel: 'admin_sistema' | 'dono_clinica' | 'secretaria';
  clinica_id: string | null;
  ativo: boolean;
  criado_em: string;
}

export interface PublicClinic {
  id: string;
  nome: string;
  cnpj: string | null;
  responsavel_id: string;
  plano: string;
  consentimento_lgpd: boolean;
  contrato_aceito_em: string | null;
  criado_em: string;
}

export interface RegisterPayload {
  nome: string;
  email: string;
  senha: string;
  nome_clinica: string;
  consentimento_lgpd: true;
}

export interface RegisterResponse {
  message: string;
  user: SafeUser;
  clinic: PublicClinic;
}

// Staff (secretaria) self-registration (Sprint 3.24): no clinic is created.
export interface RegisterStaffPayload {
  nome: string;
  email: string;
  senha: string;
  consentimento_lgpd: true;
}

export interface RegisterStaffResponse {
  message: string;
  user: SafeUser;
}

// Clinic join requests (Sprint 3.24).
export type JoinRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface MyJoinRequest {
  id: string;
  clinic_id: string;
  clinic_name: string | null;
  requested_role: string;
  status: JoinRequestStatus;
  message: string | null;
  created_at: string;
  decided_at: string | null;
}

export interface PendingJoinRequest {
  id: string;
  applicant_name: string;
  applicant_email: string;
  requested_role: string;
  message: string | null;
  created_at: string;
}

export interface InviteCodeResponse {
  invite_code: string;
  clinic_name: string;
}

// Team members (Sprint 3.25). status='active' = currently linked to the clinic;
// 'removed' = was a member, now has no clinic vínculo here. is_owner flags the
// clinic's `responsavel_id`. papel is the technical role (currently always
// `secretaria` for non-owners); the UI maps it to a friendly label.
export type ClinicMemberStatus = 'active' | 'removed';

export interface ClinicMember {
  user_id: string;
  nome: string;
  email: string;
  papel: 'admin_sistema' | 'dono_clinica' | 'secretaria';
  ativo: boolean;
  status: ClinicMemberStatus;
  is_owner: boolean;
  joined_at: string | null;
  removed_at: string | null;
}

export interface LoginPayload {
  email: string;
  senha: string;
}

export interface LoginResponse {
  message: string;
  user: SafeUser;
  token: string;
  expires_in: string;
}

export interface MeResponse {
  user: SafeUser;
  clinic: PublicClinic | null;
}

// MFA / TOTP (Sprint 3.19).
export interface MfaRequiredResponse {
  mfa_required: true;
  mfa_challenge_token: string;
}

export type LoginOutcome = LoginResponse | MfaRequiredResponse;

export interface MfaStatusResponse {
  mfa_enabled: boolean;
  mfa_enabled_at: string | null;
  // Count of unused backup codes (Sprint 3.21). Never the codes themselves.
  backup_codes_remaining: number;
}

export interface MfaSetupResponse {
  otpauth_url: string;
  manual_key: string;
  qr_data_url: string;
}

// MFA backup codes (Sprint 3.21). Plaintext codes are returned ONLY here — on
// confirm (initial) and on regenerate — and shown to the user just once.
export interface MfaConfirmResponse extends MfaStatusResponse {
  backup_codes: string[];
}
export interface MfaBackupCodesResponse {
  backup_codes: string[];
  count: number;
}

export interface PublicImportFile {
  id: string;
  nome_original: string;
  mime_type: string;
  extensao: string;
  tamanho_bytes: number;
  sha256: string;
  status: string;
  criado_em: string;
}

export interface UploadImportFileResponse {
  message: string;
  file: PublicImportFile;
}

export interface ListImportFilesResponse {
  files: PublicImportFile[];
}

export type PreviewCell = string | number | boolean | null;
export type PreviewRow = Record<string, PreviewCell>;

export interface PreviewSummary {
  detected_columns: string[];
  total_preview_rows: number;
  preview_limited: boolean;
  warnings: string[];
}

export interface SuggestedMapping {
  nome: string | null;
  telefone: string | null;
  email: string | null;
  cpf: string | null;
  data_nascimento: string | null;
}

export interface ImportPreviewResponse {
  file: PublicImportFile;
  summary: PreviewSummary;
  suggested_mapping: SuggestedMapping;
  rows: PreviewRow[];
}

export interface MappingInput {
  nome?: string | null;
  telefone?: string | null;
  email?: string | null;
  cpf?: string | null;
  data_nascimento?: string | null;
}

export type ValidationSeverity = 'error' | 'warning' | 'duplicate';
export type ValidationField = 'nome' | 'telefone' | 'email' | 'cpf' | 'data_nascimento' | 'row';

export interface ValidationIssue {
  line: number;
  field: ValidationField;
  severity: ValidationSeverity;
  code: string;
  message: string;
}

export interface FieldStat {
  mapped_column: string | null;
  empty: number;
  invalid: number;
}

export interface ValidationSummary {
  total_rows_analyzed: number;
  valid_rows: number;
  rows_with_warnings: number;
  rows_with_errors: number;
  duplicate_groups: number;
  issues_returned: number;
  issues_truncated: boolean;
  validation_limited: boolean;
  warnings: string[];
}

export type ValidationFieldStats = Partial<
  Record<'nome' | 'telefone' | 'email' | 'cpf' | 'data_nascimento', FieldStat>
>;

export interface ImportValidationReport {
  file: PublicImportFile;
  summary: ValidationSummary;
  field_stats: ValidationFieldStats;
  issues: ValidationIssue[];
}

export type ImportSessionStatus =
  | 'validated'
  | 'ready_for_import'
  | 'import_started'
  | 'import_completed'
  | 'cancelled'
  | 'failed';

export interface PublicImportSession {
  id: string;
  import_file_id: string;
  file: PublicImportFile;
  status: ImportSessionStatus;
  mapping: MappingInput;
  validation_summary: ValidationSummary;
  field_stats: ValidationFieldStats;
  issues_sample: ValidationIssue[];
  import_summary: ImportExecutionSummary | null;
  imported_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateImportSessionResponse {
  session: PublicImportSession;
}

export interface ListImportSessionsResponse {
  sessions: PublicImportSession[];
}

export interface GetImportSessionResponse {
  session: PublicImportSession;
}

export type DryRunSeverity = 'error' | 'warning' | 'duplicate';
export type DryRunRowStatus = 'would_import' | 'blocked' | 'needs_review';
export type ContactPresence = 'email' | 'telefone' | 'email_telefone' | 'none';

export interface DryRunIssue {
  line: number;
  severity: DryRunSeverity;
  code: string;
  message: string;
}

export interface DryRunSampleRow {
  line: number;
  status: DryRunRowStatus;
  preview: {
    contato: ContactPresence;
    has_cpf: boolean;
    has_data_nascimento: boolean;
  };
  issues: DryRunIssue[];
}

export interface ImportDryRunReport {
  session_id: string;
  file: PublicImportFile;
  summary: {
    total_rows_analyzed: number;
    would_import_count: number;
    blocked_count: number;
    warning_count: number;
    duplicate_count: number;
    issues_returned: number;
    issues_truncated: boolean;
  };
  issues: DryRunIssue[];
  sample_rows: DryRunSampleRow[];
}

export interface RunImportDryRunResponse {
  report: ImportDryRunReport;
}

export type ImportExecutionStatus = 'completed';

export interface ImportExecutionSummary {
  session_id: string;
  imported_count: number;
  skipped_count: number;
  total_rows_analyzed: number;
  status: ImportExecutionStatus;
  patients_created: number;
  import_max_rows: number;
}

export interface ImportExecutionResult {
  session_id: string;
  status: ImportExecutionStatus;
  summary: ImportExecutionSummary;
}

export interface ExecuteImportResponse {
  result: ImportExecutionResult;
}

export type PatientStatus = 'active' | 'inactive' | 'archived';

export interface PublicPatient {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  cpf_masked: string | null;
  data_nascimento: string | null;
  convenio: string | null;
  numero_carteirinha: string | null;
  status: PatientStatus;
  origem: string;
  import_session_id: string | null;
  // Safe-merge B-safe provenance (Sprint 3.33 backend / 3.34 exposed).
  // Both NULL on records that were never merged. The frontend only badges an
  // archived secondary; we deliberately don't look up the primary's name.
  merged_into_id: string | null;
  merged_at: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface ListPatientsResponse {
  patients: PublicPatient[];
  pagination: {
    limit: number;
    offset: number;
    has_more: boolean;
  };
}

// status filter (Sprint 3.22). Omitted = backend default 'active'. 'all' returns
// every status. Archived patients are excluded from the default listing and the
// agenda picker (which calls listPatients with no status).
export type PatientStatusFilter = PatientStatus | 'all';

export interface ListPatientsParams {
  search?: string;
  limit?: number;
  offset?: number;
  status?: PatientStatusFilter;
}

// Manual patient input (Sprint 3.22). Administrative fields ONLY — no clinical
// data. cpf is sent raw on write and only ever returned masked (cpf_masked).
export interface PatientWritePayload {
  nome: string;
  telefone?: string | null;
  email?: string | null;
  cpf?: string | null;
  data_nascimento?: string | null;
  convenio?: string | null;
  numero_carteirinha?: string | null;
}

export interface PatientResponse {
  patient: PublicPatient;
}

export type DuplicateReason =
  | 'cpf_match'
  | 'email_match'
  | 'telefone_match'
  | 'name_dob_match'
  | 'name_telefone_match'
  | 'name_email_match';

export type DuplicateConfidence = 'high' | 'medium';

export interface DuplicateGroup {
  group_key: string;
  reason: DuplicateReason;
  reasons: DuplicateReason[];
  confidence: DuplicateConfidence;
  count: number;
  patients: PublicPatient[];
}

export interface DuplicateScanResult {
  groups: DuplicateGroup[];
  summary: {
    groups_count: number;
    patients_in_duplicate_groups: number;
    scan_limited: boolean;
  };
}

// Safe duplicate merge B-safe (Sprint 3.33 backend / 3.34 frontend). The backend
// response carries only the updated primary, summary counts and the secondary
// UUIDs the caller already sent — never any data from the secondaries beyond
// their id, and never raw CPF. `filled_fields` lists which administrative
// fields were filled on the primary (names only, never values).
export type MergeFillableField =
  | 'telefone'
  | 'email'
  | 'cpf'
  | 'data_nascimento'
  | 'convenio'
  | 'numero_carteirinha';

export interface PatientMergeResponse {
  patient: PublicPatient;
  merge: {
    merged_count: number;
    moved_appointments_count: number;
    archived_secondary_ids: string[];
    filled_fields: MergeFillableField[];
  };
}

// Retention dry-run (Sprint 2.24/2.26). Read-only preview of cleanup candidates.
// The shape mirrors the backend and deliberately carries NO nome_original /
// nome_interno / path / sha256 / file content / patient data.
export interface RetentionCandidate {
  id: string;
  status: string;
  extensao: string;
  mime_type: string;
  tamanho_bytes: number;
  criado_em: string;
  has_import_session: boolean;
  latest_session_status: string | null;
}

export interface RetentionDryRunResult {
  retention_days: number;
  candidates_count: number;
  scan_limited: boolean;
  candidates: RetentionCandidate[];
}

export interface RetentionDryRunParams {
  retention_days?: number;
  limit?: number;
}

// Administrative Scheduling (Sprint 3.14 backend / 3.15 frontend). Administrative
// data only — NO clinical fields. administrative_notes is short/administrative.
export interface PublicClinicProfessional {
  id: string;
  name: string;
  specialty_label: string | null;
  is_active: boolean;
  criado_em: string;
  atualizado_em: string;
}

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'cancelled'
  | 'rescheduled'
  | 'no_show'
  | 'completed';

export interface PublicAppointment {
  id: string;
  patient_id: string;
  professional_id: string | null;
  service_id: string | null;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  administrative_notes: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface ListClinicProfessionalsResponse {
  professionals: PublicClinicProfessional[];
}

export interface ClinicProfessionalResponse {
  professional: PublicClinicProfessional;
}

export interface ListAppointmentsParams {
  date?: string;
  professional_id?: string;
  service_id?: string;
  status?: AppointmentStatus;
}

export interface ListAppointmentsResponse {
  appointments: PublicAppointment[];
}

export interface AppointmentResponse {
  appointment: PublicAppointment;
}

export interface CreateAppointmentPayload {
  patient_id: string;
  professional_id?: string | null;
  service_id?: string | null;
  starts_at: string;
  ends_at: string;
  administrative_notes?: string | null;
}

// --- Clinical Encounters v0.1 types (Sprint 4.2C — ADR 0010) ----------------
// SECURITY: These types carry clinical content. Never pass instances to
// console.log, localStorage, sessionStorage, or URL parameters.

export type ClinicalEncounterStatus = 'active' | 'canceled';
export type ClinicalRoleName = 'profissional_clinico' | 'gestor_clinica';
export type ClinicalCancelReasonCode =
  | 'duplicated'
  | 'wrong_patient'
  | 'data_error'
  | 'other';
export type ClinicalNoteRectifyCode =
  | 'typo'
  | 'clinical_correction'
  | 'add_info'
  | 'other';

// Metadata-only: no 5 textual clinical fields, no cancel_reason_text, no notes.
// Returned by GET /clinical/encounters and GET /patients/:id/clinical-timeline.
export interface PublicClinicalEncounterListItem {
  id: string;
  clinica_id: string;
  patient_id: string;
  attending_user_id: string;
  professional_id: string | null;
  appointment_id: string | null;
  started_at: string;
  ended_at: string | null;
  status: ClinicalEncounterStatus;
  cancel_reason_code: ClinicalCancelReasonCode | null;
  created_at: string;
  updated_at: string;
}

// Full encounter metadata (list item + cancel_reason_text).
// Returned by POST /clinical/encounters, GET /clinical/encounters/:id,
// PATCH /clinical/encounters/:id/cancel.
export interface PublicClinicalEncounter extends PublicClinicalEncounterListItem {
  cancel_reason_text: string | null;
}

// Clinical note. internal_note is null when the backend redacted it for
// non-author/non-owner/non-gestor readers. The frontend must treat null as
// "not visible" — never infer content or show a misleading placeholder.
export interface PublicClinicalNote {
  id: string;
  encounter_id: string;
  author_user_id: string;
  chief_complaint: string | null;
  anamnesis: string | null;
  evolution: string | null;
  plan: string | null;
  internal_note: string | null;
  revises_note_id: string | null;
  rectification_reason_code: ClinicalNoteRectifyCode | null;
  created_at: string;
}

// Active clinical role grant. Does not include user name/email — the caller
// must join with clinic members list to display them.
export interface PublicClinicalRoleGrant {
  id: string;
  user_id: string;
  role: ClinicalRoleName;
  granted_at: string;
  granted_by_user_id: string | null;
}

// Sprint 4.2E — LGPD-art.18 transparency: clinical read audit entry.
// ip/user_agent are intentionally excluded from the API response (forensic
// metadata kept server-side only). No clinical content is ever stored in this
// table; what you see here is purely access metadata.
export interface PublicClinicalReadAuditEntry {
  id: string;
  acao: string;
  recurso: string;
  recurso_id: string | null;
  paciente_id: string | null;
  paciente_nome: string | null;
  usuario_id: string | null;
  usuario_nome: string | null;
  usuario_email: string | null;
  papel_at_read: string;
  request_id: string | null;
  criado_em: string;
}

export interface ClinicalReadAuditFilters {
  patient_id?: string;
  user_id?: string;
  acao?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

export interface CreateClinicalEncounterPayload {
  patient_id: string;
  started_at: string;
  ended_at?: string | null;
  initial_note?: {
    chief_complaint?: string | null;
    anamnesis?: string | null;
    evolution?: string | null;
    plan?: string | null;
    internal_note?: string | null;
  } | null;
}

export interface CancelClinicalEncounterPayload {
  reason_code: ClinicalCancelReasonCode;
  reason_text?: string | null;
}

export interface AddClinicalNotePayload {
  chief_complaint?: string | null;
  anamnesis?: string | null;
  evolution?: string | null;
  plan?: string | null;
  internal_note?: string | null;
  revises_note_id?: string | null;
  rectification_reason_code?: ClinicalNoteRectifyCode | null;
}

// --- Clinical Documents v0.1 types (Sprint 4.3C — ADR 0011) -----------------
// SECURITY: body and metadata_json carry clinical content. Never pass document
// detail instances to console.log, localStorage, sessionStorage, or URL params.

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

// Metadata-only projection: no body, no metadata_json, no cancel_reason_text.
// Returned by GET /clinical/documents and GET /patients/:id/documents.
export interface PublicClinicalDocumentListItem {
  id: string;
  clinica_id: string;
  patient_id: string;
  encounter_id: string | null;
  author_user_id: string;
  doc_type: ClinicalDocumentType;
  title: string;
  status: ClinicalDocumentStatus;
  finalized_at: string | null;
  finalized_by_user_id: string | null;
  canceled_at: string | null;
  canceled_by_user_id: string | null;
  cancel_reason_code: ClinicalDocumentCancelReasonCode | null;
  supersedes_document_id: string | null;
  created_at: string;
  updated_at: string;
}

// Full detail: adds body, metadata_json, cancel_reason_text.
// Returned by POST (create), GET /:id (detail), PATCH (update), /finalize, /cancel.
export interface PublicClinicalDocument extends PublicClinicalDocumentListItem {
  body: string | null;
  metadata_json: Record<string, unknown> | null;
  cancel_reason_text: string | null;
}

export interface CreateClinicalDocumentPayload {
  patient_id: string;
  encounter_id?: string | null;
  doc_type: ClinicalDocumentType;
  title?: string;
  body?: string | null;
  metadata_json?: Record<string, unknown> | null;
  supersedes_document_id?: string | null;
}

export interface UpdateClinicalDocumentPayload {
  title?: string;
  body?: string | null;
  metadata_json?: Record<string, unknown> | null;
  encounter_id?: string | null;
}

export interface CancelClinicalDocumentPayload {
  reason_code: ClinicalDocumentCancelReasonCode;
  reason_text?: string | null;
}

// --- Financial Module v0.1 types (Sprint 4.4C — ADR 0012) -------------------
// SECURITY: notes and cancel_reason carry free-text. Never pass FinancialChargeDetail
// instances to console.log, localStorage, sessionStorage, or URL params.
// Notes WARNING enforced in UI: no clinical content (diagnosis, complaint,
// prescription, clinical procedure) in financial notes (ADR 0012 §10).

export type FinancialChargeStatus = 'pending' | 'paid' | 'canceled';

export type FinancialPaymentMethod =
  | 'cash'
  | 'pix'
  | 'card'
  | 'bank_transfer'
  | 'other';

// List projection: no notes, no cancel_reason (security — notes in detail only).
export interface FinancialChargeListItem {
  id: string;
  clinica_id: string;
  patient_id: string;
  appointment_id: string | null;
  service_id: string | null;
  created_by_user_id: string;
  description: string;
  amount_cents: number;
  currency: 'BRL';
  due_date: string | null;
  status: FinancialChargeStatus;
  paid_at: string | null;
  paid_by_user_id: string | null;
  payment_method: FinancialPaymentMethod | null;
  canceled_at: string | null;
  canceled_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  // Convênios v0.1 (Sprint 4.7C — ADR 0016). All nullable — retrocompat.
  payer_type: 'private' | 'insurance' | 'mixed' | null;
  insurance_provider_id: string | null;
  patient_insurance_id: string | null;
  copay_amount_cents: number | null;
  insurance_amount_cents: number | null;
}

// Detail projection: adds notes and cancel_reason.
// Only returned by POST (create), GET /:id, PATCH, /mark-paid, /cancel.
export interface FinancialChargeDetail extends FinancialChargeListItem {
  notes: string | null;
  cancel_reason: string | null;
}

export interface FinancialSummary {
  pending_amount_cents: number;
  pending_count: number;
  overdue_amount_cents: number;
  overdue_count: number;
  paid_amount_cents: number;
  paid_count: number;
}

export interface FinancialChargeFilters {
  patient_id?: string;
  appointment_id?: string;
  status?: FinancialChargeStatus;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

export type FinancialPayerType = 'private' | 'insurance' | 'mixed';

export interface CreateFinancialChargePayload {
  patient_id: string;
  description: string;
  amount_cents: number;
  due_date?: string | null;
  notes?: string | null;
  appointment_id?: string | null;
  service_id?: string | null;
  // Convênios v0.1 (Sprint 4.7C — ADR 0016). All optional.
  payer_type?: FinancialPayerType | null;
  insurance_provider_id?: string | null;
  patient_insurance_id?: string | null;
  copay_amount_cents?: number | null;
  insurance_amount_cents?: number | null;
}

export interface UpdateFinancialChargePayload {
  description?: string;
  amount_cents?: number;
  due_date?: string | null;
  notes?: string | null;
  appointment_id?: string | null;
  service_id?: string | null;
  // Convênios v0.1 (Sprint 4.7C — ADR 0016). All optional.
  payer_type?: FinancialPayerType | null;
  insurance_provider_id?: string | null;
  patient_insurance_id?: string | null;
  copay_amount_cents?: number | null;
  insurance_amount_cents?: number | null;
}

export interface MarkFinancialChargePaidPayload {
  payment_method: FinancialPaymentMethod;
  paid_at?: string | null;
}

export interface CancelFinancialChargePayload {
  cancel_reason?: string | null;
}

// --- Management Reports v0.1 types (Sprint 4.5C — ADR 0014) -----------------
// Backend é a fonte da verdade; estes tipos refletem exatamente o payload de
// `backend/src/services/reportsService.ts`. Por desenho, NENHUM relatório
// retorna PII (nome, CPF, e-mail, telefone, endereço, notes, cancel_reason,
// description, administrative_notes, dados clínicos).

export type ReportPeriodPreset = 'today' | 'last7' | 'currentMonth' | 'custom';

export interface ReportsFilters {
  date_from?: string;
  date_to?: string;
  professional_id?: string; // R-A e R-D
  no_appt_days?: number;     // R-C
}

export interface AppointmentReportResponse {
  report: 'appointments';
  date_from: string;
  date_to: string;
  professional_id: string | null;
  data: {
    total: number;
    scheduled: number;
    confirmed: number;
    completed: number;
    cancelled: number;
    rescheduled: number;
    no_show: number;
    attendance_rate: number;
  };
  attention: Array<{
    appointment_id: string;
    starts_at: string;
    status: string;
  }>;
  generated_at: string;
}

export interface FinancialReportResponse {
  report: 'financial';
  date_from: string;
  date_to: string;
  data: {
    received_cents: number;
    pending_cents: number;
    overdue_cents: number;
    canceled_cents: number;
    count_paid: number;
    count_pending: number;
    count_overdue: number;
    count_canceled: number;
    by_payment_method: Array<{
      method: FinancialPaymentMethod;
      total_cents: number;
      count: number;
    }>;
  };
  generated_at: string;
}

export interface PatientsReportResponse {
  report: 'patients';
  date_from: string;
  date_to: string;
  no_appt_days: number;
  data: {
    total_active: number;
    total_archived: number;
    new_in_period: number;
    with_appointment_in_period: number;
    without_recent_appointment: number;
  };
  generated_at: string;
}

export interface AgendaFinancialReportResponse {
  report: 'agenda-financial';
  date_from: string;
  date_to: string;
  professional_id: string | null;
  data: {
    appointments_total: number;
    with_pending_charge: number;
    with_paid_charge: number;
    with_overdue_charge: number;
    with_canceled_charge: number;
    without_charge: number;
    cancelled_with_pending: number;
    charge_canceled_appt_active: number;
  };
  generated_at: string;
}

// --- Catálogo de Serviços v0.1 types (Sprint 4.6C — ADR 0015) ---------------
// ADMINISTRATIVE / COMMERCIAL label only. NEVER contains clinical content;
// price_cents is reference-only and is NEVER auto-propagated to amount_cents;
// duration_minutes is a UI suggestion, NEVER auto-applied to starts_at/ends_at.

export interface ClinicService {
  id: string;
  clinica_id: string;
  name: string;
  category: string | null;
  description: string | null;
  duration_minutes: number | null;
  price_cents: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProfessionalServiceLink {
  professional_id: string;
  service_id: string;
  clinica_id: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ListClinicServicesParams {
  active?: boolean;
  limit?: number;
  offset?: number;
  professional_id?: string;
}

export interface CreateClinicServicePayload {
  name: string;
  category?: string | null;
  description?: string | null;
  duration_minutes?: number | null;
  price_cents?: number | null;
}

export interface UpdateClinicServicePayload {
  name?: string;
  category?: string | null;
  description?: string | null;
  duration_minutes?: number | null;
  price_cents?: number | null;
}

// --- Estoque v0.1 types (Sprint 4.8C — ADR 0017) -----------------------------
// SECURITY: notes (item) and reason (movement) are ADMINISTRATIVE free text.
// - Never log payloads containing these fields.
// - Never save in localStorage/sessionStorage.
// - Never include in URL params.
// - Never put patient names / diagnosis / clinical data in these fields.
// current_quantity is NEVER set directly by the client — only the backend
// movement transaction changes it. There is no field to edit it on the item.

export type InventoryMovementType = 'entry' | 'exit' | 'adjustment' | 'loss';

export interface InventoryItem {
  id: string;
  clinica_id: string;
  name: string;
  category: string | null;
  unit: string;
  current_quantity: number;
  minimum_quantity: number;
  location: string | null;
  notes: string | null;
  active: boolean;
  // Derived by the backend: minimum_quantity > 0 && current_quantity < minimum_quantity.
  low_stock: boolean;
  created_at: string;
  updated_at: string;
}

export interface InventoryMovement {
  id: string;
  clinica_id: string;
  item_id: string;
  movement_type: InventoryMovementType;
  quantity_delta: number;
  reason: string | null;
  created_by_user_id: string | null;
  created_at: string;
}

export interface ListInventoryItemsParams {
  active?: boolean;
  low_stock?: boolean;
  query?: string;
  category?: string;
  limit?: number;
  offset?: number;
}

export interface ListInventoryMovementsParams {
  item_id?: string;
  movement_type?: InventoryMovementType;
  limit?: number;
  offset?: number;
}

export interface CreateInventoryItemPayload {
  name: string;
  category?: string | null;
  unit: string;
  minimum_quantity?: number;
  location?: string | null;
  notes?: string | null;
}

export interface UpdateInventoryItemPayload {
  name?: string;
  category?: string | null;
  unit?: string;
  minimum_quantity?: number;
  location?: string | null;
  notes?: string | null;
}

export interface CreateInventoryMovementPayload {
  movement_type: InventoryMovementType;
  // Signed delta: entry > 0; exit/loss < 0; adjustment != 0. The UI computes
  // the sign from the chosen movement type so the user types a magnitude.
  quantity_delta: number;
  reason?: string | null;
}

// --- Convênios v0.1 types (Sprint 4.7C — ADR 0016) ---------------------------
// SECURITY: member_number and holder_name are PII.
// - Never log payloads containing these fields.
// - Never save in localStorage/sessionStorage.
// - Never include in URL params.
// - member_number is returned MASKED (****1234) in list; RAW in detail only.
// - member_number RAW must not be rendered in list cards.

export interface InsuranceProvider {
  id: string;
  clinica_id: string;
  name: string;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface InsurancePlan {
  id: string;
  clinica_id: string;
  provider_id: string;
  name: string;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

// List projection: member_number_masked only, no notes.
export interface PatientInsuranceListItem {
  id: string;
  clinica_id: string;
  patient_id: string;
  provider_id: string | null;
  plan_id: string | null;
  member_number_masked: string | null;
  holder_name: string | null;
  valid_until: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

// Detail projection: adds raw member_number and notes.
export interface PatientInsurance extends PatientInsuranceListItem {
  member_number: string | null;
  notes: string | null;
}

export interface ServiceInsurancePrice {
  id: string;
  clinica_id: string;
  service_id: string;
  provider_id: string;
  plan_id: string | null;
  reference_price_cents: number | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateInsuranceProviderPayload {
  name: string;
  notes?: string | null;
}

export interface UpdateInsuranceProviderPayload {
  name?: string;
  notes?: string | null;
}

export interface CreateInsurancePlanPayload {
  provider_id: string;
  name: string;
  notes?: string | null;
}

export interface UpdateInsurancePlanPayload {
  name?: string;
  notes?: string | null;
}

export interface CreatePatientInsurancePayload {
  provider_id: string;
  plan_id?: string | null;
  member_number?: string | null;
  holder_name?: string | null;
  valid_until?: string | null;
  notes?: string | null;
}

export interface UpdatePatientInsurancePayload {
  provider_id?: string;
  plan_id?: string | null;
  member_number?: string | null;
  holder_name?: string | null;
  valid_until?: string | null;
  notes?: string | null;
}

export interface CreateServiceInsurancePricePayload {
  service_id: string;
  provider_id: string;
  plan_id?: string | null;
  reference_price_cents?: number | null;
  notes?: string | null;
}

export interface UpdateServiceInsurancePricePayload {
  reference_price_cents?: number | null;
  notes?: string | null;
}

// --- Billing / Planos / Entitlements v0.1 types (Sprint 5.1C — ADR 0018) ------
// COMMERCIAL layer — the SaaS charging the clinic. NOT the clinic's internal
// financial module (ADR 0012 / financial_charges).
//
// SECURITY: payload carries no PII, no monetary values, no provider IDs.
// Never log these types. Backend is the authoritative source for all access
// control — the frontend only presents what the backend returns.

export type PlanCode = 'essential' | 'professional' | 'assisted_pilot';

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'suspended'
  | 'canceled'
  | 'manual_pilot';

export interface SoftLockFlags {
  can_create_new_records: boolean;
  read_only_mode: boolean;
  export_allowed: boolean;
  // Stable machine-readable reason code. null = no lock active.
  lock_reason: string | null;
}

export interface EffectiveEntitlement {
  feature_key: string;
  enabled: boolean;
  // Numeric for limit.* keys; null for module.* keys or unlimited limits.
  limit_value: number | null;
  source: 'plan' | 'override' | 'pilot';
}

export interface BillingEntitlements {
  modules: Record<string, boolean>;
  limits: Record<string, number | null>;
  features: EffectiveEntitlement[];
}

export interface BillingStatus {
  // false = no subscription row exists yet; values below are synthesized defaults.
  provisioned: boolean;
  plan_code: PlanCode;
  status: SubscriptionStatus;
  // null during the mock phase (no real gateway bound).
  provider: string | null;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  grace_until: string | null;
  canceled_at: string | null;
  entitlements: BillingEntitlements;
  soft_lock: SoftLockFlags;
}

export interface BillingStatusResponse {
  billing: BillingStatus;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.status = status;
    this.code = body.code;
    this.details = body.details;
  }
}

interface FetchOptions {
  method: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  token?: string;
}

// Compact querystring builder for the reports endpoints — omits empty/undefined
// values so the backend defaults apply. Token never goes in URL.
function buildReportsQuery(
  params: Record<string, string | number | undefined | null>,
): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const str = typeof value === 'string' ? value : String(value);
    if (str.length === 0) continue;
    usp.set(key, str);
  }
  return usp.toString();
}

async function apiFetch<T>(path: string, opts: FetchOptions): Promise<T> {
  // Demo guardrail (Sprint 5.0E): in guided-demo mode, refuse mutating calls
  // before they ever reach the network and surface a humanized message. Reads
  // pass through untouched. Not a security control — see services/demoMode.ts.
  if (isWriteBlockedInDemo(path, opts.method)) {
    notifyDemoBlocked();
    throw new ApiError(403, { code: 'demo_action_blocked', message: DEMO_BLOCKED_MESSAGE });
  }

  const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  // For multipart (FormData) we let the browser set Content-Type so it can add
  // the correct boundary; only JSON bodies get an explicit Content-Type.
  if (opts.body !== undefined && !isForm) {
    headers['Content-Type'] = 'application/json';
  }
  if (opts.token) {
    headers.Authorization = `Bearer ${opts.token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: opts.method,
      headers,
      body:
        opts.body === undefined
          ? undefined
          : isForm
            ? (opts.body as FormData)
            : JSON.stringify(opts.body),
    });
  } catch {
    // Network-level failure (offline, DNS, CORS preflight rejected before headers).
    // We deliberately do NOT forward the raw error to avoid leaking internals.
    throw new ApiError(0, {
      code: 'network_error',
      message: 'Não foi possível conectar ao servidor. Tente novamente em instantes.',
    });
  }

  // Empty body (e.g., 204) — only relevant if we ever add such endpoints.
  const text = await response.text();
  let parsed: unknown = null;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ApiError(response.status, {
        code: 'invalid_response',
        message: 'Resposta inesperada do servidor.',
      });
    }
  }

  if (!response.ok) {
    const body = (parsed as { error?: ApiErrorBody } | null)?.error;
    if (body && typeof body.code === 'string' && typeof body.message === 'string') {
      throw new ApiError(response.status, body);
    }
    throw new ApiError(response.status, {
      code: 'unknown_error',
      message: 'Erro inesperado. Tente novamente.',
    });
  }

  return parsed as T;
}

export const api = {
  register(payload: RegisterPayload): Promise<RegisterResponse> {
    return apiFetch<RegisterResponse>(
      '/auth/register',
      { method: 'POST', body: { ...payload, account_type: 'owner' } },
    );
  },

  // Staff self-registration (Sprint 3.24): the backend creates a 'secretaria'
  // user with NO clinic; they must request to join one with an invite code.
  registerStaff(payload: RegisterStaffPayload): Promise<RegisterStaffResponse> {
    return apiFetch<RegisterStaffResponse>(
      '/auth/register',
      { method: 'POST', body: { ...payload, account_type: 'staff' } },
    );
  },

  // Returns a normal LoginResponse, or { mfa_required, mfa_challenge_token } when
  // the account has MFA enabled (no session token issued yet).
  login(payload: LoginPayload): Promise<LoginOutcome> {
    return apiFetch<LoginOutcome>('/auth/login', { method: 'POST', body: payload });
  },

  // Guided demo (Sprint 5.0E). No credentials in the body — the backend issues a
  // session for the fixed pre-seeded demo owner. Only enabled when the server has
  // ALLOW_DEMO_LOGIN=true (otherwise 403 demo_disabled).
  demoLogin(): Promise<LoginResponse> {
    return apiFetch<LoginResponse>('/auth/demo-login', { method: 'POST' });
  },

  verifyMfaLogin(challenge_token: string, code: string): Promise<LoginResponse> {
    return apiFetch<LoginResponse>('/auth/mfa/verify-login', {
      method: 'POST',
      body: { challenge_token, code },
    });
  },

  getMfaStatus(token: string): Promise<MfaStatusResponse> {
    return apiFetch<MfaStatusResponse>('/auth/mfa/status', { method: 'GET', token });
  },

  setupMfa(token: string): Promise<MfaSetupResponse> {
    return apiFetch<MfaSetupResponse>('/auth/mfa/setup', { method: 'POST', token });
  },

  // Confirms MFA setup. Response includes the first set of backup codes (shown once).
  confirmMfa(token: string, code: string): Promise<MfaConfirmResponse> {
    return apiFetch<MfaConfirmResponse>('/auth/mfa/confirm', {
      method: 'POST',
      body: { code },
      token,
    });
  },

  disableMfa(token: string, code: string): Promise<MfaStatusResponse> {
    return apiFetch<MfaStatusResponse>('/auth/mfa/disable', {
      method: 'POST',
      body: { code },
      token,
    });
  },

  // Regenerates backup codes (requires a valid current TOTP code). Returns the new
  // codes once; the previous set is invalidated server-side.
  regenerateMfaBackupCodes(token: string, code: string): Promise<MfaBackupCodesResponse> {
    return apiFetch<MfaBackupCodesResponse>('/auth/mfa/backup-codes/regenerate', {
      method: 'POST',
      body: { code },
      token,
    });
  },

  getMe(token: string): Promise<MeResponse> {
    return apiFetch<MeResponse>('/auth/me', { method: 'GET', token });
  },

  uploadImportFile(token: string, file: File): Promise<UploadImportFileResponse> {
    const form = new FormData();
    form.append('file', file);
    return apiFetch<UploadImportFileResponse>('/import-files/upload', {
      method: 'POST',
      body: form,
      token,
    });
  },

  listImportFiles(token: string): Promise<ListImportFilesResponse> {
    return apiFetch<ListImportFilesResponse>('/import-files', { method: 'GET', token });
  },

  getImportFilePreview(token: string, fileId: string): Promise<ImportPreviewResponse> {
    return apiFetch<ImportPreviewResponse>(
      `/import-files/${encodeURIComponent(fileId)}/preview`,
      { method: 'GET', token },
    );
  },

  validateImportFile(
    token: string,
    fileId: string,
    mapping: MappingInput,
  ): Promise<ImportValidationReport> {
    return apiFetch<ImportValidationReport>(
      `/import-files/${encodeURIComponent(fileId)}/validate`,
      { method: 'POST', body: { mapping }, token },
    );
  },

  createImportSession(
    token: string,
    importFileId: string,
    mapping: MappingInput,
  ): Promise<CreateImportSessionResponse> {
    return apiFetch<CreateImportSessionResponse>('/import-sessions', {
      method: 'POST',
      body: { import_file_id: importFileId, mapping },
      token,
    });
  },

  listImportSessions(token: string): Promise<ListImportSessionsResponse> {
    return apiFetch<ListImportSessionsResponse>('/import-sessions', { method: 'GET', token });
  },

  getImportSession(token: string, sessionId: string): Promise<GetImportSessionResponse> {
    return apiFetch<GetImportSessionResponse>(
      `/import-sessions/${encodeURIComponent(sessionId)}`,
      { method: 'GET', token },
    );
  },

  runImportDryRun(token: string, sessionId: string): Promise<RunImportDryRunResponse> {
    return apiFetch<RunImportDryRunResponse>(
      `/import-sessions/${encodeURIComponent(sessionId)}/dry-run`,
      { method: 'POST', token },
    );
  },

  markImportSessionReady(
    token: string,
    sessionId: string,
  ): Promise<GetImportSessionResponse> {
    return apiFetch<GetImportSessionResponse>(
      `/import-sessions/${encodeURIComponent(sessionId)}/mark-ready`,
      { method: 'POST', token },
    );
  },

  executeImportSession(
    token: string,
    sessionId: string,
  ): Promise<ExecuteImportResponse> {
    return apiFetch<ExecuteImportResponse>(
      `/import-sessions/${encodeURIComponent(sessionId)}/import`,
      { method: 'POST', token },
    );
  },

  listPatients(token: string, params: ListPatientsParams = {}): Promise<ListPatientsResponse> {
    const query = new URLSearchParams();
    if (params.search && params.search.trim().length > 0) {
      query.set('search', params.search.trim());
    }
    if (params.limit !== undefined) query.set('limit', String(params.limit));
    if (params.offset !== undefined) query.set('offset', String(params.offset));
    if (params.status) query.set('status', params.status);
    const qs = query.toString();
    return apiFetch<ListPatientsResponse>(`/patients${qs ? `?${qs}` : ''}`, {
      method: 'GET',
      token,
    });
  },

  // Manual patient CRUD (Sprint 3.22). Administrative fields only. Create + edit
  // are allowed for owner + secretaria; archive + restore are owner-only (the
  // backend returns 403 forbidden_role otherwise).
  createPatient(token: string, payload: PatientWritePayload): Promise<PatientResponse> {
    return apiFetch<PatientResponse>('/patients', { method: 'POST', body: payload, token });
  },

  updatePatient(
    token: string,
    id: string,
    payload: PatientWritePayload,
  ): Promise<PatientResponse> {
    return apiFetch<PatientResponse>(`/patients/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: payload,
      token,
    });
  },

  archivePatient(token: string, id: string): Promise<PatientResponse> {
    return apiFetch<PatientResponse>(`/patients/${encodeURIComponent(id)}/archive`, {
      method: 'PATCH',
      token,
    });
  },

  restorePatient(token: string, id: string): Promise<PatientResponse> {
    return apiFetch<PatientResponse>(`/patients/${encodeURIComponent(id)}/restore`, {
      method: 'PATCH',
      token,
    });
  },

  listPatientDuplicates(token: string): Promise<DuplicateScanResult> {
    return apiFetch<DuplicateScanResult>('/patients/duplicates', { method: 'GET', token });
  },

  // Safe duplicate merge B-safe (Sprint 3.34). Owner-only at the API; the UI
  // hides the action for other roles. Moves the secondaries' appointments to
  // the primary, fills only blank fields on the primary (never overwrites),
  // archives each secondary, and writes one audit row per pair. The response
  // never carries raw CPF or per-secondary patient values.
  mergePatients(
    token: string,
    primaryId: string,
    secondaryIds: string[],
  ): Promise<PatientMergeResponse> {
    return apiFetch<PatientMergeResponse>(
      `/patients/${encodeURIComponent(primaryId)}/merge`,
      { method: 'POST', body: { secondary_ids: secondaryIds }, token },
    );
  },

  // --- Team management — clinic join requests (Sprint 3.24) -------------------
  // No public clinic search: a secretaria joins by an invite code the owner shares.
  // Errors at the join step are deliberately generic ('invalid_invite') so a
  // caller cannot probe which clinic exists.

  // Owner-only. Returns the clinic's invite code + clinic name (to share out-of-band).
  getClinicInviteCode(token: string): Promise<InviteCodeResponse> {
    return apiFetch<InviteCodeResponse>('/clinics/invite-code', { method: 'GET', token });
  },

  // Owner-only (Sprint 3.26). Rotates the clinic's invite code. The old code
  // stops working for new join requests as soon as the server commits. Pending
  // requests already submitted with the old code are intentionally preserved.
  regenerateClinicInviteCode(token: string): Promise<InviteCodeResponse> {
    return apiFetch<InviteCodeResponse>('/clinics/invite-code/regenerate', {
      method: 'POST',
      token,
    });
  },

  // Staff (no clinic yet). The optional clinic_name is a confirmation only;
  // mismatch → same generic invalid_invite error.
  createClinicJoinRequest(
    token: string,
    payload: { invite_code: string; clinic_name?: string; message?: string },
  ): Promise<{ request: MyJoinRequest }> {
    return apiFetch<{ request: MyJoinRequest }>('/clinic-join-requests', {
      method: 'POST',
      body: payload,
      token,
    });
  },

  listMyJoinRequests(token: string): Promise<{ requests: MyJoinRequest[] }> {
    return apiFetch<{ requests: MyJoinRequest[] }>('/clinic-join-requests/me', {
      method: 'GET',
      token,
    });
  },

  cancelMyJoinRequest(token: string, id: string): Promise<{ request: MyJoinRequest }> {
    return apiFetch<{ request: MyJoinRequest }>(
      `/clinic-join-requests/${encodeURIComponent(id)}/cancel`,
      { method: 'PATCH', token },
    );
  },

  // Owner-only. Returns pending requests for the owner's own clinic.
  listPendingJoinRequests(token: string): Promise<{ requests: PendingJoinRequest[] }> {
    return apiFetch<{ requests: PendingJoinRequest[] }>(
      '/clinic-join-requests/pending',
      { method: 'GET', token },
    );
  },

  approveJoinRequest(token: string, id: string): Promise<{ status: 'approved' }> {
    return apiFetch<{ status: 'approved' }>(
      `/clinic-join-requests/${encodeURIComponent(id)}/approve`,
      { method: 'POST', token },
    );
  },

  rejectJoinRequest(token: string, id: string): Promise<{ status: 'rejected' }> {
    return apiFetch<{ status: 'rejected' }>(
      `/clinic-join-requests/${encodeURIComponent(id)}/reject`,
      { method: 'POST', token },
    );
  },

  // --- Team members (Sprint 3.25) --------------------------------------------
  // Owner-only. Lists active + removed members of the owner's clinic.
  listClinicMembers(token: string): Promise<{ members: ClinicMember[] }> {
    return apiFetch<{ members: ClinicMember[] }>('/clinic-members', {
      method: 'GET',
      token,
    });
  },

  // Owner-only. Removes a member from the clinic (sets users.clinica_id=NULL +
  // history row). Refuses self-deactivation and owner-deactivation server-side.
  deactivateClinicMember(token: string, userId: string): Promise<{ status: 'deactivated' }> {
    return apiFetch<{ status: 'deactivated' }>(
      `/clinic-members/${encodeURIComponent(userId)}/deactivate`,
      { method: 'PATCH', token },
    );
  },

  // --- Administrative Scheduling (Sprint 3.15) ---------------------------------

  listClinicProfessionals(
    token: string,
    params: { active?: boolean } = {},
  ): Promise<ListClinicProfessionalsResponse> {
    const query = new URLSearchParams();
    if (params.active !== undefined) query.set('active', String(params.active));
    const qs = query.toString();
    return apiFetch<ListClinicProfessionalsResponse>(
      `/clinic-professionals${qs ? `?${qs}` : ''}`,
      { method: 'GET', token },
    );
  },

  createClinicProfessional(
    token: string,
    payload: { name: string; specialty_label?: string | null },
  ): Promise<ClinicProfessionalResponse> {
    return apiFetch<ClinicProfessionalResponse>('/clinic-professionals', {
      method: 'POST',
      body: payload,
      token,
    });
  },

  updateClinicProfessional(
    token: string,
    id: string,
    payload: { name?: string; specialty_label?: string | null; is_active?: boolean },
  ): Promise<ClinicProfessionalResponse> {
    return apiFetch<ClinicProfessionalResponse>(
      `/clinic-professionals/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: payload, token },
    );
  },

  deactivateClinicProfessional(token: string, id: string): Promise<ClinicProfessionalResponse> {
    return apiFetch<ClinicProfessionalResponse>(
      `/clinic-professionals/${encodeURIComponent(id)}/deactivate`,
      { method: 'PATCH', token },
    );
  },

  listAppointments(
    token: string,
    params: ListAppointmentsParams = {},
  ): Promise<ListAppointmentsResponse> {
    const query = new URLSearchParams();
    if (params.date) query.set('date', params.date);
    if (params.professional_id) query.set('professional_id', params.professional_id);
    if (params.service_id) query.set('service_id', params.service_id);
    if (params.status) query.set('status', params.status);
    const qs = query.toString();
    return apiFetch<ListAppointmentsResponse>(`/appointments${qs ? `?${qs}` : ''}`, {
      method: 'GET',
      token,
    });
  },

  createAppointment(
    token: string,
    payload: CreateAppointmentPayload,
  ): Promise<AppointmentResponse> {
    return apiFetch<AppointmentResponse>('/appointments', {
      method: 'POST',
      body: payload,
      token,
    });
  },

  updateAppointmentStatus(
    token: string,
    id: string,
    status: AppointmentStatus,
  ): Promise<AppointmentResponse> {
    return apiFetch<AppointmentResponse>(
      `/appointments/${encodeURIComponent(id)}/status`,
      { method: 'PATCH', body: { status }, token },
    );
  },

  rescheduleAppointment(
    token: string,
    id: string,
    payload: { starts_at: string; ends_at: string },
  ): Promise<AppointmentResponse> {
    return apiFetch<AppointmentResponse>(
      `/appointments/${encodeURIComponent(id)}/reschedule`,
      { method: 'PATCH', body: payload, token },
    );
  },

  // --- Clinical Encounters v0.1 (Sprint 4.2C — ADR 0010) --------------------
  // SECURITY: Never log payloads from these functions. Clinical content must
  // not appear in the browser console, localStorage, or sessionStorage.
  // The backend is the authoritative source of authorization; never bypass a
  // 403 with a frontend fallback.

  listClinicalTimeline(
    token: string,
    patientId: string,
  ): Promise<{ encounters: PublicClinicalEncounterListItem[] }> {
    return apiFetch(`/patients/${encodeURIComponent(patientId)}/clinical-timeline`, {
      method: 'GET',
      token,
    });
  },

  getClinicalEncounterDetail(
    token: string,
    id: string,
  ): Promise<{ encounter: PublicClinicalEncounter; notes: PublicClinicalNote[] }> {
    return apiFetch(`/clinical/encounters/${encodeURIComponent(id)}`, {
      method: 'GET',
      token,
    });
  },

  createClinicalEncounter(
    token: string,
    payload: CreateClinicalEncounterPayload,
  ): Promise<{ encounter: PublicClinicalEncounter }> {
    return apiFetch('/clinical/encounters', { method: 'POST', body: payload, token });
  },

  cancelClinicalEncounter(
    token: string,
    id: string,
    payload: CancelClinicalEncounterPayload,
  ): Promise<{ encounter: PublicClinicalEncounter }> {
    return apiFetch(`/clinical/encounters/${encodeURIComponent(id)}/cancel`, {
      method: 'PATCH',
      body: payload,
      token,
    });
  },

  addClinicalNote(
    token: string,
    encounterId: string,
    payload: AddClinicalNotePayload,
  ): Promise<{ note: PublicClinicalNote }> {
    return apiFetch(`/clinical/encounters/${encodeURIComponent(encounterId)}/notes`, {
      method: 'POST',
      body: payload,
      token,
    });
  },

  listClinicalRoleGrants(token: string): Promise<{ grants: PublicClinicalRoleGrant[] }> {
    return apiFetch('/clinical/roles', { method: 'GET', token });
  },

  grantClinicalRole(
    token: string,
    payload: { user_id: string; role: ClinicalRoleName },
  ): Promise<{ grant: PublicClinicalRoleGrant }> {
    return apiFetch('/clinical/roles/grant', { method: 'POST', body: payload, token });
  },

  revokeClinicalRole(token: string, grantId: string): Promise<{ status: 'revoked' }> {
    return apiFetch('/clinical/roles/revoke', { method: 'POST', body: { id: grantId }, token });
  },

  listClinicalReadAudit(
    token: string,
    filters: ClinicalReadAuditFilters = {},
  ): Promise<{ audits: PublicClinicalReadAuditEntry[] }> {
    const q = new URLSearchParams();
    if (filters.patient_id) q.set('patient_id', filters.patient_id);
    if (filters.user_id) q.set('user_id', filters.user_id);
    if (filters.acao) q.set('acao', filters.acao);
    if (filters.date_from) q.set('date_from', filters.date_from);
    if (filters.date_to) q.set('date_to', filters.date_to);
    if (filters.limit !== undefined) q.set('limit', String(filters.limit));
    if (filters.offset !== undefined) q.set('offset', String(filters.offset));
    const qs = q.toString();
    return apiFetch(`/clinical/read-audit${qs ? `?${qs}` : ''}`, { method: 'GET', token });
  },

  // --- Clinical Documents v0.1 (Sprint 4.3C; ADR 0011) -----------------------

  listPatientDocuments(
    token: string,
    patientId: string,
  ): Promise<{ documents: PublicClinicalDocumentListItem[] }> {
    return apiFetch(`/patients/${patientId}/documents`, { method: 'GET', token });
  },

  getClinicalDocument(
    token: string,
    docId: string,
  ): Promise<{ document: PublicClinicalDocument }> {
    return apiFetch(`/clinical/documents/${docId}`, { method: 'GET', token });
  },

  createClinicalDocument(
    token: string,
    payload: CreateClinicalDocumentPayload,
  ): Promise<{ document: PublicClinicalDocument }> {
    return apiFetch('/clinical/documents', { method: 'POST', token, body: payload });
  },

  updateClinicalDocument(
    token: string,
    docId: string,
    payload: UpdateClinicalDocumentPayload,
  ): Promise<{ document: PublicClinicalDocument }> {
    return apiFetch(`/clinical/documents/${docId}`, { method: 'PATCH', token, body: payload });
  },

  finalizeClinicalDocument(
    token: string,
    docId: string,
  ): Promise<{ document: PublicClinicalDocument }> {
    return apiFetch(`/clinical/documents/${docId}/finalize`, { method: 'POST', token });
  },

  cancelClinicalDocument(
    token: string,
    docId: string,
    payload: CancelClinicalDocumentPayload,
  ): Promise<{ document: PublicClinicalDocument }> {
    return apiFetch(`/clinical/documents/${docId}/cancel`, { method: 'POST', token, body: payload });
  },

  // Downloads the document PDF. Returns a Blob (not JSON), so it does not use
  // apiFetch. Authorization is via Bearer header — token is never placed in the URL.
  async downloadClinicalDocumentPdf(
    token: string,
    docId: string,
  ): Promise<{ blob: Blob; filename: string }> {
    let response: Response;
    try {
      response = await fetch(`${BASE_URL}/clinical/documents/${docId}/pdf`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      throw new ApiError(0, {
        code: 'network_error',
        message: 'Não foi possível conectar ao servidor. Tente novamente em instantes.',
      });
    }

    if (!response.ok) {
      let body: ApiErrorBody | undefined;
      try {
        const parsed = (await response.json()) as { error?: ApiErrorBody };
        body = parsed.error;
      } catch {
        // non-JSON body — fall through to generic
      }
      if (body && typeof body.code === 'string' && typeof body.message === 'string') {
        throw new ApiError(response.status, body);
      }
      throw new ApiError(response.status, {
        code: 'unknown_error',
        message: 'Não foi possível gerar o PDF.',
      });
    }

    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') ?? '';
    const match = /filename="?([^"]+)"?/.exec(disposition);
    const filename = match ? match[1] : 'documento-clinico.pdf';
    return { blob, filename };
  },

  // --- Financial Module v0.1 (Sprint 4.4C; ADR 0012) --------------------------

  // GET /financial/charges — list with optional filters.
  listFinancialCharges(
    token: string,
    filters: FinancialChargeFilters = {},
  ): Promise<{ charges: FinancialChargeListItem[] }> {
    const query = new URLSearchParams();
    if (filters.patient_id) query.set('patient_id', filters.patient_id);
    if (filters.appointment_id) query.set('appointment_id', filters.appointment_id);
    if (filters.status) query.set('status', filters.status);
    if (filters.date_from) query.set('date_from', filters.date_from);
    if (filters.date_to) query.set('date_to', filters.date_to);
    if (filters.limit !== undefined) query.set('limit', String(filters.limit));
    if (filters.offset !== undefined) query.set('offset', String(filters.offset));
    const qs = query.toString();
    return apiFetch<{ charges: FinancialChargeListItem[] }>(
      `/financial/charges${qs ? `?${qs}` : ''}`,
      { method: 'GET', token },
    );
  },

  // GET /financial/summary — totalizadores (pending / overdue / paid).
  getFinancialSummary(
    token: string,
    params: { date_from?: string; date_to?: string } = {},
  ): Promise<{ summary: FinancialSummary }> {
    const query = new URLSearchParams();
    if (params.date_from) query.set('date_from', params.date_from);
    if (params.date_to) query.set('date_to', params.date_to);
    const qs = query.toString();
    return apiFetch<{ summary: FinancialSummary }>(
      `/financial/summary${qs ? `?${qs}` : ''}`,
      { method: 'GET', token },
    );
  },

  // GET /financial/charges/:id — detail (includes notes).
  // staleTime: 0 enforced at call sites — notes are sensitive.
  getFinancialCharge(
    token: string,
    chargeId: string,
  ): Promise<{ charge: FinancialChargeDetail }> {
    return apiFetch<{ charge: FinancialChargeDetail }>(
      `/financial/charges/${encodeURIComponent(chargeId)}`,
      { method: 'GET', token },
    );
  },

  // POST /financial/charges — create pending charge.
  createFinancialCharge(
    token: string,
    payload: CreateFinancialChargePayload,
  ): Promise<{ charge: FinancialChargeDetail }> {
    return apiFetch<{ charge: FinancialChargeDetail }>('/financial/charges', {
      method: 'POST',
      body: payload,
      token,
    });
  },

  // PATCH /financial/charges/:id — update pending charge.
  updateFinancialCharge(
    token: string,
    chargeId: string,
    payload: UpdateFinancialChargePayload,
  ): Promise<{ charge: FinancialChargeDetail }> {
    return apiFetch<{ charge: FinancialChargeDetail }>(
      `/financial/charges/${encodeURIComponent(chargeId)}`,
      { method: 'PATCH', body: payload, token },
    );
  },

  // POST /financial/charges/:id/mark-paid — pending → paid.
  markFinancialChargePaid(
    token: string,
    chargeId: string,
    payload: MarkFinancialChargePaidPayload,
  ): Promise<{ charge: FinancialChargeDetail }> {
    return apiFetch<{ charge: FinancialChargeDetail }>(
      `/financial/charges/${encodeURIComponent(chargeId)}/mark-paid`,
      { method: 'POST', body: payload, token },
    );
  },

  // POST /financial/charges/:id/cancel — pending → canceled.
  cancelFinancialCharge(
    token: string,
    chargeId: string,
    payload: CancelFinancialChargePayload,
  ): Promise<{ charge: FinancialChargeDetail }> {
    return apiFetch<{ charge: FinancialChargeDetail }>(
      `/financial/charges/${encodeURIComponent(chargeId)}/cancel`,
      { method: 'POST', body: payload, token },
    );
  },

  // GET /patients/:id/charges — single-patient charge list.
  listPatientCharges(
    token: string,
    patientId: string,
    params: { limit?: number; offset?: number } = {},
  ): Promise<{ charges: FinancialChargeListItem[] }> {
    const query = new URLSearchParams();
    if (params.limit !== undefined) query.set('limit', String(params.limit));
    if (params.offset !== undefined) query.set('offset', String(params.offset));
    const qs = query.toString();
    return apiFetch<{ charges: FinancialChargeListItem[] }>(
      `/patients/${encodeURIComponent(patientId)}/charges${qs ? `?${qs}` : ''}`,
      { method: 'GET', token },
    );
  },

  // --- Management Reports v0.1 (Sprint 4.5C; ADR 0014) ----------------------
  //
  // Token vai SEMPRE no header Authorization — nunca em URL/query.
  // Filtros vazios são omitidos para deixar o backend aplicar o default
  // (mês corrente). Strings vazias seriam tratadas como ausentes no service
  // mas seriam visíveis na URL — manter omissão é mais limpo.

  // GET /reports/appointments — R-A (totais + lista de "em atraso").
  getAppointmentReport(
    token: string,
    filters: ReportsFilters = {},
  ): Promise<AppointmentReportResponse> {
    const qs = buildReportsQuery({
      date_from: filters.date_from,
      date_to: filters.date_to,
      professional_id: filters.professional_id,
    });
    return apiFetch<AppointmentReportResponse>(
      `/reports/appointments${qs ? `?${qs}` : ''}`,
      { method: 'GET', token },
    );
  },

  // GET /reports/financial — R-B (recebido / em aberto / vencido / cancelado).
  // Backend nega com 403 quando effectiveFinancialAccess === 'none'.
  getFinancialReport(
    token: string,
    filters: ReportsFilters = {},
  ): Promise<FinancialReportResponse> {
    const qs = buildReportsQuery({
      date_from: filters.date_from,
      date_to: filters.date_to,
    });
    return apiFetch<FinancialReportResponse>(
      `/reports/financial${qs ? `?${qs}` : ''}`,
      { method: 'GET', token },
    );
  },

  // GET /reports/patients — R-C (ativos / arquivados / novos / sem retorno).
  getPatientsReport(
    token: string,
    filters: ReportsFilters = {},
  ): Promise<PatientsReportResponse> {
    const qs = buildReportsQuery({
      date_from: filters.date_from,
      date_to: filters.date_to,
      no_appt_days:
        filters.no_appt_days !== undefined ? String(filters.no_appt_days) : undefined,
    });
    return apiFetch<PatientsReportResponse>(
      `/reports/patients${qs ? `?${qs}` : ''}`,
      { method: 'GET', token },
    );
  },

  // GET /reports/agenda-financial — R-D (consultas × cobranças, 8 contadores).
  // Backend nega com 403 quando effectiveFinancialAccess === 'none'.
  getAgendaFinancialReport(
    token: string,
    filters: ReportsFilters = {},
  ): Promise<AgendaFinancialReportResponse> {
    const qs = buildReportsQuery({
      date_from: filters.date_from,
      date_to: filters.date_to,
      professional_id: filters.professional_id,
    });
    return apiFetch<AgendaFinancialReportResponse>(
      `/reports/agenda-financial${qs ? `?${qs}` : ''}`,
      { method: 'GET', token },
    );
  },

  getImportFileRetentionDryRun(
    token: string,
    params: RetentionDryRunParams = {},
  ): Promise<RetentionDryRunResult> {
    const query = new URLSearchParams();
    if (params.retention_days !== undefined) {
      query.set('retention_days', String(params.retention_days));
    }
    if (params.limit !== undefined) query.set('limit', String(params.limit));
    const qs = query.toString();
    return apiFetch<RetentionDryRunResult>(
      `/import-files/retention/dry-run${qs ? `?${qs}` : ''}`,
      { method: 'GET', token },
    );
  },

  // Downloads the export as a file. This returns a Blob (not JSON), so it does
  // not use apiFetch. On error it parses the JSON error body and throws ApiError.
  async downloadPatientsExport(
    token: string,
    params: { format: 'csv' | 'xlsx'; search?: string },
  ): Promise<{ blob: Blob; filename: string }> {
    // Demo guardrail (Sprint 5.0E): export is a download of the synthetic data;
    // we block it in guided-demo mode for consistency with the other actions.
    if (isDemoWriteBlock()) {
      notifyDemoBlocked();
      throw new ApiError(403, { code: 'demo_action_blocked', message: DEMO_BLOCKED_MESSAGE });
    }

    const query = new URLSearchParams();
    query.set('format', params.format);
    if (params.search && params.search.trim().length > 0) {
      query.set('search', params.search.trim());
    }

    let response: Response;
    try {
      response = await fetch(`${BASE_URL}/patients/export?${query.toString()}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      throw new ApiError(0, {
        code: 'network_error',
        message: 'Não foi possível conectar ao servidor. Tente novamente em instantes.',
      });
    }

    if (!response.ok) {
      let body: ApiErrorBody | undefined;
      try {
        const parsed = (await response.json()) as { error?: ApiErrorBody };
        body = parsed.error;
      } catch {
        // non-JSON error body — fall through to generic
      }
      if (body && typeof body.code === 'string' && typeof body.message === 'string') {
        throw new ApiError(response.status, body);
      }
      throw new ApiError(response.status, {
        code: 'unknown_error',
        message: 'Não foi possível gerar a exportação.',
      });
    }

    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') ?? '';
    const match = /filename="?([^"]+)"?/.exec(disposition);
    const filename = match ? match[1] : `pacientes.${params.format}`;
    return { blob, filename };
  },

  // --- Catálogo de Serviços v0.1 (Sprint 4.6C — ADR 0015) -------------------
  // Writes are dono_clinica only; reads available to secretaria too (for
  // agenda/financial selectors). price_cents is NEVER auto-applied to
  // amount_cents; duration_minutes is NEVER auto-applied to starts_at/ends_at.

  listClinicServices(
    token: string,
    params: ListClinicServicesParams = {},
  ): Promise<{ services: ClinicService[] }> {
    const query = new URLSearchParams();
    if (params.active !== undefined) query.set('active', String(params.active));
    if (params.limit !== undefined) query.set('limit', String(params.limit));
    if (params.offset !== undefined) query.set('offset', String(params.offset));
    if (params.professional_id !== undefined) query.set('professional_id', params.professional_id);
    const qs = query.toString();
    return apiFetch<{ services: ClinicService[] }>(
      `/clinic-services${qs ? `?${qs}` : ''}`,
      { method: 'GET', token },
    );
  },

  getClinicService(
    token: string,
    id: string,
  ): Promise<{ service: ClinicService }> {
    return apiFetch<{ service: ClinicService }>(
      `/clinic-services/${encodeURIComponent(id)}`,
      { method: 'GET', token },
    );
  },

  createClinicService(
    token: string,
    payload: CreateClinicServicePayload,
  ): Promise<{ service: ClinicService }> {
    return apiFetch<{ service: ClinicService }>('/clinic-services', {
      method: 'POST',
      body: payload,
      token,
    });
  },

  updateClinicService(
    token: string,
    id: string,
    payload: UpdateClinicServicePayload,
  ): Promise<{ service: ClinicService }> {
    return apiFetch<{ service: ClinicService }>(
      `/clinic-services/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: payload, token },
    );
  },

  updateClinicServiceStatus(
    token: string,
    id: string,
    active: boolean,
  ): Promise<{ service: ClinicService }> {
    return apiFetch<{ service: ClinicService }>(
      `/clinic-services/${encodeURIComponent(id)}/status`,
      { method: 'PATCH', body: { active }, token },
    );
  },

  listServiceProfessionals(
    token: string,
    serviceId: string,
  ): Promise<{ links: ProfessionalServiceLink[] }> {
    return apiFetch<{ links: ProfessionalServiceLink[] }>(
      `/clinic-services/${encodeURIComponent(serviceId)}/professionals`,
      { method: 'GET', token },
    );
  },

  linkServiceProfessional(
    token: string,
    serviceId: string,
    professional_id: string,
  ): Promise<{ link: ProfessionalServiceLink }> {
    return apiFetch<{ link: ProfessionalServiceLink }>(
      `/clinic-services/${encodeURIComponent(serviceId)}/professionals`,
      { method: 'POST', body: { professional_id }, token },
    );
  },

  updateServiceProfessionalStatus(
    token: string,
    serviceId: string,
    professionalId: string,
    active: boolean,
  ): Promise<{ link: ProfessionalServiceLink }> {
    return apiFetch<{ link: ProfessionalServiceLink }>(
      `/clinic-services/${encodeURIComponent(serviceId)}/professionals/${encodeURIComponent(professionalId)}/status`,
      { method: 'PATCH', body: { active }, token },
    );
  },

  // --- Convênios v0.1 (Sprint 4.7C — ADR 0016) --------------------------------
  // SECURITY: Never log payloads from these functions. member_number and
  // holder_name are PII and must not appear in console, localStorage,
  // sessionStorage, or URL params. Backend is the authoritative access control.

  // -- Insurance Providers --

  listInsuranceProviders(
    token: string,
    params: { active?: boolean; limit?: number } = {},
  ): Promise<{ providers: InsuranceProvider[] }> {
    const q = new URLSearchParams();
    if (params.active !== undefined) q.set('active', String(params.active));
    if (params.limit !== undefined) q.set('limit', String(params.limit));
    const qs = q.toString();
    return apiFetch<{ providers: InsuranceProvider[] }>(
      `/insurance/providers${qs ? `?${qs}` : ''}`,
      { method: 'GET', token },
    );
  },

  getInsuranceProvider(
    token: string,
    id: string,
  ): Promise<{ provider: InsuranceProvider }> {
    return apiFetch<{ provider: InsuranceProvider }>(
      `/insurance/providers/${encodeURIComponent(id)}`,
      { method: 'GET', token },
    );
  },

  createInsuranceProvider(
    token: string,
    payload: CreateInsuranceProviderPayload,
  ): Promise<{ provider: InsuranceProvider }> {
    return apiFetch<{ provider: InsuranceProvider }>('/insurance/providers', {
      method: 'POST',
      body: payload,
      token,
    });
  },

  updateInsuranceProvider(
    token: string,
    id: string,
    payload: UpdateInsuranceProviderPayload,
  ): Promise<{ provider: InsuranceProvider }> {
    return apiFetch<{ provider: InsuranceProvider }>(
      `/insurance/providers/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: payload, token },
    );
  },

  updateInsuranceProviderStatus(
    token: string,
    id: string,
    active: boolean,
  ): Promise<{ provider: InsuranceProvider }> {
    return apiFetch<{ provider: InsuranceProvider }>(
      `/insurance/providers/${encodeURIComponent(id)}/status`,
      { method: 'PATCH', body: { active }, token },
    );
  },

  // -- Insurance Plans --

  listInsurancePlans(
    token: string,
    params: { provider_id?: string; active?: boolean; limit?: number } = {},
  ): Promise<{ plans: InsurancePlan[] }> {
    const q = new URLSearchParams();
    if (params.provider_id) q.set('provider_id', params.provider_id);
    if (params.active !== undefined) q.set('active', String(params.active));
    if (params.limit !== undefined) q.set('limit', String(params.limit));
    const qs = q.toString();
    return apiFetch<{ plans: InsurancePlan[] }>(
      `/insurance/plans${qs ? `?${qs}` : ''}`,
      { method: 'GET', token },
    );
  },

  getInsurancePlan(
    token: string,
    id: string,
  ): Promise<{ plan: InsurancePlan }> {
    return apiFetch<{ plan: InsurancePlan }>(
      `/insurance/plans/${encodeURIComponent(id)}`,
      { method: 'GET', token },
    );
  },

  createInsurancePlan(
    token: string,
    payload: CreateInsurancePlanPayload,
  ): Promise<{ plan: InsurancePlan }> {
    return apiFetch<{ plan: InsurancePlan }>('/insurance/plans', {
      method: 'POST',
      body: payload,
      token,
    });
  },

  updateInsurancePlan(
    token: string,
    id: string,
    payload: UpdateInsurancePlanPayload,
  ): Promise<{ plan: InsurancePlan }> {
    return apiFetch<{ plan: InsurancePlan }>(
      `/insurance/plans/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: payload, token },
    );
  },

  updateInsurancePlanStatus(
    token: string,
    id: string,
    active: boolean,
  ): Promise<{ plan: InsurancePlan }> {
    return apiFetch<{ plan: InsurancePlan }>(
      `/insurance/plans/${encodeURIComponent(id)}/status`,
      { method: 'PATCH', body: { active }, token },
    );
  },

  // -- Patient Insurances --
  // member_number is PII: list returns masked; detail returns raw.

  listPatientInsurances(
    token: string,
    patientId: string,
    params: { active?: boolean } = {},
  ): Promise<{ insurances: PatientInsuranceListItem[] }> {
    const q = new URLSearchParams();
    if (params.active !== undefined) q.set('active', String(params.active));
    const qs = q.toString();
    return apiFetch<{ insurances: PatientInsuranceListItem[] }>(
      `/patients/${encodeURIComponent(patientId)}/insurances${qs ? `?${qs}` : ''}`,
      { method: 'GET', token },
    );
  },

  getPatientInsurance(
    token: string,
    patientId: string,
    id: string,
  ): Promise<{ insurance: PatientInsurance }> {
    return apiFetch<{ insurance: PatientInsurance }>(
      `/patients/${encodeURIComponent(patientId)}/insurances/${encodeURIComponent(id)}`,
      { method: 'GET', token },
    );
  },

  createPatientInsurance(
    token: string,
    patientId: string,
    payload: CreatePatientInsurancePayload,
  ): Promise<{ insurance: PatientInsurance }> {
    return apiFetch<{ insurance: PatientInsurance }>(
      `/patients/${encodeURIComponent(patientId)}/insurances`,
      { method: 'POST', body: payload, token },
    );
  },

  updatePatientInsurance(
    token: string,
    patientId: string,
    id: string,
    payload: UpdatePatientInsurancePayload,
  ): Promise<{ insurance: PatientInsurance }> {
    return apiFetch<{ insurance: PatientInsurance }>(
      `/patients/${encodeURIComponent(patientId)}/insurances/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: payload, token },
    );
  },

  updatePatientInsuranceStatus(
    token: string,
    patientId: string,
    id: string,
    active: boolean,
  ): Promise<{ insurance: PatientInsurance }> {
    return apiFetch<{ insurance: PatientInsurance }>(
      `/patients/${encodeURIComponent(patientId)}/insurances/${encodeURIComponent(id)}/status`,
      { method: 'PATCH', body: { active }, token },
    );
  },

  // -- Service Insurance Prices --
  // reference_price_cents is a visual reference ONLY — never auto-populated.

  listServiceInsurancePrices(
    token: string,
    params: { service_id?: string; provider_id?: string; plan_id?: string; active?: boolean } = {},
  ): Promise<{ prices: ServiceInsurancePrice[] }> {
    const q = new URLSearchParams();
    if (params.service_id) q.set('service_id', params.service_id);
    if (params.provider_id) q.set('provider_id', params.provider_id);
    if (params.plan_id) q.set('plan_id', params.plan_id);
    if (params.active !== undefined) q.set('active', String(params.active));
    const qs = q.toString();
    return apiFetch<{ prices: ServiceInsurancePrice[] }>(
      `/insurance/service-prices${qs ? `?${qs}` : ''}`,
      { method: 'GET', token },
    );
  },

  getServiceInsurancePrice(
    token: string,
    id: string,
  ): Promise<{ price: ServiceInsurancePrice }> {
    return apiFetch<{ price: ServiceInsurancePrice }>(
      `/insurance/service-prices/${encodeURIComponent(id)}`,
      { method: 'GET', token },
    );
  },

  createServiceInsurancePrice(
    token: string,
    payload: CreateServiceInsurancePricePayload,
  ): Promise<{ price: ServiceInsurancePrice }> {
    return apiFetch<{ price: ServiceInsurancePrice }>('/insurance/service-prices', {
      method: 'POST',
      body: payload,
      token,
    });
  },

  updateServiceInsurancePrice(
    token: string,
    id: string,
    payload: UpdateServiceInsurancePricePayload,
  ): Promise<{ price: ServiceInsurancePrice }> {
    return apiFetch<{ price: ServiceInsurancePrice }>(
      `/insurance/service-prices/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: payload, token },
    );
  },

  updateServiceInsurancePriceStatus(
    token: string,
    id: string,
    active: boolean,
  ): Promise<{ price: ServiceInsurancePrice }> {
    return apiFetch<{ price: ServiceInsurancePrice }>(
      `/insurance/service-prices/${encodeURIComponent(id)}/status`,
      { method: 'PATCH', body: { active }, token },
    );
  },

  // --- Estoque v0.1 (Sprint 4.8C — ADR 0017) ----------------------------------
  // SECURITY: notes/reason are administrative free text — never log payloads
  // from these functions, never persist them in storage, never put them in URL.
  // The backend is the authoritative access control: dono_clinica = full CRUD;
  // secretaria = read + movements; profissional_clinico = 403 everywhere.

  listInventoryItems(
    token: string,
    params: ListInventoryItemsParams = {},
  ): Promise<{ items: InventoryItem[] }> {
    const q = new URLSearchParams();
    if (params.active !== undefined) q.set('active', String(params.active));
    if (params.low_stock !== undefined) q.set('low_stock', String(params.low_stock));
    if (params.query) q.set('query', params.query);
    if (params.category) q.set('category', params.category);
    if (params.limit !== undefined) q.set('limit', String(params.limit));
    if (params.offset !== undefined) q.set('offset', String(params.offset));
    const qs = q.toString();
    return apiFetch<{ items: InventoryItem[] }>(
      `/inventory/items${qs ? `?${qs}` : ''}`,
      { method: 'GET', token },
    );
  },

  getInventoryItem(
    token: string,
    id: string,
  ): Promise<{ item: InventoryItem }> {
    return apiFetch<{ item: InventoryItem }>(
      `/inventory/items/${encodeURIComponent(id)}`,
      { method: 'GET', token },
    );
  },

  createInventoryItem(
    token: string,
    payload: CreateInventoryItemPayload,
  ): Promise<{ item: InventoryItem }> {
    return apiFetch<{ item: InventoryItem }>('/inventory/items', {
      method: 'POST',
      body: payload,
      token,
    });
  },

  updateInventoryItem(
    token: string,
    id: string,
    payload: UpdateInventoryItemPayload,
  ): Promise<{ item: InventoryItem }> {
    return apiFetch<{ item: InventoryItem }>(
      `/inventory/items/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: payload, token },
    );
  },

  updateInventoryItemStatus(
    token: string,
    id: string,
    active: boolean,
  ): Promise<{ item: InventoryItem }> {
    return apiFetch<{ item: InventoryItem }>(
      `/inventory/items/${encodeURIComponent(id)}/status`,
      { method: 'PATCH', body: { active }, token },
    );
  },

  listInventoryItemMovements(
    token: string,
    itemId: string,
    params: Omit<ListInventoryMovementsParams, 'item_id'> = {},
  ): Promise<{ movements: InventoryMovement[] }> {
    const q = new URLSearchParams();
    if (params.movement_type) q.set('movement_type', params.movement_type);
    if (params.limit !== undefined) q.set('limit', String(params.limit));
    if (params.offset !== undefined) q.set('offset', String(params.offset));
    const qs = q.toString();
    return apiFetch<{ movements: InventoryMovement[] }>(
      `/inventory/items/${encodeURIComponent(itemId)}/movements${qs ? `?${qs}` : ''}`,
      { method: 'GET', token },
    );
  },

  createInventoryMovement(
    token: string,
    itemId: string,
    payload: CreateInventoryMovementPayload,
  ): Promise<{ item: InventoryItem; movement: InventoryMovement }> {
    return apiFetch<{ item: InventoryItem; movement: InventoryMovement }>(
      `/inventory/items/${encodeURIComponent(itemId)}/movements`,
      { method: 'POST', body: payload, token },
    );
  },

  listInventoryMovements(
    token: string,
    params: ListInventoryMovementsParams = {},
  ): Promise<{ movements: InventoryMovement[] }> {
    const q = new URLSearchParams();
    if (params.item_id) q.set('item_id', params.item_id);
    if (params.movement_type) q.set('movement_type', params.movement_type);
    if (params.limit !== undefined) q.set('limit', String(params.limit));
    if (params.offset !== undefined) q.set('offset', String(params.offset));
    const qs = q.toString();
    return apiFetch<{ movements: InventoryMovement[] }>(
      `/inventory/movements${qs ? `?${qs}` : ''}`,
      { method: 'GET', token },
    );
  },

  // --- Billing / Planos / Entitlements v0.1 (Sprint 5.1C — ADR 0018) -----------
  // GET /billing/status — plan/state/entitlements/soft-lock for the caller's
  // clinic. Read-only. Token goes via header only (never in URL).
  // 403: role not allowed (profissional_clinico) or no clinic context.
  getBillingStatus(token: string): Promise<BillingStatusResponse> {
    return apiFetch<BillingStatusResponse>('/billing/status', { method: 'GET', token });
  },
};
