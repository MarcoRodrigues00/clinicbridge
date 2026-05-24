import type { ClinicMemberRow } from '../dao/clinicMemberDao';
import type { UserPapel } from './user';

// Owner-facing view of one team member. Shows identity (name + email) so the
// owner can recognize who is currently in the clinic — never logged. The
// technical role string (`papel`) is sent as-is; the UI maps it to a friendly
// label ("funcionário(a) (acesso administrativo)").
export interface PublicClinicMember {
  user_id: string;
  nome: string;
  email: string;
  papel: UserPapel;
  ativo: boolean;
  status: 'active' | 'removed';
  is_owner: boolean;
  joined_at: string | null;
  removed_at: string | null;
}

function iso(d: Date | string | null): string | null {
  if (d === null) return null;
  return d instanceof Date ? d.toISOString() : String(d);
}

export function toPublicClinicMember(
  row: ClinicMemberRow,
  ownerUserId: string,
): PublicClinicMember {
  return {
    user_id: row.user_id,
    nome: row.nome,
    email: row.email,
    papel: row.papel,
    ativo: row.ativo,
    status: row.status,
    is_owner: row.user_id === ownerUserId,
    joined_at: iso(row.joined_at),
    removed_at: iso(row.removed_at),
  };
}
