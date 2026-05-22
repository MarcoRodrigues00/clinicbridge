import type { UserPapel, UserRow } from '../types/db';

export type { UserPapel, UserRow };

export interface SafeUser {
  id: string;
  nome: string;
  email: string;
  papel: UserPapel;
  clinica_id: string | null;
  ativo: boolean;
  criado_em: Date;
}

export function toSafeUser(row: UserRow): SafeUser {
  return {
    id: row.id,
    nome: row.nome,
    email: row.email,
    papel: row.papel,
    clinica_id: row.clinica_id,
    ativo: row.ativo,
    criado_em: row.criado_em,
  };
}
