import path from 'node:path';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import multer, { MulterError } from 'multer';
import { env } from '../config/env';
import { auditUploadFailure } from '../services/uploadService';
import { buildAuthContext } from '../utils/authContext';
import { HttpError } from './errorHandler';

export const ALLOWED_EXTENSIONS = new Set(['.csv', '.xlsx']);

function formatLimitMb(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return Number.isInteger(mb) ? `${mb}` : mb.toFixed(1);
}

const TOO_LARGE_MESSAGE = `Arquivo muito grande. O limite atual é de ${formatLimitMb(
  env.UPLOAD_MAX_BYTES,
)} MB.`;
const INVALID_TYPE_MESSAGE = 'Formato inválido. Envie apenas CSV ou XLSX.';

// Declared (client-provided) Content-Types we accept. NOTE: this is the value
// sent by the browser, not a sniffed/real MIME. True content inspection by
// magic bytes (e.g. blocking a .exe renamed to .csv) is a Sprint 3 hardening
// item (master doc US-14). For the skeleton we pair an extension allowlist with
// the declared MIME, and only accept the generic application/octet-stream when
// the extension itself is already valid (many OSes send octet-stream for .csv).
const ALLOWED_MIME = new Set([
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
]);

function extOf(name: string): string {
  return path.extname(name).toLowerCase();
}

// memoryStorage: the file lives in a Buffer and is only written to disk by the
// UploadService AFTER validation succeeds. Rejected uploads therefore never
// leave a partial file behind, and the size limit caps memory use.
const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.UPLOAD_MAX_BYTES,
    files: 1,
    fields: 1,
  },
  fileFilter(_req, file, cb) {
    const ext = extOf(file.originalname);
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      cb(new HttpError(400, 'invalid_file_type', INVALID_TYPE_MESSAGE));
      return;
    }
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new HttpError(400, 'invalid_file_type', INVALID_TYPE_MESSAGE));
      return;
    }
    cb(null, true);
  },
});

const single = multerUpload.single('file');

// Wraps multer so its errors become safe HttpErrors instead of bubbling up as
// generic 500s, and so our own fileFilter HttpErrors pass straight through.
export const uploadSingle: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  single(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }

    // requireAuth + requireClinic already ran, so req.auth (with clinica_id) is
    // present here. Record the rejection best-effort, with no filename/content.
    void auditUploadFailure(
      { usuario_id: req.auth?.sub ?? null, clinica_id: req.auth?.clinica_id ?? null },
      buildAuthContext(req),
    );

    if (err instanceof HttpError) {
      next(err);
      return;
    }
    if (err instanceof MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        next(new HttpError(413, 'file_too_large', TOO_LARGE_MESSAGE));
        return;
      }
      next(
        new HttpError(
          400,
          'invalid_upload',
          'Envio inválido. Envie um único arquivo no campo "file".',
        ),
      );
      return;
    }
    next(new HttpError(400, 'invalid_upload', 'Não foi possível processar o upload.'));
  });
};
