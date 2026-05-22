import { stat } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { auditLogDao } from '../dao/auditLogDao';
import { importFileDao } from '../dao/importFileDao';
import { importSessionDao } from '../dao/importSessionDao';
import { HttpError } from '../middlewares/errorHandler';
import { toPublicImportFile } from '../models/importFile';
import type {
  ContactPresence,
  DryRunIssue,
  DryRunRowStatus,
  DryRunSampleRow,
  ImportDryRunReport,
} from '../models/importDryRun';
import type { ImportSessionRow } from '../models/importSession';
import type { NormalizedPatientDraft } from '../models/patient';
import type { MappingInput, TargetField } from '../models/importValidation';
import type { PreviewCell } from '../models/importPreview';
import { deriveColumns, FileParseError, parseImportFile } from './importParse';
import type { AuthContext } from './authService';

// Carries both the dry-run report and the normalized drafts of the rows that
// would be imported. The drafts are derived from the SAME classification path
// as the report — there is no second source of truth. Used internally by the
// dry-run controller (drafts discarded) and by the real-import service.
export interface DryRunClassification {
  report: ImportDryRunReport;
  drafts: NormalizedPatientDraft[];
}

export interface DryRunActor {
  clinica_id: string;
  usuario_id: string;
}

const EMAIL_RE = /^\S+@\S+\.\S+$/;

