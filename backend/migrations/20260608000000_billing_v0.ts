import type { Knex } from 'knex';

// Plans, Billing & Entitlements v0.1 — Sprint 5.1B (ADR 0018).
//
// COMMERCIAL layer: the ClinicBridge SaaS charging the CLINIC for the
// subscription. This is NOT the clinic's internal financial module
// (`financial_charges`, ADR 0012, which is the clinic charging its patients).
// The two are intentionally separate — this migration never touches
// `financial_charges` or any clinical/operational table.
//
// MOCK/MANUAL PHASE (5.1B): no real gateway, no checkout, no webhook endpoint,
// no card data, no secrets. The provider-facing columns are all NULLABLE so
// the architecture is ready for the spike (5.1D) without forcing values now.
//
// INVARIANTS (ADR 0018):
//   - Everything is tenant-scoped by `clinica_id`.
//   - ONE subscription row per clinic (UNIQUE clinica_id). v0.1 keeps a single
//     row per tenant and transitions its `status` in place (no subscription
//     history table yet — out of scope).
//   - NO card data is ever modeled (PAN/CVV/expiry live only at the gateway).
//   - `billing_events` is the idempotency ledger: UNIQUE(provider,
//     external_event_id). Reprocessing the same event is a no-op (5.1E webhook).
//   - Provider customer/subscription maps resolve `clinica_id` INTERNALLY — a
//     webhook payload never gets to assert its own tenant (anti-spoofing).
//   - `payload_hash` only (NEVER the raw payload with PII) is stored on events.
//
// FK ON DELETE policy:
//   - clinica_id (subscriptions/entitlements/customer/sub maps) → CASCADE
//     (mirrors every tenant-scoped table; billing dies with the clinic).
//   - clinic_subscriptions.created_by_user_id → SET NULL (preserve who
//     provisioned a manual/pilot subscription even if the user is removed).
//   - billing_provider_subscriptions.subscription_id → CASCADE.
//   - billing_events.clinica_id → SET NULL (evidence preservation, mirrors
//     audit_logs: an event ledger row survives clinic deletion).

const PLAN_CODES = ['essential', 'professional', 'assisted_pilot'] as const;
const SUBSCRIPTION_STATUSES = [
  'trialing',
  'active',
  'past_due',
  'suspended',
  'canceled',
  'manual_pilot',
] as const;
// Mock/manual now; asaas/stripe reserved for the spike (5.1D). Listing them in
// the CHECK now avoids a follow-up migration just to widen the allowlist.
const PROVIDERS = ['mock', 'manual', 'asaas', 'stripe'] as const;
const ENTITLEMENT_SOURCES = ['plan', 'override', 'pilot'] as const;
const EVENT_STATUSES = ['received', 'processed', 'ignored', 'failed'] as const;

function inList(values: readonly string[]): string {
  return values.map((v) => `'${v}'`).join(',');
}

