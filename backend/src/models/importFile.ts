import type { ImportFileRow } from '../types/db';

export type { ImportFileRow };

export interface ImportFileInput {
  clinica_id: string;
  usuario_id: string;
  nome_original: string;
  nome_interno: string;
  mime_type: string;
  extensao: string;
  tamanho_bytes: number;
  sha256: string;
  status?: string;
}

// Client-facing shape. It deliberately omits nome_interno and any storage path:
// the frontend must never learn where the file lives on disk (master doc 5.16).
export interface PublicImportFile {
  id: string;
  nome_original: string;
  mime_type: string;
  extensao: string;
  tamanho_bytes: number;
  sha256: string;
  status: string;
  criado_em: Date;
}

export function toPublicImportFile(row: ImportFileRow): PublicImportFile {
  return {
    id: row.id,
    nome_original: row.nome_original,
    mime_type: row.mime_type,
    extensao: row.extensao,
    tamanho_bytes: Number(row.tamanho_bytes),
    sha256: row.sha256,
    status: row.status,
    criado_em: row.criado_em,
  };
}
