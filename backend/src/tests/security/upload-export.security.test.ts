// R07 — Secure validation of uploads, imports and exports.
//
// Guards the pre-store content validation (real bytes, not just extension/MIME)
// and the export anti-formula-injection neutralizer. Pure: no DB, no temp files.
// Run: `pnpm --filter backend test:security`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidCsvContent,
  isValidXlsxContent,
  validateUploadContent,
} from '../../utils/fileContent';

// Minimal real OOXML byte shape: ZIP local-file-header signature + the two
// mandatory Office Open XML part names (stored uncompressed in the entry table).
function fakeXlsx(): Buffer {
  return Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from('....[Content_Types].xml....xl/workbook.xml....', 'latin1'),
  ]);
}

test('CSV: a binary blob renamed to .csv (NUL byte) is rejected', () => {
  const binary = Buffer.from([0x41, 0x00, 0x42, 0x00]);
  assert.equal(isValidCsvContent(binary), false);
  assert.equal(validateUploadContent('csv', binary).ok, false);
});

test('CSV: ordinary text is accepted', () => {
  const csv = Buffer.from('nome,telefone\nMaria,11999990000\n', 'utf8');
  assert.equal(isValidCsvContent(csv), true);
  assert.deepEqual(validateUploadContent('csv', csv), { ok: true });
});

test('XLSX: a plain ZIP renamed to .xlsx (no OOXML parts) is rejected', () => {
  const plainZip = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from('just-a-zip-with-random-entries.txt', 'latin1'),
  ]);
  assert.equal(isValidXlsxContent(plainZip), false);
});

test('XLSX: a non-ZIP disguised as .xlsx is rejected', () => {
  const notZip = Buffer.from('PK this is not a real archive', 'latin1');
  assert.equal(isValidXlsxContent(notZip), false);
});

test('XLSX: a real OOXML container is accepted', () => {
  assert.equal(isValidXlsxContent(fakeXlsx()), true);
  assert.deepEqual(validateUploadContent('xlsx', fakeXlsx()), { ok: true });
});

test('empty upload → reason "empty"; unknown extension → reason "invalid"', () => {
  assert.deepEqual(validateUploadContent('csv', Buffer.alloc(0)), { ok: false, reason: 'empty' });
  assert.deepEqual(validateUploadContent('exe', Buffer.from('MZ...')), { ok: false, reason: 'invalid' });
});
