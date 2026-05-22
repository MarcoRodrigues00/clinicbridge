import type { PublicImportFile } from './importFile';

export type TargetField = 'nome' | 'telefone' | 'email' | 'cpf' | 'data_nascimento';

export const TARGET_FIELDS: readonly TargetField[] = [
  'nome',
  'telefone',
  'email',
  'cpf',
  'data_nascimento',
];

export type ValidationSeverity = 'error' | 'warning' | 'duplicate';

// User-chosen mapping: target field -> column name (or null/absent = unmapped).
export interface MappingInput {
  nome?: string | null;
  telefone?: string | null;
  email?: string | null;
  cpf?: string | null;
  data_nascimento?: string | null;
}

// An issue NEVER carries cell values — only its location, kind and a safe label.
export interface ValidationIssue {
  line: number;
  field: TargetField | 'row';
  severity: ValidationSeverity;
  code: string;
  message: string;
}

export interface FieldStat {
  mapped_column: string | null;
  empty: number;
  invalid: number;
}

export interface ImportValidationReport {
  file: PublicImportFile;
  summary: {
    total_rows_analyzed: number;
    valid_rows: number;
    rows_with_warnings: number;
    rows_with_errors: number;
    duplicate_groups: number;
    issues_returned: number;
    issues_truncated: boolean;
    validation_limited: boolean;
    warnings: string[];
  };
  field_stats: Partial<Record<TargetField, FieldStat>>;
  issues: ValidationIssue[];
}
