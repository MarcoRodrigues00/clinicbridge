// Pre-store content validation for uploads.
//
// This is NOT a parser and NOT antivirus/sandbox/DLP. It performs a lightweight,
// bounded check on the REAL bytes so we never trust the client's extension or
// declared MIME alone:
//   - CSV must look like readable text (no binary blob renamed to .csv);
//   - XLSX must be a real ZIP container that actually carries the minimal
//     Office Open XML structure (not just any ZIP renamed to .xlsx).
// Real, exhaustive validation happens later when exceljs/csv-parse run.

const SAMPLE_BYTES = 8192;

// CSV: must look like readable text. We sample the head of the file, reject on
// any NUL byte (the classic binary marker) and on too many other control bytes.
// Tab/LF/CR are allowed; bytes >= 0x20 — including high bytes used by UTF-8 for
// accented characters — are treated as text.
export function isValidCsvContent(buffer: Buffer): boolean {
  if (buffer.length === 0) {
    return false;
  }

  // Skip a UTF-8 BOM if present so it doesn't count against us.
  let start = 0;
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xef &&
    buffer[1] === 0xbb &&
    buffer[2] === 0xbf
  ) {
    start = 3;
  }

  const end = Math.min(buffer.length, start + SAMPLE_BYTES);
  let suspicious = 0;
  let counted = 0;
  for (let i = start; i < end; i++) {
    const b = buffer[i];
    if (b === 0x00) {
      return false; // NUL → binary
    }
    if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) {
      suspicious++;
    }
    counted++;
  }

  if (counted === 0) {
    return false; // BOM-only / empty after trim
  }
  return suspicious / counted <= 0.1;
}

// Mandatory parts of any SpreadsheetML (.xlsx) package. Both are required by the
// Office Open XML / OPC spec, so a real workbook always contains them.
const XLSX_REQUIRED_ENTRIES = ['[Content_Types].xml', 'xl/workbook.xml'];

// XLSX is a ZIP (Office Open XML / OPC). We require:
//   1. the ZIP *local file header* signature "PK\x03\x04" (a real archive with
//      entries — not the empty-archive marker "PK\x05\x06" and not a bare "PK");
//   2. the two mandatory OOXML part names to be present in the bytes.
// ZIP stores entry NAMES uncompressed (only entry *contents* are deflated), so a
// plain byte scan finds the part names without extracting or decompressing
// anything — no temp files, no zip-bomb/zip-slip exposure. This rejects a plain
// ZIP (or any non-OOXML container) renamed to .xlsx, which the old 2-byte "PK"
// check accepted.
export function isValidXlsxContent(buffer: Buffer): boolean {
  if (
    buffer.length < 4 ||
    buffer[0] !== 0x50 || // P
    buffer[1] !== 0x4b || // K
    buffer[2] !== 0x03 ||
    buffer[3] !== 0x04
  ) {
    return false;
  }
  return XLSX_REQUIRED_ENTRIES.every((entry) => buffer.includes(entry, 0, 'latin1'));
}

export type UploadContentResult = { ok: true } | { ok: false; reason: 'empty' | 'invalid' };

// extNoDot is the validated, lowercase extension without the dot ('csv'|'xlsx').
// Returns a structured reason so the caller can surface a clear (but still
// internal-detail-free) error: 'empty' for a zero-byte upload, 'invalid' for a
// type/signature/structure mismatch.
export function validateUploadContent(extNoDot: string, buffer: Buffer): UploadContentResult {
  if (buffer.length === 0) {
    return { ok: false, reason: 'empty' };
  }
  if (extNoDot === 'csv') {
    return isValidCsvContent(buffer) ? { ok: true } : { ok: false, reason: 'invalid' };
  }
  if (extNoDot === 'xlsx') {
    return isValidXlsxContent(buffer) ? { ok: true } : { ok: false, reason: 'invalid' };
  }
  return { ok: false, reason: 'invalid' };
}
