// Thin client for the ClinicBridge backend (Sprint 1 / 1.5).
//
// Design choices:
// - All functions throw `ApiError` on failure; callers translate to UI state.
// - No global token store — `getMe()` takes the token explicitly, which keeps
//   this module easy to test and free of cycles with authStorage.
// - We never read `message` from the network without sanitization; we only
//   surface the `error.message` field that the backend explicitly produces.

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

async function apiFetch<T>(path: string, opts: FetchOptions): Promise<T> {
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
};
