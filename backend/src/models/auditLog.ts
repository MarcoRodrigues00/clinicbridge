import type { AuditLogRow } from '../types/db';

export type { AuditLogRow };

// Column max lengths mirror the audit_logs migration. The DAO truncates inputs
// to these bounds so a long header value never aborts an audit write.
export const AUDIT_LIMITS = {
  acao: 60,
  recurso: 60,
  recurso_id: 80,
  ip: 45,
  user_agent: 255,
  request_id: 64,
} as const;

export interface AuditLogInput {
  usuario_id: string | null;
  clinica_id: string | null;
  acao: string;
  recurso?: string | null;
  recurso_id?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  request_id?: string | null;
}
