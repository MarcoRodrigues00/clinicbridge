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
  // null/undefined = no status filter (all). Otherwise restricts to that status.
  status?: string | null;
}

// Manual patient creation (Sprint 3.22). Administrative fields ONLY — no clinical
// data. clinica_id comes from the authenticated actor; origem/status are set by
// the DAO (manual/active), never from client input.
export interface CreatePatientInput {
  clinica_id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  cpf: string | null;
  data_nascimento: string | null;
  convenio: string | null;
  numero_carteirinha: string | null;
}

// Partial update — only the keys present are written. clinica_id, origem,
// import_session_id and id are NEVER updatable here.
export interface UpdatePatientFields {
  nome?: string;
  telefone?: string | null;
  email?: string | null;
  cpf?: string | null;
  data_nascimento?: string | null;
  convenio?: string | null;
  numero_carteirinha?: string | null;
}

// Escapes the LIKE/ILIKE wildcards so a user search term is matched literally.
// Values are still parameterized by Knex (no SQL injection); this only stops
// '%' / '_' from changing the match semantics. Uses the default '\' escape char.
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

// patients DAO. Every operation is ALWAYS scoped by clinica_id — there is
// intentionally no listAll(), so a missing tenant filter can't leak cross-clinic
// patients. Sprint 3.22 adds tenant-scoped manual writes (create/update/status);
// there is still NO physical delete (archiving sets status='archived').
export const patientDao = {
  async listPatientsByClinic(
    clinica_id: string,
    options: ListPatientsOptions,
    conn: Knex = db,
  ): Promise<PatientRow[]> {
    const query = conn<PatientRow>('patients').where({ clinica_id });

    if (options.status) {
      query.andWhere({ status: options.status });
    }

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

  // Tenant-scoped fetch (full row). Returns undefined for a cross-clinic id, so
  // callers surface a generic 404 (no cross-tenant leak).
  async findByIdForClinic(
    id: string,
    clinica_id: string,
    conn: Knex = db,
  ): Promise<PatientRow | undefined> {
    return conn<PatientRow>('patients').where({ id, clinica_id }).first();
  },

  // Manual create. clinica_id from the actor; origem='manual', status='active'
  // are forced here (never from client input). import_session_id stays null.
  async create(input: CreatePatientInput, conn: Knex = db): Promise<PatientRow> {
    const [row] = await conn<PatientRow>('patients')
      .insert({
        clinica_id: input.clinica_id,
        import_session_id: null,
        nome: input.nome,
        telefone: input.telefone,
        email: input.email,
        cpf: input.cpf,
        data_nascimento: input.data_nascimento,
        convenio: input.convenio,
        numero_carteirinha: input.numero_carteirinha,
        status: 'active',
        origem: 'manual',
      })
      .returning('*');
    if (!row) throw new Error('patientDao.create: insert returned no row');
    return row;
  },

  // Tenant-scoped partial update. Touches atualizado_em. Returns the updated row,
  // or undefined when the id doesn't belong to the clinic (no cross-tenant write).
  async updateForClinic(
    id: string,
    clinica_id: string,
    fields: UpdatePatientFields,
    conn: Knex = db,
  ): Promise<PatientRow | undefined> {
    const patch: Record<string, unknown> = { atualizado_em: conn.fn.now() };
    if (fields.nome !== undefined) patch.nome = fields.nome;
    if (fields.telefone !== undefined) patch.telefone = fields.telefone;
    if (fields.email !== undefined) patch.email = fields.email;
    if (fields.cpf !== undefined) patch.cpf = fields.cpf;
    if (fields.data_nascimento !== undefined) patch.data_nascimento = fields.data_nascimento;
    if (fields.convenio !== undefined) patch.convenio = fields.convenio;
    if (fields.numero_carteirinha !== undefined) patch.numero_carteirinha = fields.numero_carteirinha;

    const [row] = await conn<PatientRow>('patients')
      .where({ id, clinica_id })
      .update(patch)
      .returning('*');
    return row;
  },

  // Tenant-scoped soft delete / restore via status. No physical delete (keeps
  // appointment history intact — appointments.patient_id is ON DELETE CASCADE).
  async setStatusForClinic(
    id: string,
    clinica_id: string,
    status: string,
    conn: Knex = db,
  ): Promise<PatientRow | undefined> {
    const [row] = await conn<PatientRow>('patients')
      .where({ id, clinica_id })
      .update({ status, atualizado_em: conn.fn.now() })
      .returning('*');
    return row;
  },

  // Tenant-scoped existence check (read-only). Used by the scheduling module to
  // confirm a patient belongs to the actor's clinic before creating an
  // appointment — never leaks cross-clinic data (returns only a boolean).
  async existsForClinic(id: string, clinica_id: string, conn: Knex = db): Promise<boolean> {
    const row = await conn<PatientRow>('patients').where({ id, clinica_id }).select('id').first();
    return row !== undefined;
  },

  // Safe duplicate merge B-safe (Sprint 3.33; ADR 0007). Non-destructive fill of
  // ONLY the keys present in `patch` (the service decides which keys are blank
  // on the primary and selects the first non-null value from a secondary).
  // Tenant-scoped. Touches atualizado_em. Returns the updated row, or undefined
  // if the id doesn't belong to the clinic (no cross-tenant write).
  async applyFillBlanks(
    id: string,
    clinica_id: string,
    patch: Partial<UpdatePatientFields>,
    conn: Knex = db,
  ): Promise<PatientRow | undefined> {
    if (Object.keys(patch).length === 0) {
      return conn<PatientRow>('patients').where({ id, clinica_id }).first();
    }
    const update: Record<string, unknown> = { atualizado_em: conn.fn.now() };
    if (patch.telefone !== undefined) update.telefone = patch.telefone;
    if (patch.email !== undefined) update.email = patch.email;
    if (patch.cpf !== undefined) update.cpf = patch.cpf;
    if (patch.data_nascimento !== undefined) update.data_nascimento = patch.data_nascimento;
    if (patch.convenio !== undefined) update.convenio = patch.convenio;
    if (patch.numero_carteirinha !== undefined) {
      update.numero_carteirinha = patch.numero_carteirinha;
    }
    const [row] = await conn<PatientRow>('patients')
      .where({ id, clinica_id })
      .update(update)
      .returning('*');
    return row;
  },

  // Safe duplicate merge B-safe (Sprint 3.33; ADR 0007). Compare-and-set on the
  // secondary: archives it AND records provenance only if the row is still in
  // the clinic and currently active. Returns undefined when the CAS misses
  // (already archived/merged, cross-tenant, or no longer eligible) so the
  // service can roll back the surrounding transaction.
  async setMergedInto(
    id: string,
    clinica_id: string,
    primary_id: string,
    conn: Knex = db,
  ): Promise<PatientRow | undefined> {
    const [row] = await conn<PatientRow>('patients')
      .where({ id, clinica_id, status: 'active' })
      .whereNull('merged_into_id')
      .update({
        status: 'archived',
        merged_into_id: primary_id,
        merged_at: conn.fn.now(),
        atualizado_em: conn.fn.now(),
      })
      .returning('*');
    return row;
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
