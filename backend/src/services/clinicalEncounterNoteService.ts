import { logger } from '../config/logger';
import { auditLogDao } from '../dao/auditLogDao';
import { clinicalEncounterDao } from '../dao/clinicalEncounterDao';
import { clinicalEncounterNoteDao } from '../dao/clinicalEncounterNoteDao';
import { HttpError } from '../middlewares/errorHandler';
import type { ClinicalCapability } from '../middlewares/requireClinicalRole';
import type {
  ClinicalEncounterNoteRow,
  ClinicalNoteRectificationReasonCode,
} from '../types/db';
import type { AuthContext } from './authService';

// Actor identity for note operations. Same contract as
// ClinicalEncounterActor — duplicated locally to keep the file self-contained
// for testing without dragging the encounter service's broader dependencies.
export interface ClinicalNoteActor {
  clinica_id: string;
  usuario_id: string;
  clinicalRoles: Set<ClinicalCapability>;
}

// ADR 0010 §3.2 — exact length caps per textual field. Defense in depth: the
// DB ALSO enforces these via CHECK (clinical_encounter_notes_lengths_check),
// but the service rejects oversize input at the edge to keep payloads bounded
// before any DB round-trip.
const FIELD_LENGTH_LIMITS = {
  chief_complaint: 2000,
  anamnesis: 8000,
  evolution: 8000,
  plan: 4000,
  internal_note: 2000,
} as const;

const RECTIFICATION_REASON_CODES: readonly ClinicalNoteRectificationReasonCode[] = [
  'typo',
  'clinical_correction',
  'add_info',
  'other',
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function invalidNote(message: string): HttpError {
  return new HttpError(400, 'clinical_note_invalid', message);
}
function noteNotFound(): HttpError {
  return new HttpError(404, 'clinical_note_not_found', 'Nota clínica não encontrada.');
}
function encounterNotFound(): HttpError {
  return new HttpError(404, 'encounter_not_found', 'Atendimento não encontrado.');
}

function parseUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw invalidNote(`Identificador inválido: ${field}.`);
  }
  return value;
}

// Normalizes one of the 5 textual fields:
//   - undefined/null/empty → null
//   - non-string             → 400
//   - oversize               → 400 (length cap, ADR 0010 §3.2)
// NEVER logs the value (the value IS the clinical content; logger doesn't see it).
function normalizeField(
  value: unknown,
  field: keyof typeof FIELD_LENGTH_LIMITS,
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw invalidNote(`${field} inválido.`);
  }
  // Trim only leading/trailing whitespace; preserve internal newlines (clinical
  // text legitimately spans paragraphs).
  const trimmed = value.replace(/^\s+|\s+$/g, '');
  if (trimmed.length === 0) return null;
  const cap = FIELD_LENGTH_LIMITS[field];
  if (trimmed.length > cap) {
    throw invalidNote(`${field} deve ter no máximo ${cap} caracteres.`);
  }
  return trimmed;
}

function parseRectificationReasonCode(value: unknown): ClinicalNoteRectificationReasonCode {
  if (
    typeof value !== 'string' ||
    !(RECTIFICATION_REASON_CODES as readonly string[]).includes(value)
  ) {
    throw invalidNote(
      `Motivo de retificação inválido. Use um de: ${RECTIFICATION_REASON_CODES.join(', ')}.`,
    );
  }
  return value as ClinicalNoteRectificationReasonCode;
}

// Public field set for a note (5 textual fields + chain metadata + identifiers).
// Notes don't have UPDATE — this is the only shape callers ever see.
export interface PublicClinicalEncounterNote {
  id: string;
  encounter_id: string;
  author_user_id: string;
  chief_complaint: string | null;
  anamnesis: string | null;
  evolution: string | null;
  plan: string | null;
  // internal_note: REDACTED to null for non-author readers (ADR 0010 §7
  // row 9). Owners/gestors keep visibility.
  internal_note: string | null;
  revises_note_id: string | null;
  rectification_reason_code: ClinicalNoteRectificationReasonCode | null;
  created_at: Date;
}

