import type { Knex } from 'knex';
import { db } from '../config/db';
import { AUDIT_LIMITS, type AuditLogInput, type AuditLogRow } from '../models/auditLog';

// Truncate to the column width. Audit writes must never fail because a header
// happened to be longer than the schema allows — the event itself matters more
// than full fidelity of the user-agent string.
function clip(value: string | null | undefined, max: number): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

// Append-only DAO.
//
// There is intentionally NO update() or delete() method. audit_logs is
// evidentiary: the master doc (section 5.8) requires the log to be immutable
// at the application layer. If you find yourself wanting to "fix" a row,
// insert a corrective event instead.
export const auditLogDao = {
  async create(input: AuditLogInput, conn: Knex = db): Promise<AuditLogRow> {
    const [row] = await conn<AuditLogRow>('audit_logs')
      .insert({
        usuario_id: input.usuario_id,
        clinica_id: input.clinica_id,
        acao: clip(input.acao, AUDIT_LIMITS.acao) ?? input.acao.slice(0, AUDIT_LIMITS.acao),
        recurso: clip(input.recurso, AUDIT_LIMITS.recurso),
        recurso_id: clip(input.recurso_id, AUDIT_LIMITS.recurso_id),
        ip: clip(input.ip, AUDIT_LIMITS.ip),
        user_agent: clip(input.user_agent, AUDIT_LIMITS.user_agent),
        request_id: clip(input.request_id, AUDIT_LIMITS.request_id),
      })
      .returning('*');
    if (!row) {
      throw new Error('auditLogDao.create: insert returned no row');
    }
    return row;
  },
};
