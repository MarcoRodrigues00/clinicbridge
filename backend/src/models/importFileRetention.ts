// DTOs for the import-file retention DRY-RUN (Sprint 2.24).
//
// This is a read-only preview of which old upload files WOULD be cleanup
// candidates. Nothing is ever deleted in this sprint. The shape deliberately
// omits anything that could leak PII or storage internals: NO nome_original
// (the user's filename may contain a person's name), NO nome_interno, NO path,
// NO sha256, NO file content.

export interface RetentionCandidate {
  id: string;
  // import_files.status (currently always 'uploaded' — kept for forward-compat).
  status: string;
  extensao: string;
  mime_type: string;
  tamanho_bytes: number;
  criado_em: Date;
  // Whether any migration session references this file, and the status of the
  // most recent one. Lets a reviewer see the file is already through its flow.
  has_import_session: boolean;
  latest_session_status: string | null;
}

export interface RetentionDryRunResult {
  retention_days: number;
  candidates_count: number;
  // true when the scan hit the per-request cap and older files may remain.
  scan_limited: boolean;
  candidates: RetentionCandidate[];
}
