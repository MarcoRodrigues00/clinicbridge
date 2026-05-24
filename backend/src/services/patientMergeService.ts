import { db } from '../config/db';
import { logger } from '../config/logger';
import { appointmentDao } from '../dao/appointmentDao';
import { auditLogDao } from '../dao/auditLogDao';
import { patientDao, type UpdatePatientFields } from '../dao/patientDao';
import { HttpError } from '../middlewares/errorHandler';
import { toPublicPatient, type PatientRow, type PublicPatient } from '../models/patient';
import type { AuthContext } from './authService';
import type { PatientListActor } from './patientService';

// Capped on the server. Keeping this conservative for the first sprint of the
// merge feature; the ADR allows up to ~50. No env knob — the ADR fixes the
// behaviour, and an env would invite per-tenant tweaking that's out of scope.
const PATIENT_MERGE_MAX_SECONDARIES = 10;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Administrative fields the fill-blanks pass is allowed to touch. Intentionally
// excludes `nome` (the owner already picked which name survives by choosing the
// primary) and any clinical field (none exist in the MVP and none may be added
// here — Opção C / ADR 0001).
const FILLABLE_FIELDS = [
  'telefone',
  'email',
  'cpf',
  'data_nascimento',
  'convenio',
  'numero_carteirinha',
] as const;
type FillableField = (typeof FILLABLE_FIELDS)[number];

export interface PatientMergeResult {
  patient: PublicPatient;
  merge: {
    merged_count: number;
    moved_appointments_count: number;
    archived_secondary_ids: string[];
    filled_fields: FillableField[];
  };
}

function invalidMerge(message: string): HttpError {
  return new HttpError(400, 'merge_invalid', message);
}

// Generic 404 mirrors patientService — same code for "doesn't exist", "wrong
// clinic" and "not eligible (archived/merged)". Anti-enumeration: a caller can
// never distinguish those three cases from the response.
function patientNotFound(): HttpError {
  return new HttpError(404, 'patient_not_found', 'Paciente não encontrado.');
}

function parsePrimaryId(value: unknown): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw invalidMerge('Identificador do paciente principal inválido.');
  }
  return value;
}

function parseSecondaryIds(raw: unknown, primaryId: string): string[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw invalidMerge('Informe ao menos um secondary_id.');
  }
  if (raw.length > PATIENT_MERGE_MAX_SECONDARIES) {
    throw invalidMerge(
      `Máximo de ${PATIENT_MERGE_MAX_SECONDARIES} pacientes secundários por chamada.`,
    );
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string' || !UUID_RE.test(item)) {
      throw invalidMerge('secondary_ids contém identificador inválido.');
    }
    if (item === primaryId) {
      throw invalidMerge('Principal não pode estar em secondary_ids.');
    }
    if (seen.has(item)) {
      throw invalidMerge('secondary_ids contém identificadores duplicados.');
    }
    seen.add(item);
    out.push(item);
  }
  return out;
}

// "Blank" for fill-blanks means null OR empty string. The DAO normalises
// missing fields to null, but historic import rows could carry an empty string,
// and treating "" as blank is safer than treating it as a meaningful value.
function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim().length === 0) return true;
  return false;
}

// Builds the fill-blanks patch deterministically. For each blank field on the
// primary, walks the secondaries in the order the caller sent and picks the
// first non-blank value. Never overwrites; never touches `nome`; never touches
// anything outside FILLABLE_FIELDS.
function buildFillBlanksPatch(
  primary: PatientRow,
  secondariesInRequestOrder: PatientRow[],
): { patch: Partial<UpdatePatientFields>; filled: FillableField[] } {
  const patch: Partial<UpdatePatientFields> = {};
  const filled: FillableField[] = [];
  for (const field of FILLABLE_FIELDS) {
    if (!isBlank(primary[field])) continue;
    for (const sec of secondariesInRequestOrder) {
      const value = sec[field];
      if (!isBlank(value)) {
        // value is `string | null` per PatientRow, and not blank — safe to assign.
        (patch as Record<string, unknown>)[field] = value;
        filled.push(field);
        break;
      }
    }
  }
  return { patch, filled };
}