// Redacts internal_note for readers who are NEITHER the author NOR an owner/
// gestor. Returns a NEW object (immutable) so the original DAO row is never
// mutated in place — important because the row may be read again later for
// audit/log purposes (without leaking).
//
// This is the SINGLE auditable point for internal_note visibility. The DAO
// always returns the raw column; the controller (4.2B-3) is forbidden from
// returning the raw DAO row directly — it MUST go through this helper.
function applyInternalNoteRedaction(
  note: ClinicalEncounterNoteRow,
  actor: ClinicalNoteActor,
): ClinicalEncounterNoteRow {
  const isAuthor = note.author_user_id === actor.usuario_id;
  const isOwnerOrGestor =
    actor.clinicalRoles.has('dono_clinica') || actor.clinicalRoles.has('gestor_clinica');
  if (isAuthor || isOwnerOrGestor) {
    return note;
  }
  return { ...note, internal_note: null };
}

// Normalize a payload for an INITIAL note (used by the encounter create flow).
// Returns null if every field is empty (caller decides whether that's allowed
// — for initial notes, an empty payload means "no initial note", not 400).
// Returns the normalized payload otherwise. Throws 400 on a structurally
// invalid input (non-object, oversize field, etc.).
export interface NormalizedNotePayload {
  chief_complaint: string | null;
  anamnesis: string | null;
  evolution: string | null;
  plan: string | null;
  internal_note: string | null;
}

function normalizeNotePayloadFields(raw: unknown): NormalizedNotePayload {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw invalidNote('Payload de nota inválido.');
  }
  const body = raw as Record<string, unknown>;
  return {
    chief_complaint: normalizeField(body.chief_complaint, 'chief_complaint'),
    anamnesis: normalizeField(body.anamnesis, 'anamnesis'),
    evolution: normalizeField(body.evolution, 'evolution'),
    plan: normalizeField(body.plan, 'plan'),
    internal_note: normalizeField(body.internal_note, 'internal_note'),
  };
}

function hasContent(payload: NormalizedNotePayload): boolean {
  return (
    payload.chief_complaint !== null ||
    payload.anamnesis !== null ||
    payload.evolution !== null ||
    payload.plan !== null ||
    payload.internal_note !== null
  );
}

async function safeAudit(
  acao: string,
  recurso_id: string | null,
  actor: ClinicalNoteActor,
  ctx: AuthContext,
): Promise<void> {
  try {
    await auditLogDao.create({
      acao,
      usuario_id: actor.usuario_id,
      clinica_id: actor.clinica_id,
      // The note belongs to a clinical encounter; the recurso labels the
      // sub-resource cleanly. Audit_logs is administrative — never carries
      // clinical content (ADR 0010 §8.1).
      recurso: 'clinical_encounter_note',
      recurso_id,
      ip: ctx.ip,
      user_agent: ctx.user_agent,
      request_id: ctx.request_id,
    });
  } catch (err) {
    // Best-effort administrative audit. Clinical READ audit is governed by a
    // SEPARATE service (clinicalReadAuditService) and is strict in prod.
    logger.error({ err, acao, audit_write_failed: true }, 'audit log write failed');
  }
}

