import 'knex/types/tables';

export type UserPapel = 'admin_sistema' | 'dono_clinica' | 'secretaria';

export interface UserRow {
  id: string;
  nome: string;
  email: string;
  senha_hash: string;
  papel: UserPapel;
  clinica_id: string | null;
  ativo: boolean;
  ultimo_login_em: Date | null;
  criado_em: Date;
  atualizado_em: Date;
}

export interface ClinicRow {
  id: string;
  nome: string;
  cnpj: string | null;
  responsavel_id: string;
  plano: string;
  consentimento_lgpd: boolean;
  contrato_aceito_em: Date | null;
  criado_em: Date;
  atualizado_em: Date;
}

export interface AuditLogRow {
  id: string;
  usuario_id: string | null;
  clinica_id: string | null;
  acao: string;
  recurso: string | null;
  recurso_id: string | null;
  ip: string | null;
  user_agent: string | null;
  request_id: string | null;
  criado_em: Date;
}

export interface ImportFileRow {
  id: string;
  clinica_id: string;
  usuario_id: string;
  nome_original: string;
  nome_interno: string;
  mime_type: string;
  extensao: string;
  // pg returns BIGINT as a string; we coerce to number at the model boundary.
  tamanho_bytes: string | number;
  sha256: string;
  status: string;
  criado_em: Date;
}

export interface ImportSessionRow {
  id: string;
  clinica_id: string;
  import_file_id: string;
  usuario_id: string;
  status: string;
  // jsonb columns: pg returns them already parsed. Typed loosely here to avoid a
  // types <-> models import cycle; the model casts to the concrete shapes.
  mapping_json: Record<string, string | null>;
  validation_summary_json: Record<string, unknown>;
  field_stats_json: Record<string, unknown> | null;
  issues_sample_json: unknown[] | null;
  // Sprint 2.18 — receipt of a successful import. Counts + metadata only; no
  // patient values are ever stored here.
  import_summary_json: Record<string, unknown> | null;
  imported_at: Date | null;
  imported_by_user_id: string | null;
  criado_em: Date;
  atualizado_em: Date;
}

export interface PatientRow {
  id: string;
  clinica_id: string;
  import_session_id: string | null;
  nome: string;
  telefone: string | null;
  email: string | null;
  cpf: string | null;
  data_nascimento: string | null;
  convenio: string | null;
  numero_carteirinha: string | null;
  status: string;
  origem: string;
  criado_em: Date;
  atualizado_em: Date;
}

declare module 'knex/types/tables' {
  interface Tables {
    users: UserRow;
    clinics: ClinicRow;
    audit_logs: AuditLogRow;
    import_files: ImportFileRow;
    import_sessions: ImportSessionRow;
    patients: PatientRow;
  }
}