async function safeAudit(input: {
  acao: string;
  recurso_id: string | null;
  actor: DryRunActor;
  ctx: AuthContext;
}): Promise<void> {
  try {
    await auditLogDao.create({
      acao: input.acao,
      usuario_id: input.actor.usuario_id,
      clinica_id: input.actor.clinica_id,
      recurso: 'import_session',
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

function toIsoDate(dt: Date): string {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatLines(lines: number[]): string {
  if (lines.length <= 1) return String(lines[0] ?? '');
  return `${lines.slice(0, -1).join(', ')} e ${lines[lines.length - 1]}`;
}

// Balanced sample so duplicates and errors are not pushed out by warnings.
// Errors get ~40% (ceil), warnings ~40% (floor), duplicates the remaining ~20%
// (reserved). Unused slots redistribute errors > warnings > duplicates.
export function selectDryRunIssueSample(
  errors: DryRunIssue[],
  warnings: DryRunIssue[],
  duplicates: DryRunIssue[],
  cap: number,
): DryRunIssue[] {
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

interface RowClass {
  line: number;
  status: DryRunRowStatus;
  contato: ContactPresence;
  hasCpf: boolean;
  hasData: boolean;
  issues: DryRunIssue[];
  // present (mapped + filled) values for duplicate keys
  cpfDigits: string | null;
  emailLc: string | null;
  telDigits: string | null;
  nomeNorm: string | null;
  dnIso: string | null;
  // trimmed original name — used to build the patient draft for an actual
  // import. Always non-empty for would_import rows (empty name is an error).
  nomeOriginal: string;
}

// Pure classification — parses the file via the saved mapping, classifies each
// row (blocked/needs_review/would_import), runs intra-file duplicate detection
// and returns BOTH the public report and the normalized drafts for the rows
// that would actually be imported. NO audit writes here, NO status check.
// Both the dry-run controller and the real-import service share this one path.
async function classifySession(
  session: ImportSessionRow,
  clinicId: string,
): Promise<DryRunClassification> {
  const fileRow = await importFileDao.findByIdForClinic(session.import_file_id, clinicId);
  if (!fileRow) {
    throw new HttpError(400, 'import_dry_run_failed', 'Não foi possível simular a importação.');
  }

  const absPath = path.join(path.resolve(env.UPLOAD_DIR), clinicId, fileRow.nome_interno);
  try {
    await stat(absPath);
  } catch {
    throw new HttpError(400, 'import_dry_run_failed', 'Não foi possível simular a importação.');
  }

  const mapping = session.mapping_json as MappingInput;

  let parsed;
  try {
    parsed = await parseImportFile(absPath, fileRow.extensao, env.DRY_RUN_MAX_ROWS);
  } catch (err) {
    if (err instanceof FileParseError) {
      throw new HttpError(400, 'import_dry_run_failed', 'Arquivo vazio ou ilegível.');
    }
    throw new HttpError(400, 'import_dry_run_failed', 'Não foi possível ler o arquivo.');
  }

  const { rawHeaders, dataMatrix } = parsed;
  if (rawHeaders.length === 0 || rawHeaders.every((h) => h === '')) {
    throw new HttpError(400, 'import_dry_run_failed', 'Não foi possível ler o arquivo.');
  }

  const { detected } = deriveColumns(rawHeaders, rawHeaders.length);
  const colIndex = new Map<string, number>();
  detected.forEach((c, i) => {
    if (!colIndex.has(c)) colIndex.set(c, i);
  });
  const idxOf = (field: TargetField): number => {
    const col = mapping[field];
    return col ? (colIndex.get(col) ?? -1) : -1;
  };
  const nomeIdx = idxOf('nome');
  const telIdx = idxOf('telefone');
  const emailIdx = idxOf('email');
  const cpfIdx = idxOf('cpf');
  const dnIdx = idxOf('data_nascimento');

  const cellAt = (rowArr: PreviewCell[], idx: number): string =>
    idx < 0 ? '' : cellToString(rowArr[idx]);

  const errorIssues: DryRunIssue[] = [];
  const warningIssues: DryRunIssue[] = [];
  const classifications: RowClass[] = [];

  dataMatrix.forEach((rowArr, i) => {
    const line = i + 1;
    const rowIssues: DryRunIssue[] = [];
    let blockedRow = false;

    const addError = (code: string, message: string): void => {
      blockedRow = true;
      const issue: DryRunIssue = { line, severity: 'error', code, message };
      rowIssues.push(issue);
      errorIssues.push(issue);
    };
    const addWarning = (code: string, message: string): void => {
      const issue: DryRunIssue = { line, severity: 'warning', code, message };
      rowIssues.push(issue);
      warningIssues.push(issue);
    };

    const nomeVal = cellAt(rowArr, nomeIdx);
    if (nomeVal === '') addError('nome_empty', 'Nome não informado');

    const telVal = cellAt(rowArr, telIdx);
    const emailVal = cellAt(rowArr, emailIdx);
    const telPresent = telIdx >= 0 && telVal !== '';
    const emailPresent = emailIdx >= 0 && emailVal !== '';
    if (!telPresent && !emailPresent) {
      addError('contact_missing', 'Linha sem telefone ou e-mail para contato');
    }

    let telDigits: string | null = null;
    if (telPresent) {
      telDigits = telVal.replace(/\D/g, '');
      if (telDigits.length < 10 || telDigits.length > 13) {
        addWarning('telefone_invalid', 'Telefone parece incompleto');
      }
    }

    let emailLc: string | null = null;
    if (emailPresent) {
      emailLc = emailVal.toLowerCase();
      if (!EMAIL_RE.test(emailLc)) {
        addWarning('email_invalid', 'E-mail em formato inválido');
      }
    }

    let cpfDigits: string | null = null;
    if (cpfIdx >= 0) {
      const raw = cellAt(rowArr, cpfIdx);
      if (raw === '') addWarning('cpf_empty', 'CPF não informado');
      else {
        const digits = raw.replace(/\D/g, '');
        if (digits.length !== 11) addWarning('cpf_invalid', 'CPF não parece ter 11 dígitos');
        else cpfDigits = digits;
      }
    }

    let dnIso: string | null = null;
    if (dnIdx >= 0) {
      const raw = cellAt(rowArr, dnIdx);
      if (raw !== '') {
        const date = parseBirthDate(raw);
        if (!date) addWarning('data_invalid', 'Data de nascimento em formato não reconhecido');
        else dnIso = toIsoDate(date);
      }
    }

    const contato: ContactPresence =
      telPresent && emailPresent
        ? 'email_telefone'
        : emailPresent
          ? 'email'
          : telPresent
            ? 'telefone'
            : 'none';

    const status: DryRunRowStatus = blockedRow
      ? 'blocked'
      : rowIssues.length > 0
        ? 'needs_review'
        : 'would_import';

    classifications.push({
      line,
      status,
      contato,
      hasCpf: cpfDigits !== null,
      hasData: dnIso !== null,
      issues: rowIssues,
      cpfDigits,
      emailLc: emailPresent ? emailLc : null,
      telDigits: telPresent ? telDigits : null,
      nomeNorm: nomeVal !== '' ? norm(nomeVal) : null,
      dnIso,
      nomeOriginal: nomeVal,
    });
  });

  // --- duplicates within the file (mapped + filled values only) ---
  const dupIssues: DryRunIssue[] = [];
  const byLine = new Map<number, RowClass>();
  classifications.forEach((c) => byLine.set(c.line, c));

  const detect = (
    label: string,
    code: string,
    keyOf: (c: RowClass) => string | null,
  ): void => {
    const map = new Map<string, number[]>();
    for (const c of classifications) {
      const k = keyOf(c);
      if (k === null) continue;
      const arr = map.get(k) ?? [];
      arr.push(c.line);
      map.set(k, arr);
    }
    for (const lines of map.values()) {
      if (lines.length > 1) {
        dupIssues.push({
          line: lines[0],
          severity: 'duplicate',
          code,
          message: `Linhas ${formatLines(lines)}: possível duplicado por ${label}.`,
        });
        for (const line of lines) {
          const c = byLine.get(line);
          if (!c) continue;
          c.issues.push({
            line,
            severity: 'duplicate',
            code,
            message: `Possível duplicado por ${label}`,
          });
          // A duplicate moves a clean row into "needs_review" (never unblocks).
          if (c.status === 'would_import') c.status = 'needs_review';
        }
      }
    }
  };

  if (cpfIdx >= 0) detect('CPF', 'duplicate_cpf', (c) => c.cpfDigits);
  if (emailIdx >= 0) detect('e-mail', 'duplicate_email', (c) => c.emailLc);
  if (telIdx >= 0) detect('telefone', 'duplicate_telefone', (c) => c.telDigits);
  if (nomeIdx >= 0 && dnIdx >= 0) {
    detect('nome + data de nascimento', 'duplicate_nome_data', (c) =>
      c.nomeNorm && c.dnIso ? `${c.nomeNorm}|${c.dnIso}` : null,
    );
  }

  const blocked = classifications.filter((c) => c.status === 'blocked');
  const needsReview = classifications.filter((c) => c.status === 'needs_review');
  const wouldImport = classifications.filter((c) => c.status === 'would_import');

  const cap = env.DRY_RUN_MAX_ISSUES_RETURNED;
  const totalIssues = errorIssues.length + warningIssues.length + dupIssues.length;
  const issues = selectDryRunIssueSample(errorIssues, warningIssues, dupIssues, cap);
  const issuesTruncated = totalIssues > issues.length;

  // Sample prioritizes rows that need attention. NEVER includes names/values.
  const ordered = [...blocked, ...needsReview, ...wouldImport].slice(0, env.DRY_RUN_SAMPLE_ROWS);
  const sample_rows: DryRunSampleRow[] = ordered.map((c) => ({
    line: c.line,
    status: c.status,
    preview: { contato: c.contato, has_cpf: c.hasCpf, has_data_nascimento: c.hasData },
    issues: c.issues,
  }));

  // Drafts for would_import rows ONLY. Any row with errors, warnings or
  // intra-file duplicates was demoted out of would_import upstream — so this
  // list is exactly what a real import is allowed to insert.
  const drafts: NormalizedPatientDraft[] = wouldImport.map((c) => ({
    nome: c.nomeOriginal,
    telefone: c.telDigits,
    email: c.emailLc,
    cpf: c.cpfDigits,
    data_nascimento: c.dnIso,
    convenio: null,
    numero_carteirinha: null,
  }));

  return {
    report: {
      session_id: session.id,
      file: toPublicImportFile(fileRow),
      summary: {
        total_rows_analyzed: classifications.length,
        would_import_count: wouldImport.length,
        blocked_count: blocked.length,
        warning_count: needsReview.length,
        duplicate_count: dupIssues.length,
        issues_returned: issues.length,
        issues_truncated: issuesTruncated,
      },
      issues,
      sample_rows,
    },
    drafts,
  };
}

// Statuses where running the dry-run is allowed. Dry-run never writes anything
// — these are the lifecycle stages where re-running the simulation is useful:
//   - validated: standard pre-mark-ready review.
//   - ready_for_import: re-check right before pulling the trigger.
//   - import_completed: read-only re-inspection of what was imported (no write).
// Excluded on purpose: import_started (in-flight), failed and cancelled.
const DRY_RUN_ALLOWED_STATUSES = new Set<string>([
  'validated',
  'ready_for_import',
  'import_completed',
]);

export const importDryRunService = {
  // Public dry-run for the controller. Allows several lifecycle statuses; the
  // dry-run never writes patient rows so re-running it is safe. The drafts are
  // discarded (the endpoint never exposes them — they only matter when a real
  // import is actually executed).
  async run(
    sessionId: string,
    actor: DryRunActor,
    ctx: AuthContext,
  ): Promise<ImportDryRunReport> {
    try {
      const session = await importSessionDao.findByIdForClinic(sessionId, actor.clinica_id);
      if (!session) {
        throw new HttpError(404, 'import_session_not_found', 'Sessão de migração não encontrada.');
      }
      if (!DRY_RUN_ALLOWED_STATUSES.has(session.status)) {
        throw new HttpError(
          400,
          'import_session_invalid_status_for_dry_run',
          'Esta revisão não pode ser simulada no status atual.',
        );
      }
      const { report } = await classifySession(session, actor.clinica_id);
      await safeAudit({
        acao: 'import_session.dry_run.success',
        recurso_id: session.id,
        actor,
        ctx,
      });
      return report;
    } catch (err) {
      await safeAudit({
        acao: 'import_session.dry_run.failure',
        recurso_id: sessionId,
        actor,
        ctx,
      });
      if (err instanceof HttpError) throw err;
      throw new HttpError(400, 'import_dry_run_failed', 'Não foi possível simular a importação.');
    }
  },

  // Internal: used by the real-import service to re-validate a ready_for_import
  // session right before persisting. Same classification path as run(), but the
  // expected current status is 'ready_for_import' and there is no audit here
  // — the real-import service emits its own import.started/completed/failed.
  async classifyForImport(
    sessionId: string,
    clinicId: string,
  ): Promise<DryRunClassification> {
    const session = await importSessionDao.findByIdForClinic(sessionId, clinicId);
    if (!session) {
      throw new HttpError(404, 'import_session_not_found', 'Sessão de migração não encontrada.');
    }
    if (session.status !== 'ready_for_import') {
      throw new HttpError(
        400,
        'import_session_not_ready',
        'Esta revisão não está pronta para importação.',
      );
    }
    return classifySession(session, clinicId);
  },
};
