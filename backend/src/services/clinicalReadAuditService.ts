import type { Knex } from 'knex';
import { env } from '../config/env';
import { logger } from '../config/logger';
import {
  clinicalReadAuditDao,
  type ClinicalReadAuditRecurso,
} from '../dao/clinicalReadAuditDao';
import { HttpError } from '../middlewares/errorHandler';
import type { ClinicalCapability } from '../middlewares/requireClinicalRole';
import type { AuthContext } from './authService';

// Allowlist of `acao` values the v0.1 of the Prontuário emits (ADR 0010 §8.2).
// The DB CHECK in clinical_read_audit.acao_prefix_check requires 'clinical.*',
// but the service ALSO restricts to this finite set so a typo at the call site
// is caught before reaching the DB.
//
// Three distinct audit categories — DO NOT collapse them:
//   - 'clinical.encounter.read'   — CONTENT-READ audit. Fires from findById
//                                   when the response carries the 5 textual
//                                   fields of `clinical_encounter_notes`.
//                                   `paciente_id` is REQUIRED (single-patient
//                                   content access).
//   - 'clinical.encounter.list'   — METADATA-LIST audit. Fires from list
//                                   (cross-patient listing) when the response
//                                   carries only encounter metadata (no
//                                   textual fields, no cancel_reason_text).
//                                   `paciente_id` is null (multi-patient).
//                                   This does NOT substitute for a
//                                   content-read audit.
//   - 'clinical.timeline.list'    — TIMELINE-METADATA audit. Fires from
//                                   listForPatient (single-patient
//                                   listing). Carries `paciente_id` because
//                                   the response is singled out to one
//                                   patient even though it has no content.
//                                   Does NOT substitute for content-read.
const ALLOWED_ACOES = new Set<string>([
  'clinical.encounter.read',
  'clinical.encounter.list',
  'clinical.timeline.list',
  // Sprint 4.3B — Documentos Médicos v0.1 (ADR 0011 §8.2):
  //   - 'clinical.document.list'             — METADATA-LIST (cross-patient
  //                                            or single-patient listing).
  //   - 'clinical.document.read'             — CONTENT-READ (body + metadata_json).
  //                                            Always STRICT mode.
  //   - 'clinical.document.pdf.downloaded'   — PDF download (clinical content
  //                                            in PDF form). Always STRICT mode.
  'clinical.document.list',
  'clinical.document.read',
  'clinical.document.pdf.downloaded',
]);

// Actor identity for a clinical read. usuario_id is required (this code path is
// always gated by requireAuth → requireClinic → requireClinicalRole, so there
// is no anonymous clinical read).
export interface ClinicalReadActor {
  usuario_id: string;
  clinica_id: string;
  // Set of effective clinical capabilities (populated by requireClinicalRole).
  // Used to compute `papel_at_read` — the SNAPSHOT recorded in the audit row.
  clinicalRoles: Set<ClinicalCapability>;
}

export interface RecordReadAuditInput {
  actor: ClinicalReadActor;
  ctx: AuthContext;
  acao: string;
  recurso: ClinicalReadAuditRecurso;
  recurso_id?: string | null;
  // Pseudonymized patient id (UUID). Required for single-patient reads (encounter
  // detail, timeline). For aggregate lists that cross multiple patients, pass
  // null — ADR 0010 §8.2 row 2.
  paciente_id?: string | null;
}

// Pick the most-privileged role for the snapshot. Order follows ADR 0010 §6.2:
// dono_clinica > gestor_clinica > profissional_clinico. The snapshot is anti-
// stale (ADR 0009 §6.2): if the role is revoked later, the row still preserves
// the role in force at read time.
function pickPapelAtRead(roles: Set<ClinicalCapability>): string {
  if (roles.has('dono_clinica')) return 'dono_clinica';
  if (roles.has('gestor_clinica')) return 'gestor_clinica';
  if (roles.has('profissional_clinico')) return 'profissional_clinico';
  // Should not happen — requireClinicalRole would have rejected first. Fail
  // closed with an opaque label so any leaked row is recognizable as a bug.
  return 'unknown';
}

