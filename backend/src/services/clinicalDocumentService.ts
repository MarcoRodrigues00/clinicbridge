import { logger } from '../config/logger';
import { auditLogDao } from '../dao/auditLogDao';
import { clinicalDocumentDao } from '../dao/clinicalDocumentDao';
import { clinicalEncounterDao } from '../dao/clinicalEncounterDao';
import { patientDao } from '../dao/patientDao';
import { HttpError } from '../middlewares/errorHandler';
import type { ClinicalCapability } from '../middlewares/requireClinicalRole';
import type {
  ClinicalDocumentCancelReasonCode,
  ClinicalDocumentRow,
  ClinicalDocumentStatus,
  ClinicalDocumentType,
} from '../types/db';
import type { AuthContext } from './authService';
import { clinicalReadAuditService } from './clinicalReadAuditService';

// Actor identity for clinical document operations. The route stack guarantees:
//   1. requireAuth → req.auth populated
//   2. requireClinic → users.ativo=true + same clinic (DB check)
//   3. requireClinicalRole → req.clinicalRoles populated
// Services never re-derive any of those from the HTTP request directly.
export interface ClinicalDocumentActor {
  clinica_id: string;
  usuario_id: string;
  clinicalRoles: Set<ClinicalCapability>;
}

// ----- Validation constants -------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DOC_TYPES: readonly ClinicalDocumentType[] = [
  'receipt_simple',
  'attestation',
  'declaration',
  'exam_request',
  'orientation',
];

const STATUS_VALUES: readonly ClinicalDocumentStatus[] = [
  'draft',
  'finalized',
  'canceled',
];

const CANCEL_REASON_CODES: readonly ClinicalDocumentCancelReasonCode[] = [
  'error',
  'duplicate',
  'patient_request',
  'other',
];

const TITLE_MAX = 200;
const BODY_MAX = 10000;
const CANCEL_REASON_TEXT_MAX = 200;

const LIST_DEFAULT_LIMIT = 50;
const LIST_MAX_LIMIT = 100;
const LIST_MAX_OFFSET = 10000;

// Tight cap on jsonb size — keeps payloads bounded and avoids accidentally
// storing entire documents in metadata.
const METADATA_JSON_MAX_KEYS = 30;
const METADATA_JSON_MAX_STRING = 1000;

// ----- Error helpers --------------------------------------------------------

function invalidDocument(message: string): HttpError {
  return new HttpError(400, 'clinical_document_invalid', message);
}

function cancelInvalid(message: string): HttpError {
  return new HttpError(400, 'clinical_document_cancel_invalid', message);
}

// Generic 404 covers cross-clinic, "not yours", non-existent. Anti-enumeration.
function documentNotFound(): HttpError {
  return new HttpError(404, 'document_not_found', 'Documento não encontrado.');
}

function patientNotFound(): HttpError {
  return new HttpError(404, 'patient_not_found', 'Paciente não encontrado.');
}

// ----- Parsers --------------------------------------------------------------

function parseUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw invalidDocument(`Identificador inválido: ${field}.`);
  }
  return value;
}

function parseOptionalUuid(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  return parseUuid(value, field);
}

function parseDocType(value: unknown): ClinicalDocumentType {
  if (typeof value !== 'string' || !(DOC_TYPES as readonly string[]).includes(value)) {
    throw invalidDocument(`doc_type inválido. Use um de: ${DOC_TYPES.join(', ')}.`);
  }
  return value as ClinicalDocumentType;
}

function parseStatusFilter(value: unknown): ClinicalDocumentStatus | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !(STATUS_VALUES as readonly string[]).includes(value)) {
    throw invalidDocument('status inválido.');
  }
  return value as ClinicalDocumentStatus;
}

function parseDocTypeFilter(value: unknown): ClinicalDocumentType | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !(DOC_TYPES as readonly string[]).includes(value)) {
    throw invalidDocument('doc_type inválido.');
  }
  return value as ClinicalDocumentType;
}

function parseIsoDate(value: unknown, field: string): Date {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw invalidDocument(`Data inválida: ${field}.`);
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw invalidDocument(`Data inválida: ${field}.`);
  }
  return d;
}

