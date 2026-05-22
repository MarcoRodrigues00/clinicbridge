import { stat } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { auditLogDao } from '../dao/auditLogDao';
import { importFileDao } from '../dao/importFileDao';
import { HttpError } from '../middlewares/errorHandler';
import { toPublicImportFile } from '../models/importFile';
import type { ImportPreview, PreviewRow, SuggestedMapping } from '../models/importPreview';
import { deriveColumns, parseImportFile } from './importParse';
import type { AuthContext } from './authService';

export interface PreviewActor {
  clinica_id: string;
  usuario_id: string;
}

// Best-effort audit (same posture as upload). NEVER includes file content or
// headers — only who/where/when + the import_file id.
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

export async function auditPreviewFailure(
  actor: { usuario_id: string | null; clinica_id: string | null },
  recurso_id: string | null,
  ctx: AuthContext,
): Promise<void> {
  await safeAudit({
    acao: 'import_file.preview.failure',
    usuario_id: actor.usuario_id,
    clinica_id: actor.clinica_id,
    recurso_id,
    ctx,
  });
}

const SYNONYMS: Record<keyof SuggestedMapping, string[]> = {
  nome: ['nome completo', 'nome', 'paciente', 'patient', 'name'],
  telefone: ['telefone', 'celular', 'whatsapp', 'phone', 'contato', 'fone'],
  email: ['email', 'e-mail', 'mail'],
  cpf: ['cpf', 'documento', 'doc'],
  data_nascimento: ['data de nascimento', 'data nascimento', 'nascimento', 'birthdate', 'dob'],
};

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function matchColumn(columns: string[], synonyms: string[]): string | null {
  for (const col of columns) {
    const n = norm(col);
    if (synonyms.some((s) => n === s || n.includes(s))) {
      return col;
    }
  }
  return null;
}

function suggestMapping(columns: string[]): SuggestedMapping {
  return {
    nome: matchColumn(columns, SYNONYMS.nome),
    telefone: matchColumn(columns, SYNONYMS.telefone),
    email: matchColumn(columns, SYNONYMS.email),
    cpf: matchColumn(columns, SYNONYMS.cpf),
    data_nascimento: matchColumn(columns, SYNONYMS.data_nascimento),
  };
}

export const importPreviewService = {
  async generatePreview(
    fileId: string,
    actor: PreviewActor,
    ctx: AuthContext,
  ): Promise<ImportPreview> {
    const row = await importFileDao.findByIdForClinic(fileId, actor.clinica_id);
    if (!row) {
      await safeAudit({
        acao: 'import_file.preview.failure',
        usuario_id: actor.usuario_id,
        clinica_id: actor.clinica_id,
        recurso_id: fileId,
        ctx,
      });
      throw new HttpError(404, 'import_file_not_found', 'Arquivo não encontrado.');
    }

    const absPath = path.join(path.resolve(env.UPLOAD_DIR), actor.clinica_id, row.nome_interno);

    // Physical file gone (deleted out-of-band, etc.). Generic 404, no path leak.
    try {
      await stat(absPath);
    } catch {
      await safeAudit({
        acao: 'import_file.preview.failure',
        usuario_id: actor.usuario_id,
        clinica_id: actor.clinica_id,
        recurso_id: row.id,
        ctx,
      });
      throw new HttpError(404, 'import_file_not_found', 'Arquivo não encontrado.');
    }

    const maxRows = env.PREVIEW_MAX_ROWS;
    const maxCols = env.PREVIEW_MAX_COLUMNS;

    let parsed;
    try {
      parsed = await parseImportFile(absPath, row.extensao, maxRows);
    } catch (err) {
      await safeAudit({
        acao: 'import_file.preview.failure',
        usuario_id: actor.usuario_id,
        clinica_id: actor.clinica_id,
        recurso_id: row.id,
        ctx,
      });
      if (err instanceof HttpError) throw err;
      // Never surface parser internals (which can echo file content) to clients.
      throw new HttpError(
        400,
        'invalid_file_preview',
        'Não foi possível ler o arquivo para pré-visualização.',
      );
    }

    const { rawHeaders, dataMatrix, rowLimited } = parsed;
    const warnings = [...parsed.warnings];

    if (rawHeaders.length === 0 || rawHeaders.every((h) => h === '')) {
      await safeAudit({
        acao: 'import_file.preview.failure',
        usuario_id: actor.usuario_id,
        clinica_id: actor.clinica_id,
        recurso_id: row.id,
        ctx,
      });
      throw new HttpError(
        400,
        'invalid_file_preview',
        'Não foi possível identificar cabeçalhos no arquivo.',
      );
    }

    const { detected, colLimited, emptyFilled, deduped } = deriveColumns(rawHeaders, maxCols);

    const rows: PreviewRow[] = dataMatrix.map((rec) => {
      const obj: PreviewRow = {};
      for (let i = 0; i < detected.length; i++) {
        obj[detected[i]] = rec[i] ?? null;
      }
      return obj;
    });

    if (colLimited) warnings.push(`Mostrando as primeiras ${maxCols} colunas.`);
    if (rowLimited) warnings.push(`Mostrando as primeiras ${maxRows} linhas.`);
    if (emptyFilled) warnings.push('Colunas sem cabeçalho receberam nomes automáticos.');
    if (deduped) warnings.push('Cabeçalhos duplicados foram renomeados.');

    await safeAudit({
      acao: 'import_file.preview.success',
      usuario_id: actor.usuario_id,
      clinica_id: actor.clinica_id,
      recurso_id: row.id,
      ctx,
    });

    return {
      file: toPublicImportFile(row),
      summary: {
        detected_columns: detected,
        total_preview_rows: rows.length,
        preview_limited: colLimited || rowLimited,
        warnings,
      },
      suggested_mapping: suggestMapping(detected),
      rows,
    };
  },
};