export const clinicalEncounterNoteService = {
  // Exposed so the encounter service can validate an `initial_note` payload
  // BEFORE opening the create transaction. Returns null when every field is
  // empty (interpreted by the caller as "no initial note").
  normalizeInitialNotePayload(raw: unknown): NormalizedNotePayload | null {
    const payload = normalizeNotePayloadFields(raw);
    if (!hasContent(payload)) return null;
    return payload;
  },

  // Exposed so the encounter service (and 4.2B-3 controllers) can apply
  // internal_note redaction at the response boundary. The DAO always returns
  // the raw row; redaction is the single auditable point.
  applyInternalNoteRedaction,

  // Create a new note for an encounter. ALSO handles rectification: when
  // `revises_note_id` is present, the new note must:
  //   - belong to the SAME encounter as the revised note;
  //   - be authored by the SAME user that authored the revised note
  //     (ADR 0010 §9.1 — preserves authorship);
  //   - carry a rectification_reason_code.
  // The original note is NEVER updated; the chain preserves all versions
  // (append-only invariant — there is no UPDATE method on the DAO).
  async create(
    actor: ClinicalNoteActor,
    encounter_id_param: string,
    body: {
      chief_complaint?: unknown;
      anamnesis?: unknown;
      evolution?: unknown;
      plan?: unknown;
      internal_note?: unknown;
      revises_note_id?: unknown;
      rectification_reason_code?: unknown;
    },
    ctx: AuthContext,
  ): Promise<PublicClinicalEncounterNote> {
    if (!actor.clinicalRoles.has('profissional_clinico')) {
      throw new HttpError(
        403,
        'forbidden_role',
        'Apenas profissionais clínicos podem registrar notas clínicas.',
      );
    }

    const encounter_id = parseUuid(encounter_id_param, 'encounter_id');
    const payload = normalizeNotePayloadFields(body);
    if (!hasContent(payload)) {
      throw invalidNote('Pelo menos um campo textual é obrigatório.');
    }

    // Rectification + reason_code must come together (DB CHECK also enforces,
    // but a clean 400 at the edge is better than a generic constraint error).
    let revises_note_id: string | null = null;
    let rectification_reason_code: ClinicalNoteRectificationReasonCode | null = null;
    const wantsRectification =
      body.revises_note_id !== undefined &&
      body.revises_note_id !== null &&
      body.revises_note_id !== '';
    const hasReason =
      body.rectification_reason_code !== undefined &&
      body.rectification_reason_code !== null &&
      body.rectification_reason_code !== '';
    if (wantsRectification !== hasReason) {
      throw invalidNote(
        'revises_note_id e rectification_reason_code devem ser preenchidos juntos.',
      );
    }
    if (wantsRectification && hasReason) {
      revises_note_id = parseUuid(body.revises_note_id, 'revises_note_id');
      rectification_reason_code = parseRectificationReasonCode(
        body.rectification_reason_code,
      );
    }

    // Encounter must exist in the actor's clinic AND the actor must be the
    // attending professional (ADR 0010 §7 row 4: "add note to own encounter").
    // The DAO self-filter enforces attending_user_id = actor; a non-author
    // gets a generic 404 — anti-enumeration of "you're not the attending".
    const encounter = await clinicalEncounterDao.findByIdForClinic(
      encounter_id,
      actor.clinica_id,
      { attending_user_id_self: actor.usuario_id },
    );
    if (!encounter) {
      throw encounterNotFound();
    }
    // No notes on a canceled encounter — historical evidence; new content
    // belongs to a new encounter.
    if (encounter.status !== 'active') {
      throw invalidNote('Não é possível adicionar notas a um atendimento cancelado.');
    }

    // Rectification target must exist in the SAME encounter AND be authored by
    // the actor (ADR 0010 §9.1 — preserves authorship of the chain).
    if (revises_note_id) {
      const target = await clinicalEncounterNoteDao.findByIdInEncounter(
        revises_note_id,
        encounter_id,
        actor.clinica_id,
      );
      if (!target) {
        // Generic 404 — could be wrong encounter, wrong clinic, or non-existent.
        throw noteNotFound();
      }
      if (target.author_user_id !== actor.usuario_id) {
        // Defense in depth — the author can only rectify their own notes.
        // Same 404 to avoid enumerating "exists but not yours".
        throw noteNotFound();
      }
    }

    const row = await clinicalEncounterNoteDao.create({
      clinica_id: actor.clinica_id,
      encounter_id,
      author_user_id: actor.usuario_id,
      chief_complaint: payload.chief_complaint,
      anamnesis: payload.anamnesis,
      evolution: payload.evolution,
      plan: payload.plan,
      internal_note: payload.internal_note,
      revises_note_id,
      rectification_reason_code,
    });

    const acao = revises_note_id
      ? 'clinical.encounter.note.rectified.success'
      : 'clinical.encounter.note.created.success';
    await safeAudit(acao, row.id, actor, ctx);

    // Always apply the redaction projection at the boundary, even though the
    // author CAN see internal_note — keeps the public shape consistent.
    const redacted = applyInternalNoteRedaction(row, actor);
    return {
      id: redacted.id,
      encounter_id: redacted.encounter_id,
      author_user_id: redacted.author_user_id,
      chief_complaint: redacted.chief_complaint,
      anamnesis: redacted.anamnesis,
      evolution: redacted.evolution,
      plan: redacted.plan,
      internal_note: redacted.internal_note,
      revises_note_id: redacted.revises_note_id,
      rectification_reason_code: redacted.rectification_reason_code,
      created_at: redacted.created_at,
    };
  },
};