function parseOptionalIsoDate(value: unknown, field: string): Date | null {
  if (value === undefined || value === null || value === '') return null;
  return parseIsoDate(value, field);
}

function parseLimit(value: unknown, def: number, max: number): number {
  if (value === undefined || value === null || value === '') return def;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw invalidDocument('limit inválido.');
  }
  const n = Number(value);
  if (n < 1 || n > max) {
    throw invalidDocument(`limit deve estar entre 1 e ${max}.`);
  }
  return n;
}

function parseOffset(value: unknown, max: number): number {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw invalidDocument('offset inválido.');
  }
  const n = Number(value);
  if (n < 0 || n > max) {
    throw invalidDocument(`offset deve estar entre 0 e ${max}.`);
  }
  return n;
}

function parseTitle(value: unknown, defaultTitle: string): string {
  if (value === undefined || value === null) return defaultTitle;
  if (typeof value !== 'string') {
    throw invalidDocument('title inválido.');
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return defaultTitle;
  if (trimmed.length > TITLE_MAX) {
    throw invalidDocument(`title deve ter no máximo ${TITLE_MAX} caracteres.`);
  }
  return trimmed;
}

function parseBody(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw invalidDocument('body inválido.');
  }
  // Preserve internal newlines — clinical text legitimately spans paragraphs.
  const trimmed = value.replace(/^\s+|\s+$/g, '');
  if (trimmed.length === 0) return null;
  if (trimmed.length > BODY_MAX) {
    throw invalidDocument(`body deve ter no máximo ${BODY_MAX} caracteres.`);
  }
  return trimmed;
}

// metadata_json is per-doc-type semi-structured. We do NOT enforce strict
// per-type schemas in v0.1 — UI templates iterate fast — but we cap shape so
// payloads stay bounded:
//   - must be a plain object (no array as root)
//   - max METADATA_JSON_MAX_KEYS top-level keys
//   - each string value capped at METADATA_JSON_MAX_STRING
//   - nested arrays of strings/numbers/booleans only, capped by the same string limit
//   - no functions/symbols/BigInt (JSON-only — pg jsonb)
// ADR 0011 §10.3 — metadata_json never carries PII bruta.
function validateMetadataJson(value: unknown): Record<string, unknown> | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw invalidDocument('metadata_json inválido.');
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length > METADATA_JSON_MAX_KEYS) {
    throw invalidDocument(`metadata_json com muitas chaves (máx ${METADATA_JSON_MAX_KEYS}).`);
  }
  for (const k of keys) {
    assertJsonValueOk(obj[k]);
  }
  return obj;
}

function assertJsonValueOk(v: unknown, depth = 0): void {
  if (depth > 3) {
    throw invalidDocument('metadata_json muito aninhado.');
  }
  if (v === null || v === undefined) return;
  const t = typeof v;
  if (t === 'string') {
    if ((v as string).length > METADATA_JSON_MAX_STRING) {
      throw invalidDocument(`metadata_json: valor de texto excede ${METADATA_JSON_MAX_STRING} chars.`);
    }
    return;
  }
  if (t === 'number' || t === 'boolean') return;
  if (Array.isArray(v)) {
    if (v.length > 50) {
      throw invalidDocument('metadata_json: array muito grande.');
    }
    for (const item of v) {
      assertJsonValueOk(item, depth + 1);
    }
    return;
  }
  if (t === 'object') {
    const obj = v as Record<string, unknown>;
    if (Object.keys(obj).length > METADATA_JSON_MAX_KEYS) {
      throw invalidDocument('metadata_json: objeto aninhado com muitas chaves.');
    }
    for (const k of Object.keys(obj)) {
      assertJsonValueOk(obj[k], depth + 1);
    }
    return;
  }
  // bigint, function, symbol: reject.
  throw invalidDocument('metadata_json contém valor não suportado.');
}

function parseCancelReasonCode(value: unknown): ClinicalDocumentCancelReasonCode {
  if (
    typeof value !== 'string' ||
    !(CANCEL_REASON_CODES as readonly string[]).includes(value)
  ) {
    throw cancelInvalid(
      `Motivo inválido. Use um de: ${CANCEL_REASON_CODES.join(', ')}.`,
    );
  }
  return value as ClinicalDocumentCancelReasonCode;
}

