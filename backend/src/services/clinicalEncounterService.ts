import { db } from '../config/db';
import { logger } from '../config/logger';
import { auditLogDao } from '../dao/auditLogDao';
import { appointmentDao } from '../dao/appointmentDao';
import { clinicProfessionalDao } from '../dao/clinicProfessionalDao';
import { clinicalEncounterDao } from '../dao/clinicalEncounterDao';
import { clinicalEncounterNoteDao } from '../dao/clinicalEncounterNoteDao';
import { patientDao } from '../dao/patientDao';
import { HttpError } from '../middlewares/errorHandler';
import type { ClinicalCapability } from '../middlewares/requireClinicalRole';
import type {
  ClinicalEncounterCancelReasonCode,
  ClinicalEncounterNoteRow,
  ClinicalEncounterRow,
  ClinicalEncounterStatus,
} from '../types/db';
import type { AuthContext } from './authService';
import { clinicalEncounterNoteService } from './clinicalEncounterNoteService';
import { clinicalReadAuditService } from './clinicalReadAuditService';

// Actor identity for clinical operations. The route stack guarantees:
//   1. requireAuth → req.auth populated
//   2. requireClinic → users.ativo=true + same clinic
//   3. requireClinicalRole → req.clinicalRoles populated
// Services never re-derive any of those from the HTTP request directly.
export interface ClinicalEncounterActor {
  clinica_id: string;
  usuario_id: string;
  clinicalRoles: Set<ClinicalCapability>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CANCEL_REASON_CODES: readonly ClinicalEncounterCancelReasonCode[] = [
  'duplicated',
  'wrong_patient',
  'data_error',
  'other',
];
const CANCEL_REASON_TEXT_MAX = 200;
const STATUS_VALUES: readonly ClinicalEncounterStatus[] = ['active', 'canceled'];

const LIST_DEFAULT_LIMIT = 50;
const LIST_MAX_LIMIT = 200;
const TIMELINE_MAX_LIMIT = 200;

// Bounds for started_at sanity (ADR 0010 §12). Future-too-far and past-too-far
// are rejected at 400 — these are validation safety nets, not the principal
// defense (the UI imposes its own choices).
const STARTED_AT_FUTURE_MAX_MS = 24 * 60 * 60 * 1000; // up to ~1 day ahead
const STARTED_AT_PAST_MAX_MS = 5 * 365 * 24 * 60 * 60 * 1000; // up to ~5 years back

function invalidEncounter(message: string): HttpError {
  return new HttpError(400, 'clinical_encounter_invalid', message);
}

// Generic 404 covers cross-clinic, archived, merged AND "professional reading
// a colleague's encounter". Same shape as patientService — anti-enumeration is
// the invariant: the caller cannot tell why a 404 happened.
function encounterNotFound(): HttpError {
  return new HttpError(404, 'encounter_not_found', 'Atendimento não encontrado.');
}

function patientNotFound(): HttpError {
  return new HttpError(404, 'patient_not_found', 'Paciente não encontrado.');
}

function parseUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw invalidEncounter(`Identificador inválido: ${field}.`);
  }
  return value;
}

function parseIsoDate(value: unknown, field: string): Date {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw invalidEncounter(`Data/hora obrigatória: ${field}.`);
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw invalidEncounter(`Data/hora inválida: ${field}.`);
  }
  return d;
}

function parseOptionalIsoDate(value: unknown, field: string): Date | null {
  if (value === undefined || value === null || value === '') return null;
  return parseIsoDate(value, field);
}

function parseCancelReasonCode(value: unknown): ClinicalEncounterCancelReasonCode {
  if (
    typeof value !== 'string' ||
    !(CANCEL_REASON_CODES as readonly string[]).includes(value)
  ) {
    throw new HttpError(
      400,
      'clinical_cancel_invalid',
      `Motivo de cancelamento inválido. Use um de: ${CANCEL_REASON_CODES.join(', ')}.`,
    );
  }
  return value as ClinicalEncounterCancelReasonCode;
}

