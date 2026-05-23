import type { ClinicProfessionalRow } from '../types/db';

export type { ClinicProfessionalRow };

// Client-facing professional shape (Sprint 3.14). Administrative only — there are
// NO clinical fields. `specialty_label` is an optional administrative label and
// must NOT be used in patient-facing messages (ADR 0006 reminders addendum).
export interface PublicClinicProfessional {
  id: string;
  name: string;
  specialty_label: string | null;
  is_active: boolean;
  criado_em: string;
  atualizado_em: string;
}

export function toPublicClinicProfessional(
  row: ClinicProfessionalRow,
): PublicClinicProfessional {
  return {
    id: row.id,
    name: row.name,
    specialty_label: row.specialty_label,
    is_active: row.is_active,
    criado_em: new Date(row.created_at).toISOString(),
    atualizado_em: new Date(row.updated_at).toISOString(),
  };
}