function parseCancelReasonText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw cancelInvalid('reason_text inválido.');
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > CANCEL_REASON_TEXT_MAX) {
    throw cancelInvalid(
      `reason_text deve ter no máximo ${CANCEL_REASON_TEXT_MAX} caracteres.`,
    );
  }
  return trimmed;
}

// ----- Role helpers ---------------------------------------------------------

// Determines DAO self-filter (ADR 0011 §6.3). Owners and gestores see the whole
// clinic; profissionais see only their own documents. DAO ALWAYS applies the
// filter when non-null — a forgotten check at the service still cannot leak.
function authorSelfFilterFor(actor: ClinicalDocumentActor): string | null {
  if (
    actor.clinicalRoles.has('dono_clinica') ||
    actor.clinicalRoles.has('gestor_clinica')
  ) {
    return null;
  }
  return actor.usuario_id;
}

function isAuthor(actor: ClinicalDocumentActor, row: ClinicalDocumentRow): boolean {
  return actor.usuario_id === row.author_user_id;
}

// ----- Audit helpers --------------------------------------------------------

async function safeAudit(
  acao: string,
  recurso_id: string | null,
  actor: ClinicalDocumentActor,
  ctx: AuthContext,
): Promise<void> {
  try {
    await auditLogDao.create({
      acao,
      usuario_id: actor.usuario_id,
      clinica_id: actor.clinica_id,
      recurso: 'clinical_document',
      recurso_id,
      ip: ctx.ip,
      user_agent: ctx.user_agent,
      request_id: ctx.request_id,
    });
  } catch (err) {
    // Best-effort write-side audit (mirrors clinicalEncounterService.safeAudit).
    // CLINICAL CONTENT-READ audit is a SEPARATE, STRICTER mechanism
    // (clinicalReadAuditService) — do not confuse the two.
    logger.error({ err, acao, audit_write_failed: true }, 'audit log write failed');
  }
}

// ----- Public projections ---------------------------------------------------

