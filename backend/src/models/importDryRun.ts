import type { PublicImportFile } from './importFile';

export type DryRunSeverity = 'error' | 'warning' | 'duplicate';

export type DryRunRowStatus = 'would_import' | 'blocked' | 'needs_review';

export type ContactPresence = 'email' | 'telefone' | 'email_telefone' | 'none';

export interface DryRunIssue {
  line: number;
  severity: DryRunSeverity;
  code: string;
  message: string;
}

// Privacy: the preview carries NO patient values — only presence flags. No name,
// no CPF, no email, no telefone.
export interface DryRunSampleRow {
  line: number;
  status: DryRunRowStatus;
  preview: {
    contato: ContactPresence;
    has_cpf: boolean;
    has_data_nascimento: boolean;
  };
  issues: DryRunIssue[];
}

export interface ImportDryRunReport {
  session_id: string;
  file: PublicImportFile;
  summary: {
    total_rows_analyzed: number;
    would_import_count: number;
    blocked_count: number;
    warning_count: number;
    duplicate_count: number;
    issues_returned: number;
    issues_truncated: boolean;
  };
  issues: DryRunIssue[];
  sample_rows: DryRunSampleRow[];
}
