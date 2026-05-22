import { stat } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { auditLogDao } from '../dao/auditLogDao';
import { importFileDao } from '../dao/importFileDao';
import { HttpError } from '../middlewares/errorHandler';
import { toPublicImportFile } from '../models/importFile';
import type { PreviewCell } from '../models/importPreview';
import {
  TARGET_FIELDS,
  type FieldStat,
  type ImportValidationReport,
  type MappingInput,
  type TargetField,
  type ValidationIssue,
} from '../models/importValidation';
import { deriveColumns, FileParseError, parseImportFile } from './importParse';
import type { AuthContext } from './authService';

export interface ValidationActor {
  clinica_id: string;
  usuario_id: string;
}

async function safeAudit(input: {
  acao: string;
  usuario_id: string | null;
  clinica_id: string | null;
  recurso_id: string | null;
  ctx: AuthContext;
}): Promise<void> {
  try {
    await auditLogDao.create({
      acao: input.acao,
      usuario_id: input.usuario_id,
      clinica_id: input.clinica_id,
      recurso: 'import_file',
      recurso_id: input.recurso_id,
      ip: input.ctx.ip,
      user_agent: input.ctx.user_agent,
      request_id: input.ctx.request_id,
    });
  } catch (err) {
    logger.error({ err, acao: input.acao, audit_write_failed: true }, 'audit log write failed');
  }
}

function cellToString(value: PreviewCell): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value).trim();
}

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function parseBirthDate(s: string): Date | null {
  let y: number;
  let mo: number;
  let d: number;
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s))) {
    y = +m[1];
    mo = +m[2];
    d = +m[3];
  } else if ((m = /^(\d{2})[/.-](\d{2})[/.-](\d{4})$/.exec(s))) {
    d = +m[1];
    mo = +m[2];
    y = +m[3];
  } else {
    return null;
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

function ageInYears(dt: Date): number {
  const now = new Date();
  let age = now.getFullYear() - dt.getFullYear();
  const monthDiff = now.getMonth() - dt.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dt.getDate())) age--;
  return age;
}

function formatLines(lines: number[]): string {
  if (lines.length <= 1) return String(lines[0] ?? '');
  return `${lines.slice(0, -1).join(', ')} e ${lines[lines.length - 1]}`;
}

// Balanced issue sample (Sprint 2.8). The earlier global slice could fill the
// whole cap with warnings and hide duplicates/errors. Here each severity gets a
// reserved share so the frontend always sees examples of each kind:
//   - errors get priority (ceil 40% of the cap);
//   - warnings get ~40%;
//   - duplicates keep the remaining ~20% reserved (never hidden behind warnings).
// Unused slots are redistributed errors > warnings > duplicates. Final order is
// errors, warnings, duplicates (the frontend re-groups by severity anyway).
export function selectIssueSample(
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
  duplicates: ValidationIssue[],
  cap: number,
): ValidationIssue[] {
  if (cap <= 0) return [];
  const total = errors.length + warnings.length + duplicates.length;
  if (total <= cap) {
    return [...errors, ...warnings, ...duplicates];
  }

  const errorQuota = Math.ceil(cap * 0.4);
  const warningQuota = Math.floor(cap * 0.4);
  const dupQuota = cap - errorQuota - warningQuota;

  let takeE = Math.min(errors.length, errorQuota);
  let takeW = Math.min(warnings.length, warningQuota);
  let takeD = Math.min(duplicates.length, dupQuota);

  let leftover = cap - (takeE + takeW + takeD);
  while (leftover > 0) {
    let progressed = false;
    if (errors.length > takeE) {
      takeE++;
      leftover--;
      progressed = true;
      if (leftover === 0) break;
    }
    if (warnings.length > takeW) {
      takeW++;
      leftover--;
      progressed = true;
      if (leftover === 0) break;
    }
    if (duplicates.length > takeD) {
      takeD++;
      leftover--;
      progressed = true;
      if (leftover === 0) break;
    }
    if (!progressed) break;
  }

  return [
    ...errors.slice(0, takeE),
    ...warnings.slice(0, takeW),
    ...duplicates.slice(0, takeD),
  ];
}

