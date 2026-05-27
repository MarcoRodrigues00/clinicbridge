import type { Knex } from 'knex';

// Convênios v0.1 — Sprint 4.7B (ADR 0016).
//
// FOURTH ADMINISTRATIVE module (after patients + financial_charges + clinic_services).
// Convênios v0.1 is a COMMERCIAL / ADMINISTRATIVE layer — NEVER a clinical
// entity (ADR 0016 §2):
//   - `name` / `notes` of any insurance entity NEVER carry diagnosis, CID,
//     prescription, or any clinical content.
//   - `reference_price_cents` of `service_insurance_prices` is REFERENCE only;
//     it NEVER auto-propagates to `financial_charges.amount_cents`.
//   - `member_number` and `holder_name` of `patient_insurances` are PII and
//     are REDACTED in logger (config/logger.ts; Sprint 4.7B); NEVER appear in
//     audit_logs.acao or any other audit textual field.
//   - `patients.convenio` and `patients.numero_carteirinha` (legacy text fields)
//     are LEFT INTACT — no automatic migration, no data alteration. The new
//     entity coexists; manual conversion is a 4.7C/UI decision.
//
// SCHEMA INVARIANTS (defended by DB CHECK + service):
//   - insurance_providers.name 1..200 chars; trimmed-non-empty; case-insensitive
//     uniqueness per clinic via UNIQUE INDEX on (clinica_id, lower(btrim(name))).
//   - insurance_providers.notes NULL or <= 500 chars.
//   - insurance_plans.name 1..150 chars; trimmed-non-empty; case-insensitive
//     uniqueness per (clinica_id, provider_id) via UNIQUE INDEX on
//     (clinica_id, provider_id, lower(btrim(name))).
//   - insurance_plans.notes NULL or <= 500 chars.
//   - patient_insurances.member_number NULL or <= 100 chars (PII).
//   - patient_insurances.holder_name NULL or <= 200 chars (PII).
//   - patient_insurances.notes NULL or <= 500 chars; NEVER clinical content.
//   - service_insurance_prices.reference_price_cents NULL or 0..99_999_999
//     (matches financial_charges sanity cap).
//   - service_insurance_prices.notes NULL or <= 500 chars.
//   - financial_charges.payer_type IN ('private','insurance','mixed') OR NULL
//     (NULL = particular by retrocompatibility — existing rows unchanged).
//   - financial_charges.copay_amount_cents NULL or 0..99_999_999.
//   - financial_charges.insurance_amount_cents NULL or 0..99_999_999.
//   - active boolean; soft-delete only (no physical DELETE at app layer).
//
// FK ON DELETE policy:
//   - insurance_providers.clinica_id        → CASCADE  (mirrors every tenant table).
//   - insurance_plans.clinica_id            → CASCADE.
//   - insurance_plans.provider_id           → CASCADE (plans die with the provider).
//   - patient_insurances.clinica_id         → CASCADE.
//   - patient_insurances.patient_id         → CASCADE (the card dies with the patient
//                                                      — symmetric with the clinical
//                                                      table policy).
//   - patient_insurances.provider_id        → SET NULL (preserves historical card
//                                                      record if the operadora row
//                                                      is hard-deleted by future ops).
//   - patient_insurances.plan_id            → SET NULL.
//   - service_insurance_prices.clinica_id   → CASCADE.
//   - service_insurance_prices.service_id   → CASCADE (price die with the service).
//   - service_insurance_prices.provider_id  → CASCADE.
//   - service_insurance_prices.plan_id      → SET NULL.
//   - financial_charges.insurance_provider_id → SET NULL (preserve historical charge).
//   - financial_charges.patient_insurance_id  → SET NULL.
//
// RETROCOMPAT:
//   - financial_charges existing rows keep payer_type = NULL and all insurance_*
//     columns NULL. By service convention, NULL payer_type behaves like
//     'private' for reporting purposes (Sprint 4.7B+).
export async function up(knex: Knex): Promise<void> {
  // ===== insurance_providers ===============================================
  await knex.schema.createTable('insurance_providers', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('clinica_id')
      .notNullable()
      .references('id')
      .inTable('clinics')
      .onDelete('CASCADE');
    // Operadora name, e.g. "Unimed Belo Horizonte", "Bradesco Saúde".
    // 1..200 chars (DB CHECK + service). Logger does NOT redact (administrative).
    t.string('name', 200).notNullable();
    // Administrative free-text notes. NEVER clinical content (service caps at 500).
    t.text('notes').nullable();
    t.boolean('active').notNullable().defaultTo(true);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE insurance_providers
    ADD CONSTRAINT insurance_providers_name_length_check
    CHECK (char_length(btrim(name)) >= 1 AND char_length(name) <= 200)
  `);

  await knex.raw(`
    ALTER TABLE insurance_providers
    ADD CONSTRAINT insurance_providers_notes_length_check
    CHECK (notes IS NULL OR char_length(notes) <= 500)
  `);

  // Case-insensitive, whitespace-tolerant uniqueness inside a clinic.
  // Mirrors the clinic_services normalized unique index (Sprint 4.6B).
  await knex.raw(`
    CREATE UNIQUE INDEX idx_insurance_providers_clinica_name_normalized_unique
    ON insurance_providers (clinica_id, lower(btrim(name)))
  `);

  await knex.schema.alterTable('insurance_providers', (t) => {
    t.index(
      ['clinica_id', 'active', 'name'],
      'idx_insurance_providers_clinica_active_name',
    );
  });

  // ===== insurance_plans ===================================================
  await knex.schema.createTable('insurance_plans', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('clinica_id')
      .notNullable()
      .references('id')
      .inTable('clinics')
      .onDelete('CASCADE');
    t.uuid('provider_id')
      .notNullable()
      .references('id')
      .inTable('insurance_providers')
      .onDelete('CASCADE');
    // Plan name, e.g. "Nacional Flex", "Unipart Plus". 1..150 chars.
    t.string('name', 150).notNullable();
    t.text('notes').nullable();
    t.boolean('active').notNullable().defaultTo(true);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE insurance_plans
    ADD CONSTRAINT insurance_plans_name_length_check
    CHECK (char_length(btrim(name)) >= 1 AND char_length(name) <= 150)
  `);

  await knex.raw(`
    ALTER TABLE insurance_plans
    ADD CONSTRAINT insurance_plans_notes_length_check
    CHECK (notes IS NULL OR char_length(notes) <= 500)
  `);

  // Case-insensitive normalized uniqueness per (clinic, provider). A clinic
  // can have "Flex" under both Unimed and Bradesco; one provider cannot have
  // the same plan twice.
  await knex.raw(`
    CREATE UNIQUE INDEX idx_insurance_plans_clinica_provider_name_normalized_unique
    ON insurance_plans (clinica_id, provider_id, lower(btrim(name)))
  `);

  await knex.schema.alterTable('insurance_plans', (t) => {
    t.index(
      ['clinica_id', 'provider_id', 'active'],
      'idx_insurance_plans_clinica_provider_active',
    );
  });

  // ===== patient_insurances ================================================
  await knex.schema.createTable('patient_insurances', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('clinica_id')
      .notNullable()
      .references('id')
      .inTable('clinics')
      .onDelete('CASCADE');
    t.uuid('patient_id')
      .notNullable()
      .references('id')
      .inTable('patients')
      .onDelete('CASCADE');
    t.uuid('provider_id')
      .notNullable()
      .references('id')
      .inTable('insurance_providers')
      .onDelete('SET NULL');
    t.uuid('plan_id')
      .nullable()
      .references('id')
      .inTable('insurance_plans')
      .onDelete('SET NULL');
    // PII — número da carteirinha. Service caps at 100; logger REDACTS.
    t.string('member_number', 100).nullable();
    // PII — titular (if patient is dependent). Service caps at 200; logger REDACTS.
    t.string('holder_name', 200).nullable();
    // Carteirinha validity. Alert in UI when < today + 30d. Never blocks anything.
    t.date('valid_until').nullable();
    // Administrative notes. NEVER clinical content. Service caps at 500.
    t.text('notes').nullable();
    t.boolean('active').notNullable().defaultTo(true);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE patient_insurances
    ADD CONSTRAINT patient_insurances_member_number_length_check
    CHECK (member_number IS NULL OR char_length(btrim(member_number)) <= 100)
  `);

  await knex.raw(`
    ALTER TABLE patient_insurances
    ADD CONSTRAINT patient_insurances_holder_name_length_check
    CHECK (holder_name IS NULL OR char_length(btrim(holder_name)) <= 200)
  `);

  await knex.raw(`
    ALTER TABLE patient_insurances
    ADD CONSTRAINT patient_insurances_notes_length_check
    CHECK (notes IS NULL OR char_length(notes) <= 500)
  `);

  await knex.schema.alterTable('patient_insurances', (t) => {
    t.index(['clinica_id', 'patient_id'], 'idx_patient_insurances_clinica_patient');
    t.index(['clinica_id', 'provider_id'], 'idx_patient_insurances_clinica_provider');
  });

  // ===== service_insurance_prices ==========================================
  await knex.schema.createTable('service_insurance_prices', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('clinica_id')
      .notNullable()
      .references('id')
      .inTable('clinics')
      .onDelete('CASCADE');
    t.uuid('service_id')
      .notNullable()
      .references('id')
      .inTable('clinic_services')
      .onDelete('CASCADE');
    t.uuid('provider_id')
      .notNullable()
      .references('id')
      .inTable('insurance_providers')
      .onDelete('CASCADE');
    t.uuid('plan_id')
      .nullable()
      .references('id')
      .inTable('insurance_plans')
      .onDelete('SET NULL');
    // Reference price (cents). NEVER auto-propagates to amount_cents (ADR 0016 §3.4).
    t.integer('reference_price_cents').nullable();
    t.text('notes').nullable();
    t.boolean('active').notNullable().defaultTo(true);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE service_insurance_prices
    ADD CONSTRAINT service_insurance_prices_reference_price_range_check
    CHECK (
      reference_price_cents IS NULL
      OR (reference_price_cents >= 0 AND reference_price_cents <= 99999999)
    )
  `);

  await knex.raw(`
    ALTER TABLE service_insurance_prices
    ADD CONSTRAINT service_insurance_prices_notes_length_check
    CHECK (notes IS NULL OR char_length(notes) <= 500)
  `);

  // Uniqueness per (clinica, service, provider, plan). COALESCE(plan_id, ...)
  // trick handles NULL plan_id correctly — without it, two rows with the same
  // (service, provider) and NULL plan_id would both be allowed.
  await knex.raw(`
    CREATE UNIQUE INDEX idx_service_insurance_prices_clinica_svc_prov_plan_unique
    ON service_insurance_prices (
      clinica_id,
      service_id,
      provider_id,
      COALESCE(plan_id, '00000000-0000-0000-0000-000000000000'::uuid)
    )
  `);

  await knex.schema.alterTable('service_insurance_prices', (t) => {
    t.index(
      ['clinica_id', 'service_id', 'active'],
      'idx_service_insurance_prices_clinica_service_active',
    );
    t.index(
      ['clinica_id', 'provider_id', 'active'],
      'idx_service_insurance_prices_clinica_provider_active',
    );
  });

  // ===== financial_charges extension =======================================
  // Additive columns; existing rows keep all NULL (retrocompat).
  await knex.schema.alterTable('financial_charges', (t) => {
    // 'private' | 'insurance' | 'mixed'. NULL = particular (retrocompat).
    t.string('payer_type', 20).nullable();
    t.uuid('insurance_provider_id')
      .nullable()
      .references('id')
      .inTable('insurance_providers')
      .onDelete('SET NULL');
    t.uuid('patient_insurance_id')
      .nullable()
      .references('id')
      .inTable('patient_insurances')
      .onDelete('SET NULL');
    // Parte do paciente (coparticipação). Service validates and may require it
    // when payer_type='mixed'. Logger should NOT redact (numeric, low-risk).
    t.integer('copay_amount_cents').nullable();
    // Parte do convênio. Service validates and may require it when payer_type
    // is 'insurance' or 'mixed'.
    t.integer('insurance_amount_cents').nullable();
  });

  await knex.raw(`
    ALTER TABLE financial_charges
    ADD CONSTRAINT financial_charges_payer_type_check
    CHECK (payer_type IS NULL OR payer_type IN ('private','insurance','mixed'))
  `);

  await knex.raw(`
    ALTER TABLE financial_charges
    ADD CONSTRAINT financial_charges_copay_amount_range_check
    CHECK (
      copay_amount_cents IS NULL
      OR (copay_amount_cents >= 0 AND copay_amount_cents <= 99999999)
    )
  `);

  await knex.raw(`
    ALTER TABLE financial_charges
    ADD CONSTRAINT financial_charges_insurance_amount_range_check
    CHECK (
      insurance_amount_cents IS NULL
      OR (insurance_amount_cents >= 0 AND insurance_amount_cents <= 99999999)
    )
  `);

  // Partial indexes — only rows with a payer/insurance link are interesting.
  await knex.raw(`
    CREATE INDEX idx_financial_charges_payer_type
    ON financial_charges (clinica_id, payer_type)
    WHERE payer_type IS NOT NULL
  `);

  await knex.raw(`
    CREATE INDEX idx_financial_charges_insurance_provider
    ON financial_charges (clinica_id, insurance_provider_id)
    WHERE insurance_provider_id IS NOT NULL
  `);

  await knex.raw(`
    CREATE INDEX idx_financial_charges_patient_insurance
    ON financial_charges (clinica_id, patient_insurance_id)
    WHERE patient_insurance_id IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  // financial_charges extension first (reverse-order rollback).
  await knex.raw('DROP INDEX IF EXISTS idx_financial_charges_patient_insurance');
  await knex.raw('DROP INDEX IF EXISTS idx_financial_charges_insurance_provider');
  await knex.raw('DROP INDEX IF EXISTS idx_financial_charges_payer_type');
  await knex.schema.alterTable('financial_charges', (t) => {
    t.dropColumn('insurance_amount_cents');
    t.dropColumn('copay_amount_cents');
    t.dropColumn('patient_insurance_id');
    t.dropColumn('insurance_provider_id');
    t.dropColumn('payer_type');
  });

  // New tables (dependent first: prices → plans → patient_insurances → providers).
  await knex.schema.dropTableIfExists('service_insurance_prices');
  await knex.schema.dropTableIfExists('patient_insurances');
  await knex.schema.dropTableIfExists('insurance_plans');
  await knex.schema.dropTableIfExists('insurance_providers');
}
