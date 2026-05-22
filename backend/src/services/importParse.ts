import { readFile } from 'node:fs/promises';
import { parse as parseCsv } from 'csv-parse';
import ExcelJS from 'exceljs';
import type { PreviewCell } from '../models/importPreview';

const CELL_MAX_LEN = 500;

// Thrown when a file is empty / has no readable sheet. Callers map it to their
// own HttpError code (preview vs validation) so error messages stay contextual.
export class FileParseError extends Error {}

export interface ParsedFile {
  // Trimmed header names, trailing-empty columns removed. NO dedup/empty-fill
  // and NO column cap here — that is applied by deriveColumns per use case.
  rawHeaders: string[];
  // Up to maxRows data rows; each row aligned positionally to rawHeaders.
  dataMatrix: PreviewCell[][];
  rowLimited: boolean;
  warnings: string[];
}

export interface DerivedColumns {
  detected: string[];
  colLimited: boolean;
  emptyFilled: boolean;
  deduped: boolean;
}

function clampString(s: string): string {
  return s.length > CELL_MAX_LEN ? s.slice(0, CELL_MAX_LEN) : s;
}

function csvCell(v: string | undefined): PreviewCell {
  if (v === undefined) return null;
  if (v === '') return null;
  return clampString(v);
}

// Normalizes an exceljs cell value to a safe scalar. For formula cells we read
// ONLY the cached `result` (exceljs never evaluates formulas); for hyperlink
// cells we keep the display text without following the link.
function xlsxCell(value: ExcelJS.CellValue): PreviewCell {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const t = value.trim();
    return t === '' ? null : clampString(t);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object') {
    const v = value as unknown as Record<string, unknown>;
    if ('result' in v) {
      return xlsxCell(v.result as ExcelJS.CellValue);
    }
    if ('text' in v && typeof v.text === 'string') {
      const t = v.text.trim();
      return t === '' ? null : clampString(t);
    }
    if ('richText' in v && Array.isArray(v.richText)) {
      const joined = (v.richText as Array<{ text?: string }>).map((r) => r.text ?? '').join('');
      const t = joined.trim();
      return t === '' ? null : clampString(t);
    }
    if ('error' in v) {
      return null;
    }
  }
  return null;
}

function headerToString(cell: PreviewCell): string {
  return cell === null ? '' : String(cell).trim();
}

function trimTrailingEmpty(headers: string[]): string[] {
  const out = [...headers];
  while (out.length > 0 && out[out.length - 1] === '') {
    out.pop();
  }
  return out;
}

// Parse only the first (maxRows + 2) records: header + up to maxRows + 1 (the
// extra one lets callers flag "limited" without reading the whole file).
function parseCsvLimited(text: string, delimiter: string, toRecords: number): Promise<string[][]> {
  return new Promise((resolve, reject) => {
    parseCsv(
      text,
      {
        delimiter,
        bom: true,
        skip_empty_lines: true,
        relax_column_count: true,
        relax_quotes: true,
        trim: true,
        to: toRecords,
      },
      (err, records: string[][]) => {
        if (err) reject(err);
        else resolve(records);
      },
    );
  });
}

async function parseCsvFile(absPath: string, maxRows: number): Promise<ParsedFile> {
  const buffer = await readFile(absPath);
  const text = buffer.toString('utf8');
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const semis = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  const delimiter = semis > commas ? ';' : ',';

  const records = await parseCsvLimited(text, delimiter, maxRows + 2);
  if (records.length === 0) {
    throw new FileParseError('empty_csv');
  }

  const rawHeaders = trimTrailingEmpty((records[0] ?? []).map((c) => (c ?? '').trim()));
  const effCols = rawHeaders.length;
  const dataRecords = records.slice(1);
  const rowLimited = dataRecords.length > maxRows;
  const dataMatrix = dataRecords.slice(0, maxRows).map((rec) => {
    const out: PreviewCell[] = [];
    for (let i = 0; i < effCols; i++) {
      out.push(csvCell(rec[i]));
    }
    return out;
  });

  return { rawHeaders, dataMatrix, rowLimited, warnings: [] };
}

async function parseXlsxFile(absPath: string, maxRows: number): Promise<ParsedFile> {
  const warnings: string[] = [];
  const wb = new ExcelJS.Workbook();
  // Reads the whole workbook into memory; safe because uploads are capped at
  // UPLOAD_MAX_BYTES. exceljs does not evaluate formulas.
  await wb.xlsx.readFile(absPath);

  const ws = wb.worksheets[0];
  if (!ws) {
    throw new FileParseError('empty_xlsx');
  }
  if (wb.worksheets.length > 1) {
    warnings.push('Apenas a primeira planilha foi analisada.');
  }

  const headerRow = ws.getRow(1);
  const rawColCount = Math.max(ws.columnCount || 0, headerRow.cellCount || 0);
  const headersFull: string[] = [];
  for (let c = 1; c <= rawColCount; c++) {
    headersFull.push(headerToString(xlsxCell(headerRow.getCell(c).value)));
  }
  const rawHeaders = trimTrailingEmpty(headersFull);
  const effCols = rawHeaders.length;

  const totalDataRows = Math.max((ws.rowCount || 1) - 1, 0);
  const rowLimited = totalDataRows > maxRows;
  const lastRow = Math.min(1 + maxRows, ws.rowCount || 1);
  const dataMatrix: PreviewCell[][] = [];
  for (let r = 2; r <= lastRow; r++) {
    const row = ws.getRow(r);
    const out: PreviewCell[] = [];
    for (let c = 1; c <= effCols; c++) {
      out.push(xlsxCell(row.getCell(c).value));
    }
    dataMatrix.push(out);
  }

  return { rawHeaders, dataMatrix, rowLimited, warnings };
}

export function parseImportFile(
  absPath: string,
  extensao: string,
  maxRows: number,
): Promise<ParsedFile> {
  return extensao === 'xlsx' ? parseXlsxFile(absPath, maxRows) : parseCsvFile(absPath, maxRows);
}

// Turns raw headers into the final, client-facing column names: empty headers
// become coluna_N, duplicate names get a numeric suffix, and the list is capped
// at maxCols. Deterministic left-to-right so preview and validation agree.
export function deriveColumns(rawHeaders: string[], maxCols: number): DerivedColumns {
  const colLimited = rawHeaders.length > maxCols;
  const used = Math.min(rawHeaders.length, maxCols);
  const detected: string[] = [];
  const seen = new Map<string, number>();
  let emptyFilled = false;
  let deduped = false;
  for (let i = 0; i < used; i++) {
    let name = rawHeaders[i] ?? '';
    if (name === '') {
      name = `coluna_${i + 1}`;
      emptyFilled = true;
    }
    const prev = seen.get(name);
    if (prev !== undefined) {
      const n = prev + 1;
      seen.set(name, n);
      name = `${name}_${n}`;
      deduped = true;
    } else {
      seen.set(name, 1);
    }
    detected.push(name);
  }
  return { detected, colLimited, emptyFilled, deduped };
}
