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
}

export interface MfaSetupResponse {
  otpauth_url: string;
  manual_key: string;
  qr_data_url: string;
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

export interface ListPatientsParams {
  search?: string;
  limit?: number;
  offset?: number;
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
    return apiFetch<RegisterResponse>('/auth/register', { method: 'POST', body: payload });
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

  confirmMfa(token: string, code: string): Promise<MfaStatusResponse> {
    return apiFetch<MfaStatusResponse>('/auth/mfa/confirm', {
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
    const qs = query.toString();
    return apiFetch<ListPatientsResponse>(`/patients${qs ? `?${qs}` : ''}`, {
      method: 'GET',
      token,
    });
  },

  listPatientDuplicates(token: string): Promise<DuplicateScanResult> {
    return apiFetch<DuplicateScanResult>('/patients/duplicates', { method: 'GET', token });
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
