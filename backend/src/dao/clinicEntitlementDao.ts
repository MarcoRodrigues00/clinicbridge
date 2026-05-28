import type { Knex } from 'knex';
import { db } from '../config/db';
import type { ClinicEntitlementRow, EntitlementSource } from '../types/db';

// clinic_entitlements DAO — Sprint 5.1B (ADR 0018 §5.2).
//
// Stores per-tenant OVERRIDES only; plan defaults are computed in runtime
// (billingPlans.ts). Always tenant-scoped — no `listAll`.

export interface UpsertEntitlementInput {
  clinica_id: string;
  feature_key: string;
  enabled: boolean;
  limit_value: number | null;
  source: EntitlementSource;
}

export const clinicEntitlementDao = {
  async listForClinic(
    clinica_id: string,
    conn: Knex = db,
  ): Promise<ClinicEntitlementRow[]> {
    return conn<ClinicEntitlementRow>('clinic_entitlements')
      .where({ clinica_id })
      .orderBy('feature_key', 'asc');
  },

  // Idempotent upsert on the UNIQUE(clinica_id, feature_key) constraint. Used
  // by manual/pilot provisioning to set a per-tenant override.
  async upsert(
    input: UpsertEntitlementInput,
    conn: Knex = db,
  ): Promise<ClinicEntitlementRow> {
    const [row] = await conn<ClinicEntitlementRow>('clinic_entitlements')
      .insert({
        clinica_id: input.clinica_id,
        feature_key: input.feature_key,
        enabled: input.enabled,
        limit_value: input.limit_value,
        source: input.source,
      })
      .onConflict(['clinica_id', 'feature_key'])
      .merge({
        enabled: input.enabled,
        limit_value: input.limit_value,
        source: input.source,
        updated_at: conn.fn.now(),
      })
      .returning('*');
    if (!row) {
      throw new Error('clinicEntitlementDao.upsert: insert returned no row');
    }
    return row;
  },
};