export async function up(knex: Knex): Promise<void> {
  // ----- clinic_subscriptions — the clinic's SaaS subscription (1 per tenant) ---
  await knex.schema.createTable('clinic_subscriptions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('clinica_id')
      .notNullable()
      .unique() // ONE subscription per tenant (v0.1).
      .references('id')
      .inTable('clinics')
      .onDelete('CASCADE');
    t.string('plan_code', 40).notNullable();
    t.string('status', 20).notNullable();
    t.timestamp('trial_ends_at', { useTz: true }).nullable();
    t.timestamp('current_period_start', { useTz: true }).nullable();
    t.timestamp('current_period_end', { useTz: true }).nullable();
    // End of the post-past_due tolerance window. NULL = no grace configured.
    t.timestamp('grace_until', { useTz: true }).nullable();
    t.timestamp('canceled_at', { useTz: true }).nullable();
    // NULL during the mock phase (no real gateway bound).
    t.string('provider', 20).nullable();
    // Who provisioned this (manual/pilot). NULL for system/default origin.
    t.uuid('created_by_user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE clinic_subscriptions
    ADD CONSTRAINT clinic_subscriptions_plan_code_check
    CHECK (plan_code IN (${inList(PLAN_CODES)}))
  `);
  await knex.raw(`
    ALTER TABLE clinic_subscriptions
    ADD CONSTRAINT clinic_subscriptions_status_check
    CHECK (status IN (${inList(SUBSCRIPTION_STATUSES)}))
  `);
  await knex.raw(`
    ALTER TABLE clinic_subscriptions
    ADD CONSTRAINT clinic_subscriptions_provider_check
    CHECK (provider IS NULL OR provider IN (${inList(PROVIDERS)}))
  `);
  // canceled status ⇒ canceled_at set (consistency; defense in depth).
  await knex.raw(`
    ALTER TABLE clinic_subscriptions
    ADD CONSTRAINT clinic_subscriptions_canceled_consistency_check
    CHECK (status <> 'canceled' OR canceled_at IS NOT NULL)
  `);
  await knex.schema.alterTable('clinic_subscriptions', (t) => {
    t.index(['status'], 'idx_clinic_subscriptions_status');
  });

  // ----- clinic_entitlements — per-tenant OVERRIDES (plan defaults computed) ---
  // The plan's module/limit map is computed in runtime from the plan catalog
  // (billingPlans.ts); this table only persists per-tenant OVERRIDES (e.g. a
  // pilot that unlocks one extra module, or a custom limit). `source` is
  // 'override' or 'pilot' for rows here; 'plan' is reserved for the computed
  // (non-persisted) defaults so the API can label each effective entitlement.
  await knex.schema.createTable('clinic_entitlements', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('clinica_id')
      .notNullable()
      .references('id')
      .inTable('clinics')
      .onDelete('CASCADE');
    t.string('feature_key', 60).notNullable();
    t.boolean('enabled').notNullable();
    // Numeric value for `limit.*` keys; NULL = unlimited / not-applicable.
    t.integer('limit_value').nullable();
    t.string('source', 20).notNullable().defaultTo('override');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(['clinica_id', 'feature_key'], {
      indexName: 'uq_clinic_entitlements_clinica_feature',
    });
  });
  await knex.raw(`
    ALTER TABLE clinic_entitlements
    ADD CONSTRAINT clinic_entitlements_source_check
    CHECK (source IN (${inList(ENTITLEMENT_SOURCES)}))
  `);
  await knex.raw(`
    ALTER TABLE clinic_entitlements
    ADD CONSTRAINT clinic_entitlements_feature_key_length_check
    CHECK (char_length(btrim(feature_key)) >= 1 AND char_length(feature_key) <= 60)
  `);

  // ----- billing_provider_customers — clinic ↔ provider customer map ----------
  await knex.schema.createTable('billing_provider_customers', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('clinica_id')
      .notNullable()
      .references('id')
      .inTable('clinics')
      .onDelete('CASCADE');
    t.string('provider', 20).notNullable();
    t.string('external_customer_id', 255).notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    // One customer record per (provider, external id) — also the lookup used to
    // resolve the tenant from an inbound webhook (anti-spoofing, 5.1E).
    t.unique(['provider', 'external_customer_id'], {
      indexName: 'uq_billing_provider_customers_provider_external',
    });
    // One customer per (clinic, provider).
    t.unique(['clinica_id', 'provider'], {
      indexName: 'uq_billing_provider_customers_clinica_provider',
    });
  });
  await knex.raw(`
    ALTER TABLE billing_provider_customers
    ADD CONSTRAINT billing_provider_customers_provider_check
    CHECK (provider IN (${inList(PROVIDERS)}))
  `);

  // ----- billing_provider_subscriptions — subscription ↔ provider sub map -----
  await knex.schema.createTable('billing_provider_subscriptions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('clinica_id')
      .notNullable()
      .references('id')
      .inTable('clinics')
      .onDelete('CASCADE');
    t.uuid('subscription_id')
      .notNullable()
      .references('id')
      .inTable('clinic_subscriptions')
      .onDelete('CASCADE');
    t.string('provider', 20).notNullable();
    t.string('external_subscription_id', 255).notNullable();
    // Raw provider status string — diagnostic only; the canonical state lives in
    // clinic_subscriptions.status.
    t.string('external_status_raw', 60).nullable();
    t.timestamp('last_synced_at', { useTz: true }).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(['provider', 'external_subscription_id'], {
      indexName: 'uq_billing_provider_subscriptions_provider_external',
    });
  });
  await knex.raw(`
    ALTER TABLE billing_provider_subscriptions
    ADD CONSTRAINT billing_provider_subscriptions_provider_check
    CHECK (provider IN (${inList(PROVIDERS)}))
  `);
  await knex.schema.alterTable('billing_provider_subscriptions', (t) => {
    t.index(['clinica_id'], 'idx_billing_provider_subscriptions_clinica');
    t.index(['subscription_id'], 'idx_billing_provider_subscriptions_subscription');
  });

  // ----- billing_events — idempotent provider/webhook event ledger ------------
  await knex.schema.createTable('billing_events', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('provider', 20).notNullable();
    t.string('external_event_id', 255).notNullable();
    t.string('event_type', 80).notNullable();
    // Resolved via the internal provider maps — NEVER trusted from the payload.
    // SET NULL on clinic deletion to keep the ledger row as evidence.
    t.uuid('clinica_id')
      .nullable()
      .references('id')
      .inTable('clinics')
      .onDelete('SET NULL');
    t.string('status', 20).notNullable().defaultTo('received');
    // Hash of the raw payload — NEVER the raw payload itself (which may carry PII).
    t.string('payload_hash', 128).nullable();
    t.timestamp('received_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('processed_at', { useTz: true }).nullable();
    // Idempotency key: the same provider event is recorded at most once.
    t.unique(['provider', 'external_event_id'], {
      indexName: 'uq_billing_events_provider_external',
    });
  });
  await knex.raw(`
    ALTER TABLE billing_events
    ADD CONSTRAINT billing_events_provider_check
    CHECK (provider IN (${inList(PROVIDERS)}))
  `);
  await knex.raw(`
    ALTER TABLE billing_events
    ADD CONSTRAINT billing_events_status_check
    CHECK (status IN (${inList(EVENT_STATUSES)}))
  `);
  await knex.schema.alterTable('billing_events', (t) => {
    t.index(['clinica_id'], 'idx_billing_events_clinica');
    t.index(['provider', 'event_type'], 'idx_billing_events_provider_type');
  });
}

export async function down(knex: Knex): Promise<void> {
  // Drop in reverse dependency order (sub map references subscriptions).
  await knex.schema.dropTableIfExists('billing_events');
  await knex.schema.dropTableIfExists('billing_provider_subscriptions');
  await knex.schema.dropTableIfExists('billing_provider_customers');
  await knex.schema.dropTableIfExists('clinic_entitlements');
  await knex.schema.dropTableIfExists('clinic_subscriptions');
}
