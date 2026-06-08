import ExcelJS from 'exceljs';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { auditLogDao } from '../dao/auditLogDao';
import { patientDao } from '../dao/patientDao';
import { HttpError } from '../middlewares/errorHandler';
import { maskMemberNumber, toPublicPatient, type PublicPatient } from '../models/patient';
import type { AuthContext } from './authService';

export type ExportFormat = 'csv' | 'xlsx';

export interface PatientExportActor {
  clinica_id: string;
  usuario_id: string;
}

export interface PatientExportFile {
  filename: string;
  contentType: string;
  // string for CSV (UTF-8 with BOM), Buffer for XLSX.
  body: string | Buffer;
}

// Columns exported, in order. These are exactly the administrative fields of
// PublicPatient minus `id`. NEVER includes raw cpf, clinical data, tokens, or
// user ids.
// `mask` (optional) transforms the raw string cell before neutralization, so
// PII like the insurance card number is never exported in full (data
// minimization). The CPF is already masked upstream as `cpf_masked`.
const EXPORT_COLUMNS: Array<{
  key: keyof PublicPatient;
  header: string;
  mask?: (value: string) => string;
}> = [
  { key: 'nome', header: 'nome' },
  { key: 'telefone', header: 'telefone' },
  { key: 'email', header: 'email' },
  { key: 'cpf_masked', header: 'cpf_masked' },
  { key: 'data_nascimento', header: 'data_nascimento' },
  { key: 'convenio', header: 'convenio' },
  {
    key: 'numero_carteirinha',
    header: 'numero_carteirinha',
    mask: (value) => maskMemberNumber(value) ?? '',
  },
  { key: 'status', header: 'status' },
  { key: 'origem', header: 'origem' },
  { key: 'import_session_id', header: 'import_session_id' },
  { key: 'criado_em', header: 'criado_em' },
  { key: 'atualizado_em', header: 'atualizado_em' },
];

const CSV_CONTENT_TYPE = 'text/csv; charset=utf-8';
const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Neutralizes spreadsheet formula injection (CWE-1236). A cell whose text starts
// with one of = + - @ (or a leading tab/CR/LF) is prefixed with a single quote
// so Excel/Sheets/LibreOffice treat it as text, never a formula.
export function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r\n]/.test(value) ? `'${value}` : value;
}

function cellToText(value: PublicPatient[keyof PublicPatient]): string {
  if (value === null || value === undefined) return '';
  return neutralizeFormula(String(value));
}

// Resolves a cell, applying the column's optional `mask` to raw string values
// (e.g. numero_carteirinha) before neutralization.
function resolveCell(p: PublicPatient, col: (typeof EXPORT_COLUMNS)[number]): string {
  const raw = p[col.key];
  if (col.mask && typeof raw === 'string') return cellToText(col.mask(raw));
  return cellToText(raw);
}

// RFC 4180 quoting on top of the already-neutralized text.
function csvField(text: string): string {
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildCsv(patients: PublicPatient[]): string {
  const lines: string[] = [];
  lines.push(EXPORT_COLUMNS.map((c) => csvField(c.header)).join(','));
  for (const p of patients) {
    lines.push(EXPORT_COLUMNS.map((c) => csvField(resolveCell(p, c))).join(','));
  }
  // Leading BOM so Excel reads UTF-8 (accents) correctly. CRLF line endings.
  return `﻿${lines.join('\r\n')}\r\n`;
}

async function buildXlsx(patients: PublicPatient[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Pacientes');
  ws.addRow(EXPORT_COLUMNS.map((c) => c.header));
  for (const p of patients) {
    // Every cell is written as neutralized text — no cell is ever a formula.
    ws.addRow(EXPORT_COLUMNS.map((c) => resolveCell(p, c)));
  }
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}

function buildFilename(format: ExportFormat): string {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate(),
  ).padStart(2, '0')}`;
  // Fixed, safe filename — never derived from user input.
  return `pacientes-clinicbridge-${stamp}.${format}`;
}

async function safeAudit(
  acao: string,
  actor: PatientExportActor,
  ctx: AuthContext,
): Promise<void> {
  try {
    await auditLogDao.create({
      acao,
      usuario_id: actor.usuario_id,
      clinica_id: actor.clinica_id,
      recurso: 'patient',
      recurso_id: null,
      ip: ctx.ip,
      user_agent: ctx.user_agent,
      request_id: ctx.request_id,
    });
  } catch (err) {
    logger.error({ err, acao, audit_write_failed: true }, 'audit log write failed');
  }
}

export const patientExportService = {
  // Read-only export of administrative patients for the actor's clinic. Masks
  // the CPF, neutralizes formula injection, and caps the row count. NEVER
  // writes to patients. Audits success/failure without any PII.
  async export(
    actor: PatientExportActor,
    options: { format: ExportFormat; search?: string | null },
    ctx: AuthContext,
  ): Promise<PatientExportFile> {
    const max = env.PATIENTS_EXPORT_MAX_ROWS;
    try {
      // Fetch one extra row to detect "too large" without a separate COUNT(*).
      const rows = await patientDao.listPatientsByClinic(actor.clinica_id, {
        limit: max + 1,
        offset: 0,
        search: options.search ?? null,
      });

      if (rows.length > max) {
        await safeAudit('patient.export.failure', actor, ctx);
        throw new HttpError(
          413,
          'patients_export_too_large',
          `A exportação excede o limite atual de ${max} registros. Refine a busca e tente novamente.`,
        );
      }

      const patients = rows.map(toPublicPatient);

      const file: PatientExportFile =
        options.format === 'csv'
          ? {
              filename: buildFilename('csv'),
              contentType: CSV_CONTENT_TYPE,
              body: buildCsv(patients),
            }
          : {
              filename: buildFilename('xlsx'),
              contentType: XLSX_CONTENT_TYPE,
              body: await buildXlsx(patients),
            };

      await safeAudit('patient.export.success', actor, ctx);
      return file;
    } catch (err) {
      if (err instanceof HttpError) throw err; // already audited where relevant
      await safeAudit('patient.export.failure', actor, ctx);
      throw new HttpError(500, 'patients_export_failed', 'Não foi possível gerar a exportação.');
    }
  },
};
