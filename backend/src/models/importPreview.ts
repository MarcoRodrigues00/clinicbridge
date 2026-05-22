import type { PublicImportFile } from './importFile';

// A single previewed cell value. We never return rich objects (dates become
// strings, formulas are dropped) so the client gets predictable, safe scalars.
export type PreviewCell = string | number | boolean | null;

export type PreviewRow = Record<string, PreviewCell>;

export interface PreviewSummary {
  detected_columns: string[];
  total_preview_rows: number;
  // true when the file had more rows and/or columns than we returned.
  preview_limited: boolean;
  warnings: string[];
}

// Best-effort, name-based mapping hints. Null means "no confident guess".
export interface SuggestedMapping {
  nome: string | null;
  telefone: string | null;
  email: string | null;
  cpf: string | null;
  data_nascimento: string | null;
}

export interface ImportPreview {
  file: PublicImportFile;
  summary: PreviewSummary;
  suggested_mapping: SuggestedMapping;
  rows: PreviewRow[];
}
