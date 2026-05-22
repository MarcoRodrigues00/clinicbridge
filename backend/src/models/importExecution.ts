export type ImportExecutionStatus = 'completed';

// Summary returned to the client after a real import and persisted on the
// session as import_summary_json. ONLY counts and metadata — never patient
// values (no nome/telefone/email/cpf/data_nascimento), never the list of
// created rows.
export interface ImportExecutionSummary {
  session_id: string;
  imported_count: number;
  skipped_count: number;
  total_rows_analyzed: number;
  status: ImportExecutionStatus;
  patients_created: number;
  import_max_rows: number;
}

export interface ImportExecutionResult {
  session_id: string;
  status: ImportExecutionStatus;
  summary: ImportExecutionSummary;
}