// Validate the raw request mapping: object shape, only allowed keys, string|null
// values, required nome, and at least one of telefone/email. Column existence is
// checked later (needs the parsed headers).
function validateMappingShape(raw: unknown): MappingInput {
  const invalid = (msg: string): HttpError => new HttpError(400, 'validation_mapping_invalid', msg);

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw invalid('Mapeamento inválido.');
  }
  const allowed = new Set<string>(TARGET_FIELDS);
  const out: MappingInput = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!allowed.has(key)) {
      throw invalid('O mapeamento contém campos não suportados.');
    }
    if (value !== null && typeof value !== 'string') {
      throw invalid('O mapeamento tem valores inválidos.');
    }
    const normalized = typeof value === 'string' ? value.trim() : null;
    out[key as TargetField] = normalized === '' ? null : normalized;
  }
  if (!out.nome) {
    throw invalid('Mapeie a coluna de nome para validar.');
  }
  if (!out.telefone && !out.email) {
    throw invalid('Mapeie telefone ou e-mail para validar.');
  }
  return out;
}

export const importValidationService = {
  async generateReport(
    fileId: string,
    rawMapping: unknown,
    actor: ValidationActor,
    ctx: AuthContext,
  ): Promise<ImportValidationReport> {
    let recursoId: string = fileId;
    try {
      // 1) Mapping shape (fast-fail before reading a possibly large file).
      const mapping = validateMappingShape(rawMapping);

      // 2) Tenant-scoped file lookup.
      const row = await importFileDao.findByIdForClinic(fileId, actor.clinica_id);
      if (!row) {
        throw new HttpError(404, 'import_file_not_found', 'Arquivo não encontrado.');
      }
      recursoId = row.id;

      const absPath = path.join(path.resolve(env.UPLOAD_DIR), actor.clinica_id, row.nome_interno);
      try {
        await stat(absPath);
      } catch {
        throw new HttpError(404, 'import_file_not_found', 'Arquivo não encontrado.');
      }

      // 3) Parse the whole file up to VALIDATION_MAX_ROWS.
      let parsed;
      try {
        parsed = await parseImportFile(absPath, row.extensao, env.VALIDATION_MAX_ROWS);
      } catch (err) {
        if (err instanceof FileParseError) {
          throw new HttpError(400, 'invalid_file_validation', 'Arquivo vazio ou ilegível.');
        }
        throw new HttpError(
          400,
          'invalid_file_validation',
          'Não foi possível ler o arquivo para validação.',
        );
      }

      const { rawHeaders, dataMatrix, rowLimited } = parsed;
      const warnings = [...parsed.warnings];

      if (rawHeaders.length === 0 || rawHeaders.every((h) => h === '')) {
        throw new HttpError(
          400,
          'invalid_file_validation',
          'Não foi possível identificar cabeçalhos no arquivo.',
        );
      }

      // No column cap for validation — every mapped column must resolve.
      const { detected } = deriveColumns(rawHeaders, rawHeaders.length);

      // 4) Column existence.
      const colIndex = new Map<string, number>();
      detected.forEach((c, i) => {
        if (!colIndex.has(c)) colIndex.set(c, i);
      });
      for (const field of TARGET_FIELDS) {
        const col = mapping[field];
        if (col && !colIndex.has(col)) {
          throw new HttpError(
            400,
            'validation_mapping_invalid',
            'O mapeamento aponta para uma coluna que não existe no arquivo.',
          );
        }
      }

      const idxOf = (field: TargetField): number => {
        const col = mapping[field];
        return col ? (colIndex.get(col) ?? -1) : -1;
      };
      const nomeIdx = idxOf('nome');
      const telIdx = idxOf('telefone');
      const emailIdx = idxOf('email');
      const cpfIdx = idxOf('cpf');
      const dnIdx = idxOf('data_nascimento');

      const fieldStats: Partial<Record<TargetField, FieldStat>> = {};
      const initStat = (field: TargetField, idx: number): void => {
        if (idx >= 0) fieldStats[field] = { mapped_column: mapping[field] ?? null, empty: 0, invalid: 0 };
      };
      initStat('nome', nomeIdx);
      initStat('telefone', telIdx);
      initStat('email', emailIdx);
      initStat('cpf', cpfIdx);
      initStat('data_nascimento', dnIdx);

      const errors: ValidationIssue[] = [];
      const fieldWarnings: ValidationIssue[] = [];
      let validRows = 0;
      let rowsWithWarnings = 0;
      let rowsWithErrors = 0;

      const cellAt = (rowArr: PreviewCell[], idx: number): string =>
        idx < 0 ? '' : cellToString(rowArr[idx]);

      dataMatrix.forEach((rowArr, i) => {
        const line = i + 1;
        let hasError = false;
        let hasWarning = false;
        const err = (field: TargetField | 'row', code: string, message: string): void => {
          hasError = true;
          errors.push({ line, field, severity: 'error', code, message });
        };
        const warn = (field: TargetField | 'row', code: string, message: string): void => {
          hasWarning = true;
          fieldWarnings.push({ line, field, severity: 'warning', code, message });
        };

        if (nomeIdx >= 0) {
          const v = cellAt(rowArr, nomeIdx);
          if (v === '') {
            fieldStats.nome!.empty++;
            err('nome', 'nome_empty', 'Nome não informado');
          } else if (v.length < 3) {
            fieldStats.nome!.invalid++;
            warn('nome', 'nome_short', 'Nome parece curto demais');
          }
        }

        const telVal = telIdx >= 0 ? cellAt(rowArr, telIdx) : '';
        if (telIdx >= 0) {
          if (telVal === '') fieldStats.telefone!.empty++;
          else {
            const digits = telVal.replace(/\D/g, '');
            if (digits.length < 10 || digits.length > 13) {
              fieldStats.telefone!.invalid++;
              warn('telefone', 'telefone_invalid', 'Telefone parece incompleto');
            }
          }
        }

        const emailVal = emailIdx >= 0 ? cellAt(rowArr, emailIdx) : '';
        if (emailIdx >= 0) {
          if (emailVal === '') fieldStats.email!.empty++;
          else if (!/^\S+@\S+\.\S+$/.test(emailVal)) {
            fieldStats.email!.invalid++;
            err('email', 'email_invalid', 'E-mail em formato inválido');
          }
        }

        if (cpfIdx >= 0) {
          const v = cellAt(rowArr, cpfIdx);
          if (v === '') {
            fieldStats.cpf!.empty++;
            warn('cpf', 'cpf_empty', 'CPF não informado');
          } else if (v.replace(/\D/g, '').length !== 11) {
            fieldStats.cpf!.invalid++;
            warn('cpf', 'cpf_invalid', 'CPF não parece ter 11 dígitos');
          }
        }

        if (dnIdx >= 0) {
          const v = cellAt(rowArr, dnIdx);
          if (v === '') fieldStats.data_nascimento!.empty++;
          else {
            const date = parseBirthDate(v);
            if (!date) {
              fieldStats.data_nascimento!.invalid++;
              warn('data_nascimento', 'data_unrecognized', 'Data de nascimento em formato não reconhecido');
            } else if (date.getTime() > Date.now()) {
              fieldStats.data_nascimento!.invalid++;
              warn('data_nascimento', 'data_future', 'Data de nascimento está no futuro');
            } else if (ageInYears(date) > 120) {
              fieldStats.data_nascimento!.invalid++;
              warn('data_nascimento', 'data_age', 'Idade parece acima de 120 anos');
            }
          }
        }

        const telPresent = telIdx >= 0 && telVal !== '';
        const emailPresent = emailIdx >= 0 && emailVal !== '';
        if (!telPresent && !emailPresent) {
          warn('row', 'contact_missing', 'Linha sem telefone ou e-mail para contato');
        }

        if (hasError) rowsWithErrors++;
        else if (hasWarning) rowsWithWarnings++;
        else validRows++;
      });

      // 5) Duplicate detection across analyzed rows.
      const dupIssues: ValidationIssue[] = [];
      const detect = (
        field: TargetField,
        label: string,
        code: string,
        keyOf: (rowArr: PreviewCell[]) => string | null,
      ): void => {
        const byKey = new Map<string, number[]>();
        dataMatrix.forEach((rowArr, i) => {
          const k = keyOf(rowArr);
          if (k === null) return;
          const arr = byKey.get(k) ?? [];
          arr.push(i + 1);
          byKey.set(k, arr);
        });
        for (const lines of byKey.values()) {
          if (lines.length > 1) {
            dupIssues.push({
              line: lines[0],
              field,
              severity: 'duplicate',
              code,
              message: `Linhas ${formatLines(lines)}: possível duplicado por ${label}.`,
            });
          }
        }
      };

      if (cpfIdx >= 0) {
        detect('cpf', 'CPF', 'duplicate_cpf', (r) => {
          const d = cellAt(r, cpfIdx).replace(/\D/g, '');
          return d === '' ? null : d;
        });
      }
      if (emailIdx >= 0) {
        detect('email', 'e-mail', 'duplicate_email', (r) => {
          const v = cellAt(r, emailIdx).toLowerCase();
          return v === '' ? null : v;
        });
      }
      if (telIdx >= 0) {
        detect('telefone', 'telefone', 'duplicate_telefone', (r) => {
          const d = cellAt(r, telIdx).replace(/\D/g, '');
          return d === '' ? null : d;
        });
      }
      if (nomeIdx >= 0 && dnIdx >= 0) {
        detect('nome', 'nome + data de nascimento', 'duplicate_nome_data', (r) => {
          const n = norm(cellAt(r, nomeIdx));
          const dn = cellAt(r, dnIdx);
          return n === '' || dn === '' ? null : `${n}|${dn}`;
        });
      }

      // 6) Balanced sample so errors and duplicates aren't hidden by warnings.
      const cap = env.VALIDATION_MAX_ISSUES_RETURNED;
      const totalIssues = errors.length + fieldWarnings.length + dupIssues.length;
      const issues = selectIssueSample(errors, fieldWarnings, dupIssues, cap);
      const issuesTruncated = totalIssues > issues.length;

      if (rowLimited) {
        warnings.push(
          `A validação analisou apenas as primeiras ${env.VALIDATION_MAX_ROWS} linhas do arquivo.`,
        );
      }
      if (issuesTruncated) {
        warnings.push(
          'O relatório encontrou mais pontos de atenção do que os exibidos. A amostra inclui erros, avisos e possíveis duplicados quando disponíveis.',
        );
      }

      await safeAudit({
        acao: 'import_file.validation.success',
        usuario_id: actor.usuario_id,
        clinica_id: actor.clinica_id,
        recurso_id: row.id,
        ctx,
      });

      return {
        file: toPublicImportFile(row),
        summary: {
          total_rows_analyzed: dataMatrix.length,
          valid_rows: validRows,
          rows_with_warnings: rowsWithWarnings,
          rows_with_errors: rowsWithErrors,
          duplicate_groups: dupIssues.length,
          issues_returned: issues.length,
          issues_truncated: issuesTruncated,
          validation_limited: rowLimited,
          warnings,
        },
        field_stats: fieldStats,
        issues,
      };
    } catch (err) {
      await safeAudit({
        acao: 'import_file.validation.failure',
        usuario_id: actor.usuario_id,
        clinica_id: actor.clinica_id,
        recurso_id: recursoId,
        ctx,
      });
      if (err instanceof HttpError) throw err;
      throw new HttpError(400, 'invalid_file_validation', 'Não foi possível validar o arquivo.');
    }
  },
};