// reason_text is OPTIONAL, length-bounded, and NEVER written to audit_logs.
// Free-text — we do NOT attempt automated PII detection (would false-positive
// on legitimate clinical text; ADR 0010 §12). Defense lies in:
//   - 200 char cap (here)
//   - DB CHECK length<=200 (defense in depth)
//   - logger never logs request bodies of /clinical/* (4.2B-3 logger guard)
function parseCancelReasonText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new HttpError(400, 'clinical_cancel_invalid', 'reason_text inválido.');
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > CANCEL_REASON_TEXT_MAX) {
    throw new HttpError(
      400,
      'clinical_cancel_invalid',
      `reason_text deve ter no máximo ${CANCEL_REASON_TEXT_MAX} caracteres.`,
    );
  }
  return trimmed;
}

function parseStatusFilter(value: unknown): ClinicalEncounterStatus | null {
  if (value === undefined || value === null || value === '') return null;
  if (
    typeof value !== 'string' ||
    !(STATUS_VALUES as readonly string[]).includes(value)
  ) {
    throw invalidEncounter('status inválido.');
  }
  return value as ClinicalEncounterStatus;
}

function parseLimit(value: unknown, defaultValue: number, max: number): number {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw invalidEncounter('limit inválido.');
  }
  const n = Number(value);
  if (n < 1 || n > max) {
    throw invalidEncounter(`limit deve estar entre 1 e ${max}.`);
  }
  return n;
}

function assertStartedAtReasonable(started_at: Date): void {
  const now = Date.now();
  const ts = started_at.getTime();
  if (ts - now > STARTED_AT_FUTURE_MAX_MS) {
    throw invalidEncounter('started_at não pode estar tão distante no futuro.');
  }
  if (now - ts > STARTED_AT_PAST_MAX_MS) {
    throw invalidEncounter('started_at não pode estar tão distante no passado.');
  }
}

function assertTimeOrder(started_at: Date, ended_at: Date | null): void {
  if (ended_at && ended_at.getTime() < started_at.getTime()) {
    throw invalidEncounter('ended_at deve ser maior ou igual a started_at.');
  }
}

// Determines the DAO self-filter to apply (ADR 0010 §6.1: "defense in DAO,
// not controller"). Owners and gestors see the whole clinic; profissionais
// see only their own encounters. The DAO ALWAYS applies the filter when
// non-null, so a forgotten check at the service layer still cannot leak.
function attendingSelfFilterFor(actor: ClinicalEncounterActor): string | null {
  if (
    actor.clinicalRoles.has('dono_clinica') ||
    actor.clinicalRoles.has('gestor_clinica')
  ) {
    return null;
  }
  return actor.usuario_id;
}

async function safeAudit(
  acao: string,
  recurso_id: string | null,
  actor: ClinicalEncounterActor,
  ctx: AuthContext,
): Promise<void> {
  try {
    await auditLogDao.create({
      acao,
      usuario_id: actor.usuario_id,
      clinica_id: actor.clinica_id,
      recurso: 'clinical_encounter',
      recurso_id,
      ip: ctx.ip,
      user_agent: ctx.user_agent,
      request_id: ctx.request_id,
    });
  } catch (err) {
    // audit_logs is administrative (write-side) audit. Best-effort here matches
    // the existing services (e.g. appointmentService). The CLINICAL READ audit
    // is a separate, stricter mechanism (clinicalReadAuditService) — do not
    // confuse the two.
    logger.error({ err, acao, audit_write_failed: true }, 'audit log write failed');
  }
}

