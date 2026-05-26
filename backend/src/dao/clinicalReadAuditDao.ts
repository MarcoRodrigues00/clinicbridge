import type { Knex } from 'knex';
import { db } from '../config/db';
import type { ClinicalReadAuditRow } from '../types/db';

// Column max lengths mirror the clinical_read_audit migration. The DAO truncates
// inputs to these bounds so a long header/UA value never aborts a clinical-read
// audit write — the event itself matters more than full fidelity of metadata.
export const CLINICAL_READ_AUDIT_LIMITS = {
  papel_at_read: 40,
  acao: 60,
  recurso: 30,
  recurso_id: 80,
  request_id: 64,
  ip: 45,
  user_agent: 255,
} as const;

export type ClinicalReadAuditRecurso = ClinicalReadAuditRow['recurso'];

export interface ClinicalReadAuditInput {
  clinica_id: string | null;
  usuario_id: string | null;
  // Snapshot of the EFFECTIVE role at the moment of the read. Anti-stale:
  // if the role is revoked later, the historical row preserves the role
  // that was in force when the read happened.
  papel_at_read: string;
  // DB CHECK enforces the 'clinical.' prefix; the service ALSO validates
  // against an allowlist before reaching here.
  acao: string;
  recurso: ClinicalReadAuditRecurso;
  recurso_id?: string | null;
  // INTERNAL PSEUDONYMIZED IDENTIFIER (UUID) — personal data under LGPD.
  // Required for LGPD-art.18 transparency to the data subject (who read my
  // chart?). NEVER logged outside this table; NEVER paired with PII in this
  // row.
  paciente_id?: string | null;
  request_id?: string | null;
  ip?: string | null;
  user_agent?: string | null;
}

function clip(value: string | null | undefined, max: number): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

// Append-only DAO. Mirrors auditLogDao (Sprint 1.5) intentionally — both
// tables are evidentiary and immutable at the application layer.
//
// There is INTENTIONALLY NO update() or delete() method. clinical_read_audit
// is the primary compensating control for the absence of column-level
// encryption (ADR 0010 §13) and for LGPD-art.18 transparency to data
// subjects. Mutating an audit row is a security incident, not a feature.
//
// This DAO never holds or returns clinical CONTENT (chief_complaint,
// anamnesis, evolution, plan, internal_note, cancel_reason_text,
// rectification_reason_text) — only identifiers.
export const clinicalReadAuditDao = {
  async record(input: ClinicalReadAuditInput, conn: Knex = db): Promise<ClinicalReadAuditRow> {
    const acao = clip(input.acao, CLINICAL_READ_AUDIT_LIMITS.acao);
    const papel = clip(input.papel_at_read, CLINICAL_READ_AUDIT_LIMITS.papel_at_read);
    if (!acao) {
      throw new Error('clinicalReadAuditDao.record: acao is required.');
    }
    if (!papel) {
      throw new Error('clinicalReadAuditDao.record: papel_at_read is required.');
    }
    const [row] = await conn<ClinicalReadAuditRow>('clinical_read_audit')
      .insert({
        clinica_id: input.clinica_id,
        usuario_id: input.usuario_id,
        papel_at_read: papel,
        acao,
        recurso: input.recurso,
        recurso_id: clip(input.recurso_id, CLINICAL_READ_AUDIT_LIMITS.recurso_id),
        paciente_id: input.paciente_id ?? null,
        request_id: clip(input.request_id, CLINICAL_READ_AUDIT_LIMITS.request_id),
        ip: clip(input.ip, CLINICAL_READ_AUDIT_LIMITS.ip),
        user_agent: clip(input.user_agent, CLINICAL_READ_AUDIT_LIMITS.user_agent),
      })
      .returning('*');
    if (!row) {
      throw new Error('clinicalReadAuditDao.record: insert returned no row');
    }
    return row;
  },
};