// Two projections, two audit categories:
//
//   PublicClinicalDocumentListItem (METADATA ONLY)
//     - Returned by list and listForPatient.
//     - NEVER carries `body` or `metadata_json` (the clinical content fields).
//     - Drops `cancel_reason_text` (defense in depth — only the detail view
//       surfaces the free-text cancellation note).
//     - Audit category: METADATA-LIST audit (`clinical.document.list`).
//
//   PublicClinicalDocument (DETAIL)
//     - Returned by create, findById (with content), updateDraft, finalize, cancel.
//     - Carries body and metadata_json. Read of detail emits CONTENT-READ audit
//       (`clinical.document.read`) in STRICT mode before serializing.
export interface PublicClinicalDocumentListItem {
  id: string;
  clinica_id: string;
  patient_id: string;
  encounter_id: string | null;
  author_user_id: string;
  doc_type: ClinicalDocumentType;
  title: string;
  status: ClinicalDocumentStatus;
  finalized_at: Date | null;
  finalized_by_user_id: string | null;
  canceled_at: Date | null;
  canceled_by_user_id: string | null;
  cancel_reason_code: ClinicalDocumentCancelReasonCode | null;
  supersedes_document_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PublicClinicalDocument extends PublicClinicalDocumentListItem {
  body: string | null;
  metadata_json: Record<string, unknown> | null;
  cancel_reason_text: string | null;
}

function toListItem(row: ClinicalDocumentRow): PublicClinicalDocumentListItem {
  return {
    id: row.id,
    clinica_id: row.clinica_id,
    patient_id: row.patient_id,
    encounter_id: row.encounter_id,
    author_user_id: row.author_user_id,
    doc_type: row.doc_type,
    title: row.title,
    status: row.status,
    finalized_at: row.finalized_at,
    finalized_by_user_id: row.finalized_by_user_id,
    canceled_at: row.canceled_at,
    canceled_by_user_id: row.canceled_by_user_id,
    cancel_reason_code: row.cancel_reason_code,
    supersedes_document_id: row.supersedes_document_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toPublicDocument(row: ClinicalDocumentRow): PublicClinicalDocument {
  return {
    ...toListItem(row),
    body: row.body,
    metadata_json: row.metadata_json,
    cancel_reason_text: row.cancel_reason_text,
  };
}

// Default title generator (ADR 0011 §3.3). Uses pt-BR DD/MM/YYYY.
function defaultTitleFor(type: ClinicalDocumentType, now: Date): string {
  const labelByType: Record<ClinicalDocumentType, string> = {
    receipt_simple: 'Receita simples',
    attestation: 'Atestado médico',
    declaration: 'Declaração de comparecimento',
    exam_request: 'Solicitação de exame',
    orientation: 'Orientação',
  };
  const d = String(now.getDate()).padStart(2, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const y = now.getFullYear();
  return `${labelByType[type]} — ${d}/${m}/${y}`;
}

// ----- Service --------------------------------------------------------------

export const clinicalDocumentService = {
  // POST /clinical/documents — create draft. ADR 0011 §9.1.
  //
  // Authorization: profissional_clinico explicit grant required. Owner alone
  // (without the grant) is rejected here defensively — the middleware
  // already enforces this, but the service re-checks.
  async create(
    actor: ClinicalDocumentActor,
    body: {
      patient_id?: unknown;
      encounter_id?: unknown;
      doc_type?: unknown;
      title?: unknown;
      body?: unknown;
      metadata_json?: unknown;
      supersedes_document_id?: unknown;
    },
    ctx: AuthContext,
  ): Promise<{ document: PublicClinicalDocument }> {
    if (!actor.clinicalRoles.has('profissional_clinico')) {
      throw new HttpError(
        403,
        'forbidden_role',
        'Apenas profissionais clínicos podem criar documentos.',
      );
    }

    const patient_id = parseUuid(body.patient_id, 'patient_id');
    const doc_type = parseDocType(body.doc_type);
    const encounter_id = parseOptionalUuid(body.encounter_id, 'encounter_id');
    const supersedes_document_id = parseOptionalUuid(
      body.supersedes_document_id,
      'supersedes_document_id',
    );

    // Patient must be active + non-merged + same clinic (ADR 0011 §13).
    // Generic 404 — anti-enumeration.
    const patient = await patientDao.findByIdForClinic(patient_id, actor.clinica_id);
    if (!patient || patient.status !== 'active' || patient.merged_into_id !== null) {
      throw patientNotFound();
    }

    // Encounter (optional) — same clinic + same patient.
    if (encounter_id) {
      const enc = await clinicalEncounterDao.findByIdForClinic(
        encounter_id,
        actor.clinica_id,
      );
      if (!enc || enc.patient_id !== patient_id) {
        throw invalidDocument('encounter_id inválido para este paciente.');
      }
    }

    // Supersedes (optional) — same clinic; service is permissive about the
    // status of the predecessor (it might already be canceled — that's the
    // expected substitution flow per ADR 0011 §9.5).
    if (supersedes_document_id) {
      const pred = await clinicalDocumentDao.findByIdForClinic(
        supersedes_document_id,
        actor.clinica_id,
      );
      if (!pred) {
        throw invalidDocument('supersedes_document_id inválido.');
      }
    }

    const title = parseTitle(body.title, defaultTitleFor(doc_type, new Date()));
    const docBody = parseBody(body.body);
    const metadata = validateMetadataJson(body.metadata_json);

    const row = await clinicalDocumentDao.createDraft({
      clinica_id: actor.clinica_id,
      patient_id,
      encounter_id,
      author_user_id: actor.usuario_id,
      doc_type,
      title,
      body: docBody,
      metadata_json: metadata,
      supersedes_document_id,
    });

    await safeAudit('clinical.document.created.success', row.id, actor, ctx);
    return { document: toPublicDocument(row) };
  },

  // GET /clinical/documents — METADATA-LIST. ADR 0011 §14.2.
  //
  // Returns PublicClinicalDocumentListItem[] — NEVER body, NEVER metadata_json,
  // NEVER cancel_reason_text. The audit (`clinical.document.list`) is a
  // METADATA-LIST audit emitted in STRICT mode BEFORE the SELECT — strict-mode
  // failure aborts before metadata is fetched. paciente_id is null (multi-patient).
  async list(
    actor: ClinicalDocumentActor,
    rawQuery: {
      patient_id?: unknown;
      doc_type?: unknown;
      status?: unknown;
      author_user_id?: unknown;
      from?: unknown;
      to?: unknown;
      limit?: unknown;
      offset?: unknown;
    },
    ctx: AuthContext,
  ): Promise<{ documents: PublicClinicalDocumentListItem[] }> {
    const patient_id = rawQuery.patient_id !== undefined && rawQuery.patient_id !== ''
      ? parseUuid(rawQuery.patient_id, 'patient_id')
      : null;
    const doc_type = parseDocTypeFilter(rawQuery.doc_type);
    const status = parseStatusFilter(rawQuery.status);
    const author_user_id =
      rawQuery.author_user_id !== undefined && rawQuery.author_user_id !== ''
        ? parseUuid(rawQuery.author_user_id, 'author_user_id')
        : null;
    const from = parseOptionalIsoDate(rawQuery.from, 'from');
    const to = parseOptionalIsoDate(rawQuery.to, 'to');
    if (from && to && to.getTime() <= from.getTime()) {
      throw invalidDocument('to deve ser maior que from.');
    }
    const limit = parseLimit(rawQuery.limit, LIST_DEFAULT_LIMIT, LIST_MAX_LIMIT);
    const offset = parseOffset(rawQuery.offset, LIST_MAX_OFFSET);

    // STRICT-MODE METADATA-LIST audit BEFORE the SELECT.
    await clinicalReadAuditService.recordReadAudit({
      actor: {
        usuario_id: actor.usuario_id,
        clinica_id: actor.clinica_id,
        clinicalRoles: actor.clinicalRoles,
      },
      ctx,
      acao: 'clinical.document.list',
      recurso: 'document',
      recurso_id: null,
      paciente_id: null,
    });

    const rows = await clinicalDocumentDao.listForClinic(actor.clinica_id, {
      patient_id,
      doc_type,
      status,
      author_user_id,
      from,
      to,
      limit,
      offset,
      author_user_id_self: authorSelfFilterFor(actor),
    });
    return { documents: rows.map(toListItem) };
  },

  // GET /patients/:id/documents — METADATA-LIST scoped to one patient.
  // Audit emits with paciente_id set (single-patient read).
  async listForPatient(
    actor: ClinicalDocumentActor,
    patient_id_param: string,
    rawQuery: { limit?: unknown; offset?: unknown },
    ctx: AuthContext,
  ): Promise<{ documents: PublicClinicalDocumentListItem[] }> {
    const patient_id = parseUuid(patient_id_param, 'patient_id');
    const limit = parseLimit(rawQuery.limit, LIST_DEFAULT_LIMIT, LIST_MAX_LIMIT);
    const offset = parseOffset(rawQuery.offset, LIST_MAX_OFFSET);

    const patient = await patientDao.findByIdForClinic(patient_id, actor.clinica_id);
    if (!patient) {
      throw patientNotFound();
    }

    await clinicalReadAuditService.recordReadAudit({
      actor: {
        usuario_id: actor.usuario_id,
        clinica_id: actor.clinica_id,
        clinicalRoles: actor.clinicalRoles,
      },
      ctx,
      acao: 'clinical.document.list',
      recurso: 'document',
      recurso_id: patient_id,
      paciente_id: patient_id,
    });

    const rows = await clinicalDocumentDao.listForPatient(
      actor.clinica_id,
      patient_id,
      {
        author_user_id_self: authorSelfFilterFor(actor),
        limit,
        offset,
      },
    );
    return { documents: rows.map(toListItem) };
  },

  // GET /clinical/documents/:id — CONTENT-READ. ADR 0011 §14.3.
  //
  // Returns the document INCLUDING body and metadata_json. The content-read
  // audit (`clinical.document.read`) is emitted in STRICT mode BEFORE the
  // serialized response is built — strict-mode failure aborts with 500 and
  // no clinical content leaves the server.
  async findById(
    actor: ClinicalDocumentActor,
    id: string,
    ctx: AuthContext,
  ): Promise<{ document: PublicClinicalDocument }> {
    const docId = parseUuid(id, 'id');

    const row = await clinicalDocumentDao.findByIdForClinic(docId, actor.clinica_id, {
      author_user_id_self: authorSelfFilterFor(actor),
    });
    if (!row) {
      throw documentNotFound();
    }

    // STRICT-MODE CONTENT-READ audit BEFORE serialization. recurso_id is the
    // document id; paciente_id is the (pseudonymized) patient UUID. A strict-
    // mode failure throws 500 `clinical_read_audit_unavailable`; toPublicDocument
    // is NEVER called.
    await clinicalReadAuditService.recordReadAudit({
      actor: {
        usuario_id: actor.usuario_id,
        clinica_id: actor.clinica_id,
        clinicalRoles: actor.clinicalRoles,
      },
      ctx,
      acao: 'clinical.document.read',
      recurso: 'document',
      recurso_id: row.id,
      paciente_id: row.patient_id,
    });

    return { document: toPublicDocument(row) };
  },

  // PATCH /clinical/documents/:id — update draft (author only, draft only).
  // ADR 0011 §14.4.
  async updateDraft(
    actor: ClinicalDocumentActor,
    id: string,
    body: {
      title?: unknown;
      body?: unknown;
      metadata_json?: unknown;
      encounter_id?: unknown;
    },
    ctx: AuthContext,
  ): Promise<{ document: PublicClinicalDocument }> {
    if (!actor.clinicalRoles.has('profissional_clinico')) {
      throw new HttpError(
        403,
        'forbidden_role',
        'Apenas profissionais clínicos podem editar documentos.',
      );
    }
    const docId = parseUuid(id, 'id');

    // Read first to verify ownership + status + collect existing values for
    // encounter_id validation (need patient_id from the doc to validate the
    // new encounter belongs to the same patient).
    const existing = await clinicalDocumentDao.findByIdForClinic(docId, actor.clinica_id, {
      author_user_id_self: actor.usuario_id,
    });
    if (!existing) {
      throw documentNotFound();
    }
    if (existing.status === 'finalized') {
      throw new HttpError(
        400,
        'document_already_finalized',
        'Documento já finalizado não pode ser editado.',
      );
    }
    if (existing.status === 'canceled') {
      throw new HttpError(
        400,
        'document_canceled',
        'Documento cancelado não pode ser editado.',
      );
    }
    // status === 'draft' from here on.

    const patch: {
      title?: string;
      body?: string | null;
      metadata_json?: Record<string, unknown> | null;
      encounter_id?: string | null;
    } = {};

    if (body.title !== undefined) {
      patch.title = parseTitle(body.title, defaultTitleFor(existing.doc_type, new Date()));
    }
    if (body.body !== undefined) {
      patch.body = parseBody(body.body);
    }
    if (body.metadata_json !== undefined) {
      patch.metadata_json = validateMetadataJson(body.metadata_json);
    }
    if (body.encounter_id !== undefined) {
      if (body.encounter_id === null || body.encounter_id === '') {
        patch.encounter_id = null;
      } else {
        const newEnc = parseUuid(body.encounter_id, 'encounter_id');
        const enc = await clinicalEncounterDao.findByIdForClinic(newEnc, actor.clinica_id);
        if (!enc || enc.patient_id !== existing.patient_id) {
          throw invalidDocument('encounter_id inválido para este paciente.');
        }
        patch.encounter_id = newEnc;
      }
    }

    const updated = await clinicalDocumentDao.updateDraft(
      docId,
      actor.clinica_id,
      actor.usuario_id,
      patch,
    );
    if (!updated) {
      // CAS miss — between findById and updateDraft, the row transitioned out
      // of draft. Generic 404 (anti-enumeration of race window).
      throw documentNotFound();
    }
    await safeAudit('clinical.document.updated.success', updated.id, actor, ctx);
    return { document: toPublicDocument(updated) };
  },

  // POST /clinical/documents/:id/finalize — author finalizes their own draft.
  // ADR 0011 §14.5. Service re-reads BEFORE the CAS so body non-empty check is
  // against the current row state (not a stale snapshot from the client).
  async finalize(
    actor: ClinicalDocumentActor,
    id: string,
    ctx: AuthContext,
  ): Promise<{ document: PublicClinicalDocument }> {
    if (!actor.clinicalRoles.has('profissional_clinico')) {
      throw new HttpError(
        403,
        'forbidden_role',
        'Apenas profissionais clínicos podem finalizar documentos.',
      );
    }
    const docId = parseUuid(id, 'id');

    const existing = await clinicalDocumentDao.findByIdForClinic(docId, actor.clinica_id, {
      author_user_id_self: actor.usuario_id,
    });
    if (!existing) {
      throw documentNotFound();
    }
    if (existing.status === 'finalized') {
      throw new HttpError(
        400,
        'document_already_finalized',
        'Documento já finalizado.',
      );
    }
    if (existing.status === 'canceled') {
      throw new HttpError(400, 'document_canceled', 'Documento cancelado.');
    }
    if (!existing.body || existing.body.trim().length === 0) {
      throw new HttpError(
        400,
        'document_body_required',
        'O corpo do documento é obrigatório para finalizar.',
      );
    }

    const updated = await clinicalDocumentDao.finalize(
      docId,
      actor.clinica_id,
      actor.usuario_id,
    );
    if (!updated) {
      // CAS miss between read and update — transitioned out of draft.
      throw documentNotFound();
    }
    await safeAudit('clinical.document.finalized.success', updated.id, actor, ctx);
    return { document: toPublicDocument(updated) };
  },

  // POST /clinical/documents/:id/cancel — author cancels their own (draft or
  // finalized → canceled). ADR 0011 §14.6.
  async cancel(
    actor: ClinicalDocumentActor,
    id: string,
    body: { reason_code?: unknown; reason_text?: unknown },
    ctx: AuthContext,
  ): Promise<{ document: PublicClinicalDocument }> {
    if (!actor.clinicalRoles.has('profissional_clinico')) {
      throw new HttpError(
        403,
        'forbidden_role',
        'Apenas profissionais clínicos podem cancelar documentos.',
      );
    }
    const docId = parseUuid(id, 'id');
    const reason_code = parseCancelReasonCode(body.reason_code);
    const reason_text = parseCancelReasonText(body.reason_text);

    const updated = await clinicalDocumentDao.cancel(
      docId,
      actor.clinica_id,
      actor.usuario_id,
      reason_code,
      reason_text,
    );
    if (!updated) {
      // CAS miss covers: cross-tenant, not-author, or already-canceled.
      // Generic 404 — anti-enumeration.
      throw documentNotFound();
    }
    await safeAudit('clinical.document.canceled.success', updated.id, actor, ctx);
    return { document: toPublicDocument(updated) };
  },

  // INTERNAL — used by the PDF service. Validates the document is finalized
  // and emits the PDF-DOWNLOAD audit BEFORE returning. STRICT mode: audit
  // failure aborts with 500 and no PDF is produced (caller never gets the row).
  //
  // Visibility uses the same author-self filter as content-read (dono/gestor
  // can download any; profissional only their own).
  async getForPdf(
    actor: ClinicalDocumentActor,
    id: string,
    ctx: AuthContext,
  ): Promise<{ document: ClinicalDocumentRow; isAuthor: boolean }> {
    const docId = parseUuid(id, 'id');

    const row = await clinicalDocumentDao.findByIdForClinic(docId, actor.clinica_id, {
      author_user_id_self: authorSelfFilterFor(actor),
    });
    if (!row) {
      throw documentNotFound();
    }
    if (row.status === 'draft') {
      throw new HttpError(
        400,
        'document_not_finalized',
        'Documento em rascunho — finalize antes de baixar o PDF.',
      );
    }
    if (row.status === 'canceled') {
      throw new HttpError(
        400,
        'document_canceled',
        'Documento cancelado — PDF indisponível.',
      );
    }

    // STRICT-MODE PDF-DOWNLOAD audit BEFORE PDF generation. ADR 0011 §8.3.
    await clinicalReadAuditService.recordReadAudit({
      actor: {
        usuario_id: actor.usuario_id,
        clinica_id: actor.clinica_id,
        clinicalRoles: actor.clinicalRoles,
      },
      ctx,
      acao: 'clinical.document.pdf.downloaded',
      recurso: 'document',
      recurso_id: row.id,
      paciente_id: row.patient_id,
    });

    return { document: row, isAuthor: isAuthor(actor, row) };
  },
};