// Public shapes for clinical encounter views (ADR 0010 §3.3, §11.2, §11.6).
//
// CRITICAL distinction — two projections, two audit categories:
//
//   PublicClinicalEncounterListItem (METADATA ONLY)
//     - Returned by `list` (GET /clinical/encounters) and by `listForPatient`
//       (GET /patients/:id/clinical-timeline).
//     - NEVER carries any of the 5 clinical textual fields
//       (chief_complaint, anamnesis, evolution, plan, internal_note) —
//       those columns do not exist on `clinical_encounters` at all; they
//       live exclusively in `clinical_encounter_notes` and are only joined
//       in `findById`. This is enforced by the schema, but we ALSO encode
//       it in the type to make the boundary explicit.
//     - Drops `cancel_reason_text` even though it's length-bounded to 200
//       chars. Defense in depth: the list view is for screen rendering of
//       schedules/cases and never needs the free-text cancellation note,
//       which only appears in the detail view (`findById`).
//     - Audit category: METADATA-LIST audit
//       (`clinical.encounter.list` / `clinical.timeline.list`).
//       The list/timeline endpoints are still gated by
//       `requireClinicalRole` and STILL emit a clinical_read_audit row;
//       the metadata-list audit is NOT a substitute for the content-read
//       audit emitted by `findById` (`clinical.encounter.read`).
//
//   PublicClinicalEncounter (DETAIL — metadata + cancel_reason_text)
//     - Returned by `create`, `findById`, `cancel`.
//     - In `findById`, the response also carries the encounter's notes
//       (the 5 textual fields, with `internal_note` redacted for non-author
//       readers via clinicalEncounterNoteService.applyInternalNoteRedaction).
//     - Audit category: CONTENT-READ audit (`clinical.encounter.read`,
//       emitted BEFORE any note row is loaded — strict-mode failure aborts
//       the request before clinical content leaves the server).
//
// Both projections explicitly LACK fields from `clinical_encounter_notes`.
// There is no DAO method that joins encounters with notes; notes are loaded
// only by `clinicalEncounterNoteDao.listByEncounter`, called only from
// `findById` (and `create` returns at most the id of the initial note,
// never its content).
export interface PublicClinicalEncounterListItem {
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
  created_at: Date;
  updated_at: Date;
}

export interface PublicClinicalEncounter extends PublicClinicalEncounterListItem {
  // Bounded free-text reason. Capped at 200 chars by DB CHECK and by the
  // service; NEVER written to audit_logs (no column for it). Available in
  // detail responses; OMITTED from list/timeline (see ListItem above).
  cancel_reason_text: string | null;
}

