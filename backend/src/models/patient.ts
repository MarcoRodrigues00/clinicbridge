import type { PatientRow } from '../types/db';

export type { PatientRow };

export type PatientStatus = 'active' | 'inactive' | 'archived';

// A normalized, administrative-only patient draft produced from a file row using
// the saved mapping. NOTE: this is only built in-memory by the dry-run; nothing
// is inserted into `patients` in this sprint. No clinical fields exist here.
export interface NormalizedPatientDraft {
  nome: string;
  telefone: string | null;
  email: string | null;
  cpf: string | null;
  data_nascimento: string | null;
  convenio: string | null;
  numero_carteirinha: string | null;
}

// Client-facing patient shape (Sprint 2.19, read-only listing). The raw CPF is
// NEVER exposed — only a masked form. There are NO clinical fields here because
// the MVP does not store any (no diagnosis/prescription/exams/records).
//
// merged_into_id / merged_at (Sprint 3.34, exposed) carry the safe-merge B-safe
// provenance set in Sprint 3.33. They are NOT PII (UUID + timestamp; the
// primary's name is NOT looked up here — only its id). The frontend uses them
// to badge an archived secondary as "Mesclado em outro registro".
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
  merged_into_id: string | null;
  merged_at: string | null;
  criado_em: string;
  atualizado_em: string;
}

// Masks a CPF for display: 12345678901 -> ***.***.789-01. Returns null when the
// value is null/empty or does not have exactly 11 digits after stripping
// non-digits. The raw CPF must never leave the backend.
export function maskCpf(cpf: string | null | undefined): string | null {
  if (cpf === null || cpf === undefined) return null;
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return null;
  return `***.***.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

function toIsoOrString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

// `data_nascimento` is a DATE column; node-pg hands it back as a Date at LOCAL
// midnight. Serializing that Date directly can shift the calendar day on hosts
// with a positive UTC offset, so we rebuild a stable 'YYYY-MM-DD' from the local
// components (which is exactly the date the DB stored).
function toDateOnly(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value));
  return match ? match[1] : String(value);
}

export function toPublicPatient(row: PatientRow): PublicPatient {
  return {
    id: row.id,
    nome: row.nome,
    telefone: row.telefone,
    email: row.email,
    cpf_masked: maskCpf(row.cpf),
    data_nascimento: toDateOnly(row.data_nascimento),
    convenio: row.convenio,
    numero_carteirinha: row.numero_carteirinha,
    status: row.status as PatientStatus,
    origem: row.origem,
    import_session_id: row.import_session_id,
    merged_into_id: row.merged_into_id,
    merged_at: row.merged_at === null ? null : toIsoOrString(row.merged_at),
    criado_em: toIsoOrString(row.criado_em),
    atualizado_em: toIsoOrString(row.atualizado_em),
  };
}