// Read-audit unavailable error (ADR 0010 §8.2.1). The SAME error code is used
// in strict mode regardless of whether the audit DB write failed or the input
// was malformed — anti-enumeration of internal failure modes. Controllers MUST
// surface this as 500 and NEVER include clinical content in the body.
function readAuditUnavailable(): HttpError {
  return new HttpError(
    500,
    'clinical_read_audit_unavailable',
    'Não foi possível registrar a auditoria de leitura clínica. Tente novamente.',
  );
}

// Internal helper. Persists the row. Throws on failure.
async function persist(input: RecordReadAuditInput, conn?: Knex): Promise<void> {
  if (!ALLOWED_ACOES.has(input.acao)) {
    // Defense in depth — a typo at the call site would otherwise bypass the
    // allowlist. Thrown BEFORE any DB write so neither strict nor best-effort
    // emits a malformed row.
    throw new Error(`clinicalReadAuditService: unknown acao '${input.acao}'`);
  }
  const papel_at_read = pickPapelAtRead(input.actor.clinicalRoles);
  await clinicalReadAuditDao.record(
    {
      clinica_id: input.actor.clinica_id,
      usuario_id: input.actor.usuario_id,
      papel_at_read,
      acao: input.acao,
      recurso: input.recurso,
      recurso_id: input.recurso_id ?? null,
      paciente_id: input.paciente_id ?? null,
      request_id: input.ctx.request_id,
      ip: input.ctx.ip,
      user_agent: input.ctx.user_agent,
    },
    conn,
  );
}

// PRIMARY COMPENSATING CONTROL for the absence of column-level encryption in
// v0.1 (ADR 0010 §13). This service is consumed by every endpoint that
// returns clinical CONTENT. Two behaviors:
//
//   STRICT MODE (CLINICAL_READ_AUDIT_STRICT=true; FORCED in production by the
//   env guard in config/env.ts since Sprint 4.2B-1):
//     - persist() failure → throws clinical_read_audit_unavailable (HTTP 500).
//     - The controller MUST abort BEFORE serializing any clinical content
//       into the response body. There is no fallback path that returns
//       content without an audit row.
//
//   BEST-EFFORT MODE (CLINICAL_READ_AUDIT_STRICT=false; default in dev/test):
//     - persist() failure → logged at level `error` (without PII, without
//       paciente_id, without clinical content) and the request continues.
//     - Acceptable ONLY in dev/staging with SYNTHETIC data. Production is
//       blocked at boot.
//
// In both modes:
//   - clinical content is NEVER logged (this service does not receive
//     content at all — only identifiers + role snapshot + request metadata).
//   - paciente_id is NEVER logged on failure — it is pseudonymized PII
//     (ADR 0009 §6.2 / ADR 0010 §5.3).
//   - The error message returned to the client carries NO internal details.
export const clinicalReadAuditService = {
  // Strict-mode emit (alias kept for callers that want explicit naming).
  async recordStrict(input: RecordReadAuditInput, conn?: Knex): Promise<void> {
    return persist(input, conn);
  },

  // Best-effort emit (alias).
  async recordBestEffort(input: RecordReadAuditInput, conn?: Knex): Promise<void> {
    try {
      await persist(input, conn);
    } catch (err) {
      // No PII / no paciente_id / no clinical content in the log payload.
      logger.error(
        { err, acao: input.acao, clinical_read_audit_failed: true },
        'clinical read audit write failed (best-effort)',
      );
    }
  },

  // Convenience: pick the right mode from env. Controllers usually call this
  // and don't think about strict vs. best-effort. Tests that want to assert
  // strict-mode behavior may call recordStrict directly.
  async recordReadAudit(input: RecordReadAuditInput, conn?: Knex): Promise<void> {
    if (env.CLINICAL_READ_AUDIT_STRICT) {
      try {
        await persist(input, conn);
      } catch (err) {
        logger.error(
          { err, acao: input.acao, clinical_read_audit_failed: true },
          'clinical read audit write failed (strict — aborting response)',
        );
        throw readAuditUnavailable();
      }
      return;
    }
    try {
      await persist(input, conn);
    } catch (err) {
      logger.error(
        { err, acao: input.acao, clinical_read_audit_failed: true },
        'clinical read audit write failed (best-effort)',
      );
    }
  },
};
