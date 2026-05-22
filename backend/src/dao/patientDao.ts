import type { Knex } from 'knex';
import { db } from '../config/db';
import type { PatientRow } from '../models/patient';

export interface ListPatientsOptions {
  // Already-validated by the service. `limit` is the raw fetch count: the
  // service asks for (pageSize + 1) rows so it can derive has_more without a
  // separate COUNT(*).
  limit: number;
  offset: number;
  search?: string | null;
}

// Escapes the LIKE/ILIKE wildcards so a user search term is matched literally.
// Values are still parameterized by Knex (no SQL injection); this only stops
// '%' / '_' from changing the match semantics. Uses the default '\' escape char.
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

// patients DAO. Listing is ALWAYS scoped by clinica_id — there is intentionally
// no listAll(), so a missing tenant filter can't leak cross-clinic patients.
// No update/delete in this sprint: the listing is strictly read-only.
export const patientDao = {
  async listPatientsByClinic(
    clinica_id: string,
    options: ListPatientsOptions,
    conn: Knex = db,
  ): Promise<PatientRow[]> {
    const query = conn<PatientRow>('patients').where({ clinica_id });

    const term = options.search?.trim();
    if (term) {
      const pattern = `%${escapeLike(term)}%`;
      query.andWhere((builder) => {
        builder
          .where('nome', 'ilike', pattern)
          .orWhere('email', 'ilike', pattern)
          .orWhere('telefone', 'ilike', pattern);
      });
    }

    return query.orderBy('criado_em', 'desc').limit(options.limit).offset(options.offset);
  },

  // Fetches patients for the read-only duplicate scan. ALWAYS tenant-scoped.
  // Ordered by criado_em ASC so the earliest (original) record sorts first
  // within each detected cluster. Capped by `limit` so a future large clinic
  // can't trigger an unbounded scan.
  async listForDuplicateScan(
    clinica_id: string,
    limit: number,
    conn: Knex = db,
  ): Promise<PatientRow[]> {
    return conn<PatientRow>('patients')
      .where({ clinica_id })
      .orderBy('criado_em', 'asc')
      .limit(limit);
  },
};
