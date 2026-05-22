import type { ImportSessionRow } from '../types/db';
import type { PublicImportFile } from './importFile';
import type { ImportExecutionSummary } from './importExecution';
import type {
  ImportValidationReport,
  MappingInput,
  ValidationIssue,
} from './importValidation';

export type { ImportSessionRow };

export type ImportSessionStatus =
  | 'validated'
  | 'ready_for_import'
  | 'import_started'
  | 'import_completed'
  | 'cancelled'
  | 'failed';

export interface CreateImportSessionInput {
  clinica_id: string;
  usuario_id: string;
  import_file_id: string;
  status: ImportSessionStatus;
  mapping: MappingInput;
  validation_summary: ImportValidationReport['summary'];
  field_stats: ImportValidationReport['field_stats'];
  issues_sample: ValidationIssue[];
}

// Client-facing shape. Crucially NO nome_interno, NO storage path, NO raw rows
// and NO patient cell values — only ids, mapping, aggregate stats and a sample.
// Sprint 2.18 adds the (optional) import receipt: counts + metadata produced
// when the real import actually ran. Still no PII.
export interface PublicImportSession {
  id: string;
  import_file_id: string;
  file: PublicImportFile;
  status: ImportSessionStatus;
  mapping: MappingInput;
  validation_summary: ImportValidationReport['summary'];
  field_stats: ImportValidationReport['field_stats'];
  issues_sample: ValidationIssue[];
  import_summary: ImportExecutionSummary | null;
  imported_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export function toPublicImportSession(
  row: ImportSessionRow,
  file: PublicImportFile,
): PublicImportSession {
  return {
    id: row.id,
    import_file_id: row.import_file_id,
    file,
    status: row.status as ImportSessionStatus,
    mapping: row.mapping_json as MappingInput,
    validation_summary: row.validation_summary_json as ImportValidationReport['summary'],
    field_stats: (row.field_stats_json ?? {}) as ImportValidationReport['field_stats'],
    issues_sample: (row.issues_sample_json ?? []) as ValidationIssue[],
    import_summary: (row.import_summary_json ?? null) as ImportExecutionSummary | null,
    imported_at: row.imported_at,
    created_at: row.criado_em,
    updated_at: row.atualizado_em,
  };
}
