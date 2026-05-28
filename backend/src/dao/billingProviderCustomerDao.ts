import type { Knex } from 'knex';
import { db } from '../config/db';
import type { BillingProviderCustomerRow, BillingProviderName } from '../types/db';

// billing_provider_customers DAO — Sprint 5.1B (ADR 0018 §5.3).
//
// The clinic ↔ provider-customer map. `findByExternalId` is the anti-spoofing
// lookup used to resolve the tenant from an inbound webhook (5.1E): the tenant
// comes from THIS internal map, never from the webhook payload.

export interface CreateProviderCustomerInput {
  clinica_id: string;
  provider: BillingProviderName;
  external_customer_id: string;
}

export const billingProviderCustomerDao = {
  async findByClinicAndProvider(
    clinica_id: string,
    provider: BillingProviderName,
    conn: Knex = db,
  ): Promise<BillingProviderCustomerRow | undefined> {
    return conn<BillingProviderCustomerRow>('billing_provider_customers')
      .where({ clinica_id, provider })
      .first();
  },

  // Resolve the tenant from a provider customer id (webhook tenant resolution).
  // NOT clinic-scoped on purpose — this is the trusted internal map.
  async findByExternalId(
    provider: BillingProviderName,
    external_customer_id: string,
    conn: Knex = db,
  ): Promise<BillingProviderCustomerRow | undefined> {
    return conn<BillingProviderCustomerRow>('billing_provider_customers')
      .where({ provider, external_customer_id })
      .first();
  },

  async create(
    input: CreateProviderCustomerInput,
    conn: Knex = db,
  ): Promise<BillingProviderCustomerRow> {
    const [row] = await conn<BillingProviderCustomerRow>('billing_provider_customers')
      .insert(input)
      .returning('*');
    if (!row) {
      throw new Error('billingProviderCustomerDao.create: insert returned no row');
    }
    return row;
  },
};
