import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { auditLogDao } from '../dao/auditLogDao';
import { importFileDao } from '../dao/importFileDao';
import { HttpError } from '../middlewares/errorHandler';
import { toPublicImportFile, type PublicImportFile } from '../models/importFile';
import { validateUploadContent } from '../utils/fileContent';
import type { AuthContext } from './authService';

export interface UploadFileInput {
  originalName: string;
  mimeType: string;
  size: number;
  buffer: Buffer;
}

export interface UploadActor {
  clinica_id: string;
  usuario_id: string;
}

function extOf(name: string): string {
  return path.extname(name).toLowerCase();
}

// Audit writes are best-effort (same posture as authService): a logging failure
// must not turn a successful upload into an error. We log it for monitoring.
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
    logger.error(
      { err, acao: input.acao, audit_write_failed: true },
      'audit log write failed',
    );
  }
}

// Best-effort failure audit, callable from the middleware (rejected extension /
// MIME / size) and the controller (missing file) where there is no row id yet.
// Deliberately records NO filename or file content — only who/where/when.
export async function auditUploadFailure(
  actor: { usuario_id: string | null; clinica_id: string | null },
  ctx: AuthContext,
): Promise<void> {
  await safeAudit({
    acao: 'import_file.upload.failure',
    usuario_id: actor.usuario_id,
    clinica_id: actor.clinica_id,
    recurso_id: null,
    ctx,
  });
}

export const uploadService = {
  async receiveFile(
    file: UploadFileInput,
    actor: UploadActor,
    ctx: AuthContext,
  ): Promise<PublicImportFile> {
    const ext = extOf(file.originalName); // '.csv' | '.xlsx' (validated upstream)
    const extNoDot = ext.replace(/^\./, '');

    // Real-content check by magic bytes / minimal structure (not a parser):
    // rejects binaries renamed to .csv and .xlsx files that aren't genuine
    // Office Open XML packages. Audited as a failure since extension/MIME passed
    // but the bytes don't match. The error never echoes the filename or bytes.
    const content = validateUploadContent(extNoDot, file.buffer);
    if (!content.ok) {
      await safeAudit({
        acao: 'import_file.upload.failure',
        usuario_id: actor.usuario_id,
        clinica_id: actor.clinica_id,
        recurso_id: null,
        ctx,
      });
      if (content.reason === 'empty') {
        throw new HttpError(
          400,
          'file_empty',
          'O arquivo está vazio. Envie um CSV ou XLSX com conteúdo.',
        );
      }
      throw new HttpError(400, 'invalid_file_content', 'Arquivo inválido ou incompatível.');
    }

    const sha256 = createHash('sha256').update(file.buffer).digest('hex');

    // Private, per-clinic directory. path.resolve keeps it inside UPLOAD_DIR and
    // clinica_id comes from the verified JWT (not user input), so there is no
    // path-traversal vector here.
    const clinicDir = path.join(path.resolve(env.UPLOAD_DIR), actor.clinica_id);
    await mkdir(clinicDir, { recursive: true });

    // Internal name is a random UUID — the original filename is never used as a
    // path (avoids traversal and leaking patient/clinic names on disk).
    const nomeInterno = `${randomUUID()}${ext}`;
    const absPath = path.join(clinicDir, nomeInterno);

    // flag 'wx' fails if the path already exists (UUID collision guard) instead
    // of silently overwriting another file.
    await writeFile(absPath, file.buffer, { flag: 'wx' });

    try {
      const row = await importFileDao.create({
        clinica_id: actor.clinica_id,
        usuario_id: actor.usuario_id,
        nome_original: file.originalName.slice(0, 255),
        nome_interno: nomeInterno,
        mime_type: file.mimeType.slice(0, 120),
        extensao: extNoDot.slice(0, 10),
        tamanho_bytes: file.size,
        sha256,
        status: 'uploaded',
      });

      await safeAudit({
        acao: 'import_file.upload.success',
        usuario_id: actor.usuario_id,
        clinica_id: actor.clinica_id,
        recurso_id: row.id,
        ctx,
      });

      return toPublicImportFile(row);
    } catch (err) {
      // DB insert failed — don't leave an orphaned blob on disk.
      await rm(absPath, { force: true }).catch(() => undefined);
      throw err;
    }
  },

  async listForClinic(clinica_id: string): Promise<PublicImportFile[]> {
    const rows = await importFileDao.listByClinic(clinica_id);
    return rows.map(toPublicImportFile);
  },
};