function toListItem(row: ClinicalEncounterRow): PublicClinicalEncounterListItem {
  return {
    id: row.id,
    clinica_id: row.clinica_id,
    patient_id: row.patient_id,
    attending_user_id: row.attending_user_id,
    professional_id: row.professional_id,
    appointment_id: row.appointment_id,
    started_at: row.started_at,
    ended_at: row.ended_at,
    status: row.status,
    canceled_at: row.canceled_at,
    canceled_by_user_id: row.canceled_by_user_id,
    cancel_reason_code: row.cancel_reason_code,
    // cancel_reason_text intentionally omitted — list/timeline are metadata
    // projections (see comment block on PublicClinicalEncounterListItem).
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toPublicEncounter(row: ClinicalEncounterRow): PublicClinicalEncounter {
  return {
    ...toListItem(row),
    cancel_reason_text: row.cancel_reason_text,
  };
}

export const clinicalEncounterService = {
  // Create a clinical encounter (with optional initial note). Requires the
  // actor to have the `profissional_clinico` grant — enforced at the route by
  // requireClinicalRole(['profissional_clinico']), AND re-checked here
  // defensively (ADR 0010 §7 row 1: owner alone cannot create — must have
  // the explicit clinical grant).
  async create(
    actor: ClinicalEncounterActor,
    body: {
      patient_id?: unknown;
      appointment_id?: unknown;
      professional_id?: unknown;
      started_at?: unknown;
      ended_at?: unknown;
      initial_note?: unknown;
    },
    ctx: AuthContext,
  ): Promise<{
    encounter: PublicClinicalEncounter;
    initial_note_id: string | null;
  }> {
    if (!actor.clinicalRoles.has('profissional_clinico')) {
      throw new HttpError(
        403,
        'forbidden_role',
        'Apenas profissionais clínicos podem criar atendimentos.',
      );
    }

    const patient_id = parseUuid(body.patient_id, 'patient_id');
    const started_at = parseIsoDate(body.started_at, 'started_at');
    assertStartedAtReasonable(started_at);
    const ended_at = parseOptionalIsoDate(body.ended_at, 'ended_at');
    assertTimeOrder(started_at, ended_at);

    let appointment_id: string | null = null;
    if (
      body.appointment_id !== undefined &&
      body.appointment_id !== null &&
      body.appointment_id !== ''
    ) {
      appointment_id = parseUuid(body.appointment_id, 'appointment_id');
    }
    let professional_id: string | null = null;
    if (
      body.professional_id !== undefined &&
      body.professional_id !== null &&
      body.professional_id !== ''
    ) {
      professional_id = parseUuid(body.professional_id, 'professional_id');
    }

    // Patient must be active + non-merged + same clinic (ADR 0010 §10.1).
    // Generic 404 on miss — anti-enumeration.
    const patient = await patientDao.findByIdForClinic(patient_id, actor.clinica_id);
    if (!patient || patient.status !== 'active' || patient.merged_into_id !== null) {
      throw patientNotFound();
    }

    // Appointment (optional) — same clinic + same patient.
    if (appointment_id) {
      const appt = await appointmentDao.findByIdForClinic(appointment_id, actor.clinica_id);
      if (!appt || appt.patient_id !== patient_id) {
        throw invalidEncounter('appointment_id inválido para este paciente.');
      }
    }

    // Professional (optional) — same clinic + active.
    if (professional_id) {
      const prof = await clinicProfessionalDao.findByIdForClinic(
        professional_id,
        actor.clinica_id,
      );
      if (!prof || !prof.is_active) {
        throw invalidEncounter('professional_id inválido para esta clínica.');
      }
    }

    // Initial note is OPTIONAL. When present, validates structure UPFRONT (so
    // we don't open a transaction for a payload that will be rejected) and
    // creates encounter + note in the same transaction.
    const initialNotePayload =
      body.initial_note !== undefined && body.initial_note !== null
        ? clinicalEncounterNoteService.normalizeInitialNotePayload(body.initial_note)
        : null;

    // Single transaction: encounter + (optional) initial note. A failure on
    // either rolls both back.
    const result = await db.transaction(async (trx) => {
      const encounterRow = await clinicalEncounterDao.create(
        {
          clinica_id: actor.clinica_id,
          patient_id,
          attending_user_id: actor.usuario_id,
          professional_id,
          appointment_id,
          started_at,
          ended_at,
        },
        trx,
      );
      let initial_note_id: string | null = null;
      if (initialNotePayload) {
        const noteRow = await clinicalEncounterNoteDao.create(
          {
            clinica_id: actor.clinica_id,
            encounter_id: encounterRow.id,
            author_user_id: actor.usuario_id,
            chief_complaint: initialNotePayload.chief_complaint,
            anamnesis: initialNotePayload.anamnesis,
            evolution: initialNotePayload.evolution,
            plan: initialNotePayload.plan,
            internal_note: initialNotePayload.internal_note,
            revises_note_id: null,
            rectification_reason_code: null,
          },
          trx,
        );
        initial_note_id = noteRow.id;
      }
      return { encounterRow, initial_note_id };
    });

    await safeAudit('clinical.encounter.created.success', result.encounterRow.id, actor, ctx);
    if (result.initial_note_id) {
      await safeAudit(
        'clinical.encounter.note.created.success',
        result.initial_note_id,
        actor,
        ctx,
      );
    }

    return {
      encounter: toPublicEncounter(result.encounterRow),
      initial_note_id: result.initial_note_id,
    };
  },

  // METADATA-LIST endpoint (ADR 0010 §3.3, §11.2). Returns at most `limit`
  // encounter rows of the actor's clinic, projected to PublicClinicalEncounterListItem
  // — explicitly EXCLUDES the 5 clinical textual fields (those live in
  // `clinical_encounter_notes` and are never joined by this DAO method) and
  // excludes `cancel_reason_text` (defense in depth — list is for table
  // rendering, not detail view).
  //
  // The audit emitted here (`clinical.encounter.list`) is a METADATA-LIST
  // audit: it records WHO listed metadata across the clinic, for what
  // filters, but does NOT substitute for the content-read audit
  // (`clinical.encounter.read`) which fires in `findById` and carries
  // `paciente_id`. The list audit carries `paciente_id=null` precisely
  // because the response crosses multiple patients (ADR 0010 §8.2 row 2).
  //
  // STRICT-MODE invariant still applies: if metadata-list audit persistence
  // fails, the response aborts (ADR 0010 §8.2.1). Even metadata access
  // must be traceable; an inability to record the access is a 500.
  //
  // For a profissional that is NOT also dono/gestor, the DAO self-filters
  // by attending_user_id (ADR 0010 §6.1 — defense in DAO).
  async list(
    actor: ClinicalEncounterActor,
    rawQuery: {
      patient_id?: unknown;
      professional_id?: unknown;
      attending_user_id?: unknown;
      status?: unknown;
      from?: unknown;
      to?: unknown;
      limit?: unknown;
    },
    ctx: AuthContext,
  ): Promise<{ encounters: PublicClinicalEncounterListItem[] }> {
    let patient_id: string | null = null;
    if (
      rawQuery.patient_id !== undefined &&
      rawQuery.patient_id !== null &&
      rawQuery.patient_id !== ''
    ) {
      patient_id = parseUuid(rawQuery.patient_id, 'patient_id');
    }
    let professional_id: string | null = null;
    if (
      rawQuery.professional_id !== undefined &&
      rawQuery.professional_id !== null &&
      rawQuery.professional_id !== ''
    ) {
      professional_id = parseUuid(rawQuery.professional_id, 'professional_id');
    }
    let attending_user_id: string | null = null;
    if (
      rawQuery.attending_user_id !== undefined &&
      rawQuery.attending_user_id !== null &&
      rawQuery.attending_user_id !== ''
    ) {
      attending_user_id = parseUuid(rawQuery.attending_user_id, 'attending_user_id');
    }
    const status = parseStatusFilter(rawQuery.status);
    const from =
      rawQuery.from !== undefined && rawQuery.from !== ''
        ? parseIsoDate(rawQuery.from, 'from')
        : null;
    const to =
      rawQuery.to !== undefined && rawQuery.to !== ''
        ? parseIsoDate(rawQuery.to, 'to')
        : null;
    if (from && to && to.getTime() <= from.getTime()) {
      throw invalidEncounter('to deve ser maior que from.');
    }
    const limit = parseLimit(rawQuery.limit, LIST_DEFAULT_LIMIT, LIST_MAX_LIMIT);

    // STRICT-MODE METADATA-LIST audit BEFORE the SELECT. If audit fails in
    // strict mode, the response aborts BEFORE metadata is fetched. recurso_id
    // is null and paciente_id is null — a list crosses multiple patients
    // (ADR 0010 §8.2 row 2) and the response carries no per-patient content.
    // This is a metadata-access audit; it does NOT cover content reads — those
    // require a separate `clinical.encounter.read` row from `findById`.
    await clinicalReadAuditService.recordReadAudit({
      actor: {
        usuario_id: actor.usuario_id,
        clinica_id: actor.clinica_id,
        clinicalRoles: actor.clinicalRoles,
      },
      ctx,
      acao: 'clinical.encounter.list',
      recurso: 'encounter',
      recurso_id: null,
      paciente_id: null,
    });

    // DAO returns `clinical_encounters` rows ONLY — no JOIN with
    // `clinical_encounter_notes`. The 5 clinical textual fields cannot
    // appear in this result by construction (they don't exist on this
    // table). `toListItem` further drops `cancel_reason_text`.
    const rows = await clinicalEncounterDao.listForClinic(actor.clinica_id, {
      patient_id,
      professional_id,
      attending_user_id,
      status,
      from,
      to,
      limit,
      attending_user_id_self: attendingSelfFilterFor(actor),
    });
    return { encounters: rows.map(toListItem) };
  },

  // CONTENT-READ endpoint (ADR 0010 §11.3). Returns the encounter + its
  // notes. This is the ONLY method in the service that joins encounter
  // metadata with clinical CONTENT (the 5 textual fields of the notes).
  //
  // STRICT-MODE invariant (ADR 0010 §8.2.1): the content-read audit row
  // (`clinical.encounter.read`) MUST be persisted with `paciente_id` set
  // BEFORE any note row is loaded. The audit happens after the encounter
  // metadata is fetched (we need `row.patient_id` for the audit) but BEFORE
  // `clinicalEncounterNoteDao.listByEncounter` — so a strict-mode audit
  // failure aborts the request and no clinical content leaves the server.
  //
  // The metadata-list audit (`clinical.encounter.list`) does NOT substitute
  // for this content-read audit — they're separate `acao` values precisely
  // because content access is a stricter event than metadata access.
  //
  // `internal_note` is redacted for non-author readers via the single
  // service helper `clinicalEncounterNoteService.applyInternalNoteRedaction`.
  // The DAO returns rows AS-IS; the service is the only auditable point
  // where redaction is decided.
  async findById(
    actor: ClinicalEncounterActor,
    id: string,
    ctx: AuthContext,
  ): Promise<{
    encounter: PublicClinicalEncounter;
    notes: ClinicalEncounterNoteRow[];
  }> {
    const encounterId = parseUuid(id, 'id');

    // DAO self-filter applies before any audit. Generic 404 on miss — the
    // caller cannot distinguish "wrong clinic", "wrong professional" or
    // "non-existent" from the response.
    const row = await clinicalEncounterDao.findByIdForClinic(encounterId, actor.clinica_id, {
      attending_user_id_self: attendingSelfFilterFor(actor),
    });
    if (!row) {
      throw encounterNotFound();
    }

    // STRICT-MODE CONTENT-READ audit BEFORE loading notes. recurso_id is
    // the encounter id; paciente_id is the (pseudonymized) patient UUID
    // — ADR 0010 §8.2 row 1. A strict-mode failure here throws 500
    // `clinical_read_audit_unavailable` and `clinicalEncounterNoteDao.listByEncounter`
    // is never called, so the 5 textual fields never leave the server
    // without a persisted audit row.
    await clinicalReadAuditService.recordReadAudit({
      actor: {
        usuario_id: actor.usuario_id,
        clinica_id: actor.clinica_id,
        clinicalRoles: actor.clinicalRoles,
      },
      ctx,
      acao: 'clinical.encounter.read',
      recurso: 'encounter',
      recurso_id: row.id,
      paciente_id: row.patient_id,
    });

    const noteRows = await clinicalEncounterNoteDao.listByEncounter(
      encounterId,
      actor.clinica_id,
    );
    // internal_note is redacted by the service helper for non-author readers.
    // The DAO returns rows AS-IS; redaction is the single, auditable point.
    const notes = noteRows.map((n) =>
      clinicalEncounterNoteService.applyInternalNoteRedaction(n, actor),
    );

    return {
      encounter: toPublicEncounter(row),
      notes,
    };
  },

  // METADATA-LIST endpoint scoped to ONE patient — clinical timeline
  // (ADR 0010 §11.6). Returns a list of encounter metadata
  // (PublicClinicalEncounterListItem), NOT clinical content. The 5 textual
  // fields are NEVER returned here; they only appear in `findById`. The
  // timeline gives the clinician/owner a chronological view of "what
  // encounters happened with this patient"; clicking a row opens the
  // detail view, which is what fires the content-read audit.
  //
  // The audit emitted here (`clinical.timeline.list`) DOES carry
  // `paciente_id` because the response is singled-out to one patient,
  // even though no content of those encounters is returned. The patient-
  // singling is the LGPD-relevant event, hence the patient id in the
  // audit. This audit row does NOT substitute for a per-encounter
  // content-read audit — `findById` emits `clinical.encounter.read` with
  // the encounter id whenever the clinician opens an entry.
  //
  // STRICT-MODE invariant still applies: timeline metadata access aborts
  // with 500 if the audit fails to persist (ADR 0010 §8.2.1).
  async listForPatient(
    actor: ClinicalEncounterActor,
    patient_id_param: string,
    rawQuery: { limit?: unknown },
    ctx: AuthContext,
  ): Promise<{ encounters: PublicClinicalEncounterListItem[] }> {
    const patient_id = parseUuid(patient_id_param, 'patient_id');
    const limit = parseLimit(rawQuery.limit, LIST_DEFAULT_LIMIT, TIMELINE_MAX_LIMIT);

    // Same-clinic existence check (404 generic on miss — even archived/merged
    // remain visible by ADR 0010 §10.3: the timeline of a secondary patient
    // still shows its OWN encounters, while the principal's timeline never
    // mixes them).
    const patient = await patientDao.findByIdForClinic(patient_id, actor.clinica_id);
    if (!patient) {
      throw patientNotFound();
    }

    // STRICT-MODE timeline-metadata audit BEFORE the SELECT. Carries
    // paciente_id because the read singles out one patient even though no
    // clinical content of those encounters is returned (ADR 0010 §8.2 row 3).
    await clinicalReadAuditService.recordReadAudit({
      actor: {
        usuario_id: actor.usuario_id,
        clinica_id: actor.clinica_id,
        clinicalRoles: actor.clinicalRoles,
      },
      ctx,
      acao: 'clinical.timeline.list',
      recurso: 'timeline',
      recurso_id: patient_id,
      paciente_id: patient_id,
    });

    // DAO returns `clinical_encounters` rows ONLY (no JOIN with notes).
    // `toListItem` further drops `cancel_reason_text` — timeline is a
    // metadata projection.
    const rows = await clinicalEncounterDao.listForPatient(
      actor.clinica_id,
      patient_id,
      {
        attending_user_id_self: attendingSelfFilterFor(actor),
        limit,
      },
    );
    return { encounters: rows.map(toListItem) };
  },

  // Cancel an encounter — the AUTHOR ONLY (ADR 0010 §7 row 3, §9.2). The DAO
  // CAS enforces (id, clinica_id, attending_user_id=actor, status='active');
  // missed CAS surfaces as a generic 404 — anti-enumeration of "belongs to
  // another clinician" vs. "already canceled".
  async cancel(
    actor: ClinicalEncounterActor,
    id: string,
    body: { reason_code?: unknown; reason_text?: unknown },
    ctx: AuthContext,
  ): Promise<PublicClinicalEncounter> {
    if (!actor.clinicalRoles.has('profissional_clinico')) {
      throw new HttpError(
        403,
        'forbidden_role',
        'Apenas profissionais clínicos podem cancelar atendimentos.',
      );
    }
    const encounterId = parseUuid(id, 'id');
    const reason_code = parseCancelReasonCode(body.reason_code);
    const reason_text = parseCancelReasonText(body.reason_text);

    const row = await clinicalEncounterDao.cancelOwn(
      encounterId,
      actor.clinica_id,
      actor.usuario_id,
      reason_code,
      reason_text,
    );
    if (!row) {
      throw encounterNotFound();
    }
    await safeAudit('clinical.encounter.canceled.success', row.id, actor, ctx);
    return toPublicEncounter(row);
  },
};
