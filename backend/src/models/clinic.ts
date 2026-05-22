import type { ClinicRow } from '../types/db';

export type { ClinicRow };

export interface PublicClinic {
  id: string;
  nome: string;
  cnpj: string | null;
  responsavel_id: string;
  plano: string;
  consentimento_lgpd: boolean;
  contrato_aceito_em: Date | null;
  criado_em: Date;
}

export function toPublicClinic(row: ClinicRow): PublicClinic {
  return {
    id: row.id,
    nome: row.nome,
    cnpj: row.cnpj,
    responsavel_id: row.responsavel_id,
    plano: row.plano,
    consentimento_lgpd: row.consentimento_lgpd,
    contrato_aceito_em: row.contrato_aceito_em,
    criado_em: row.criado_em,
  };
}