export const patientMergeService = {
  // Owner-only safe duplicate merge B-safe (Sprint 3.33; ADR 0007).
  //
  // In one transaction: validates eligibility, runs a non-destructive
  // fill-blanks on the primary, reassigns each secondary's appointments to the
  // primary tenant-scoped, archives each secondary with provenance via CAS,
  // and writes one audit row per (primary, secondary) pair. The CAS protects
  // against concurrent changes to the secondary status — if it misses, the
  // whole transaction rolls back and the caller gets a generic 404.
  //
  // No clinical data is touched. No physical delete. No snapshot/undo. The
  // response never exposes raw CPF, secondary patient values, or per-patient
  // counts that could become PII.
  async merge(
    actor: PatientListActor,
    primaryIdParam: string,
    rawBody: unknown,
    ctx: AuthContext,
  ): Promise<PatientMergeResult> {
    const primaryId = parsePrimaryId(primaryIdParam);
    const body = (rawBody ?? {}) as { secondary_ids?: unknown };
    const secondaryIds = parseSecondaryIds(body.secondary_ids, primaryId);

    return db.transaction(async (trx) => {
      const primary = await patientDao.findByIdForClinic(primaryId, actor.clinica_id, trx);
      if (!primary || primary.status !== 'active' || primary.merged_into_id !== null) {
        throw patientNotFound();
      }

      // Re-fetch each secondary inside the transaction. Anti-enumeration: any
      // missing/archived/cross-tenant id collapses to the same 404 below.
      const secondaries: PatientRow[] = [];
      for (const sid of secondaryIds) {
        const sec = await patientDao.findByIdForClinic(sid, actor.clinica_id, trx);
        if (!sec || sec.status !== 'active' || sec.merged_into_id !== null) {
          throw patientNotFound();
        }
        secondaries.push(sec);
      }

      // Fill-blanks order = secondary_ids as sent by the caller. This matches
      // the future UI (3.34): the user picks the secondary they trust most,
      // first; subsequent ones only fill what's still blank.
      const { patch, filled } = buildFillBlanksPatch(primary, secondaries);

      let updatedPrimary = primary;
      if (Object.keys(patch).length > 0) {
        const row = await patientDao.applyFillBlanks(primaryId, actor.clinica_id, patch, trx);
        // The primary was just fetched in this transaction — a missing row here
        // means it was deleted concurrently (not possible: there is no physical
        // delete) or a logic bug. Either way: bail with a 404.
        if (!row) throw patientNotFound();
        updatedPrimary = row;
      }

      let movedTotal = 0;
      const archivedIds: string[] = [];
      for (const sec of secondaries) {
        const moved = await appointmentDao.reassignPatientForClinic(
          sec.id,
          primaryId,
          actor.clinica_id,
          trx,
        );
        movedTotal += moved;

        const archived = await patientDao.setMergedInto(sec.id, actor.clinica_id, primaryId, trx);
        if (!archived) {
          // CAS missed — concurrent change moved the secondary out of 'active',
          // or it acquired a merged_into_id since we fetched it. Roll back and
          // surface the same generic 404 (no enumeration of the failure mode).
          throw patientNotFound();
        }
        archivedIds.push(sec.id);

        // Audit one row per pair INSIDE the transaction so a rollback erases
        // the audit too — never leave inflated evidence behind. recurso_id is
        // "<primaryId>|<secondaryId>" (73 chars, fits in varchar(80)). No PII.
        try {
          await auditLogDao.create(
            {
              acao: 'patient.merge.success',
              usuario_id: actor.usuario_id,
              clinica_id: actor.clinica_id,
              recurso: 'patient',
              recurso_id: `${primaryId}|${sec.id}`,
              ip: ctx.ip,
              user_agent: ctx.user_agent,
              request_id: ctx.request_id,
            },
            trx,
          );
        } catch (err) {
          // Audit must not silently fail in the middle of a merge — promote it
          // to a transaction-aborting error so the operation is rolled back.
          // This is stricter than the read paths, which tolerate audit loss.
          logger.error({ err, acao: 'patient.merge.success', audit_write_failed: true }, 'audit log write failed');
          throw err;
        }
      }

      return {
        patient: toPublicPatient(updatedPrimary),
        merge: {
          merged_count: archivedIds.length,
          moved_appointments_count: movedTotal,
          archived_secondary_ids: archivedIds,
          filled_fields: filled,
        },
      };
    });
  },
};
