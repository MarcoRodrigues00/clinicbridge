import type { Knex } from 'knex';
import { db } from '../config/db';
import type {
  BillingProviderName,
  BillingProviderSubscriptionRow,
} from '../types/db';

// billing_provider_subscriptions DAO — Sprint 5.1B (ADR 0018 §5.4).
//
// Maps a local clinic_subscriptions row to the provider's subscription id.
// `findByExternalId` is the anti-spoofing tenant resolver for subscription-
// scoped webhooks (5.1E).

export interface CreateProviderSubscriptionInput {
  clinica_id: string;
  subscription_id: string;
  provider: BillingProviderName;
  external_subscription_id: string;
  external_status_raw?: string | null;
}

export const billingProviderSubscriptionDao = {
  async findBySubscription(
    subscription_id: string,
    clinica_id: string,
    conn: Knex = db,
  ): Promise<BillingProviderSubscriptionRow | undefined> {
    return conn<BillingProviderSubscriptionRow>('billing_provider_subscriptions')
      .where({ subscription_id, clinica_id })
      .first();
  },

  // Resolve the tenant from a provider subscription id (webhook resolution).
  // NOT clinic-scoped — trusted internal map.
  async findByExternalId(
    provider: BillingProviderName,
    external_subscription_id: string,
    conn: Knex = db,
  ): Promise<BillingProviderSubscriptionRow | undefined> {
    return conn<BillingProviderSubscriptionRow>('billing_provider_subscriptions')
      .where({ provider, external_subscription_id })
      .first();
  },

  async create(
    input: CreateProviderSubscriptionInput,
    conn: Knex = db,
  ): Promise<BillingProviderSubscriptionRow> {
    const [row] = await conn<BillingProviderSubscriptionRow>(
      'billing_provider_subscriptions',
    )
      .insert({
        clinica_id: input.clinica_id,
        subscription_id: input.subscription_id,
        provider: input.provider,
        external_subscription_id: input.external_subscription_id,
        external_status_raw: input.external_status_raw ?? null,
      })
      .returning('*');
    if (!row) {
      throw new Error('billingProviderSubscriptionDao.create: insert returned no row');
    }
    return row;
  },
};
