import type { Knex } from 'knex';

// Catálogo de Serviços v0.1 — Sprint 4.6B (ADR 0015).
//
// THIRD ADMINISTRATIVE module (after patients + financial_charges). The
// catalog is a commercial label — NOT a clinical entity (ADR 0015 §2.2):
//   - `name` / `description` / `category` NEVER carry CID, diagnosis,
//     prescription, or patient PII.
//   - `price_cents` is a REFERENCE price; it NEVER auto-propagates to
//     `financial_charges.amount_cents`.
//   - `duration_minutes` is a SUGGESTION; `appointments.starts_at`/`ends_at`
//     remain user-entered.
//
// SCHEMA INVARIANTS (defended by DB CHECK + service):
//   - clinic_services.name 1..120 chars; trimmed-non-empty (DB CHECK uses btrim);
//     unique per clinic with case-insensitive, whitespace-tolerant normalization
//     (UNIQUE INDEX on (clinica_id, lower(btrim(name)))). Service ALSO trims.
//   - clinic_services.category NULL or <= 80 chars.
//   - clinic_services.description NULL or <= 500 chars.
//   - clinic_services.duration_minutes NULL or 5..720.
//   - clinic_services.price_cents NULL or 0..99_999_999 (sanity cap, same as
//     financial_charges.amount_cents).
//   - active boolean; soft-delete only (no physical DELETE at app layer).
//
// FK ON DELETE policy:
//   - clinic_services.clinica_id           → CASCADE  (mirrors every tenant table).
//   - professional_services.professional_id → CASCADE (binding row only).
//   - professional_services.service_id     → CASCADE (binding row only).
//   - professional_services.clinica_id     → CASCADE.
//   - appointments.service_id              → SET NULL (decouple historical agenda).
//   - financial_charges.service_id         → SET NULL (decouple historical charges).
//
// AGENDA × FINANCIAL integration:
//   - appointments.service_id and financial_charges.service_id are OPTIONAL.
//     Existing rows keep service_id = NULL (no data migration).
//   - Same-clinica enforced at the service layer when set (cross-tenant link
//     is impossible because both rows are scoped by clinica_id and the service
//     validates).
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('clinic_services', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('clinica_id')
      .notNullable()
      .references('id')
      .inTable('clinics')
      .onDelete('CASCADE');
    // Commercial label, e.g. "Consulta inicial", "Sessão de fisioterapia 50min".
    // 1..120 chars (DB CHECK + service). Logger does NOT redact (administrative).
    t.string('name', 120).notNullable();
    // Free-text category — e.g. "Consulta" | "Sessão" | "Procedimento". No enum
    // in DB so categories evolve per clinic specialty without migration.
    t.string('category', 80).nullable();
    // Description shown in selectors / detail. NEVER clinical content.
    t.text('description').nullable();
    // Minutes (5..720 = 12h cap). Service ALSO validates.
    t.integer('duration_minutes').nullable();
    // Reference price in BRL cents. NEVER auto-propagates to charges.
    t.integer('price_cents').nullable();
    t.boolean('active').notNullable().defaultTo(true);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // name 1..120 chars AFTER trim (DB CHECK; service ALSO trims at the edge so a
  // user can never persist " " or whitespace-only). column length already caps
  // the upper bound at 120 via the VARCHAR(120) type; we keep the explicit
  // upper bound here as defense-in-depth.
  await knex.raw(`
    ALTER TABLE clinic_services
    ADD CONSTRAINT clinic_services_name_length_check
    CHECK (char_length(btrim(name)) >= 1 AND char_length(name) <= 120)
  `);

  // category <= 80 chars.
  await knex.raw(`
    ALTER TABLE clinic_services
    ADD CONSTRAINT clinic_services_category_length_check
    CHECK (category IS NULL OR char_length(category) <= 80)
  `);

  // description <= 500 chars.
  await knex.raw(`
    ALTER TABLE clinic_services
    ADD CONSTRAINT clinic_services_description_length_check
    CHECK (description IS NULL OR char_length(description) <= 500)
  `);

  // duration_minutes 5..720 (12h cap; service ALSO validates).
  await knex.raw(`
    ALTER TABLE clinic_services
    ADD CONSTRAINT clinic_services_duration_range_check
    CHECK (duration_minutes IS NULL OR (duration_minutes >= 5 AND duration_minutes <= 720))
  `);

  // price_cents 0..99_999_999 — matches financial_charges sanity cap.
  await knex.raw(`
    ALTER TABLE clinic_services
    ADD CONSTRAINT clinic_services_price_range_check
    CHECK (price_cents IS NULL OR (price_cents >= 0 AND price_cents <= 99999999))
  `);

  // Case-insensitive, whitespace-tolerant uniqueness inside a clinic. Without
  // normalization the DB would happily accept "Consulta", "consulta", and
  // " Consulta " as distinct rows even though they are operationally identical
  // for the clinic. The service trims at the edge, but the DB unique index is
  // the real guard (and what 23505 catches on race). Expression UNIQUE INDEX
  // — not a UNIQUE constraint — because PostgreSQL only allows constraints on
  // plain column lists.
  await knex.raw(`
    CREATE UNIQUE INDEX idx_clinic_services_clinica_name_normalized_unique
    ON clinic_services (clinica_id, lower(btrim(name)))
  `);

  // Tenant-first composite index for list / filter by active.
  await knex.schema.alterTable('clinic_services', (t) => {
    t.index(
      ['clinica_id', 'active', 'name'],
      'idx_clinic_services_clinica_active_name',
    );
  });

  // professional_services (binding table). Composite PK (professional_id, service_id);
  // soft-delete via active flag (rebind same pair flips active back to true at
  // the service layer; no duplicate INSERT).
  await knex.schema.createTable('professional_services', (t) => {
    t.uuid('professional_id')
      .notNullable()
      .references('id')
      .inTable('clinic_professionals')
      .onDelete('CASCADE');
    t.uuid('service_id')
      .notNullable()
      .references('id')
      .inTable('clinic_services')
      .onDelete('CASCADE');
    // Redundant but reinforces tenant scoping and lets us index by clinic
    // without joining clinic_services on every read.
    t.uuid('clinica_id')
      .notNullable()
      .references('id')
      .inTable('clinics')
      .onDelete('CASCADE');
    t.boolean('active').notNullable().defaultTo(true);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.primary(['professional_id', 'service_id']);
    t.index(['clinica_id', 'service_id'], 'idx_professional_services_clinic_service');
    t.index(['clinica_id', 'professional_id'], 'idx_professional_services_clinic_prof');
  });

  // appointments.service_id — OPTIONAL link to the catalog. Existing rows
  // keep NULL (no data migration). SET NULL on service delete (delete is
  // forbidden at app layer; FK is defense-in-depth).
  await knex.schema.alterTable('appointments', (t) => {
    t.uuid('service_id')
      .nullable()
      .references('id')
      .inTable('clinic_services')
      .onDelete('SET NULL');
  });
  // Tenant-scoped partial index. Every meaningful lookup is (clinica_id,
  // service_id) — a future "agendamentos deste serviço nesta clínica" report
  // matches the composite, and the WHERE clause keeps the index small while
  // most rows still have service_id IS NULL.
  await knex.raw(`
    CREATE INDEX idx_appointments_clinica_service
    ON appointments (clinica_id, service_id)
    WHERE service_id IS NOT NULL
  `);

  // financial_charges.service_id — OPTIONAL link. NEVER auto-propagates price.
  await knex.schema.alterTable('financial_charges', (t) => {
    t.uuid('service_id')
      .nullable()
      .references('id')
      .inTable('clinic_services')
      .onDelete('SET NULL');
  });
  await knex.raw(`
    CREATE INDEX idx_financial_charges_clinica_service
    ON financial_charges (clinica_id, service_id)
    WHERE service_id IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Drop additive columns + indexes from existing tables first.
  await knex.raw('DROP INDEX IF EXISTS idx_financial_charges_clinica_service');
  await knex.schema.alterTable('financial_charges', (t) => {
    t.dropColumn('service_id');
  });
  await knex.raw('DROP INDEX IF EXISTS idx_appointments_clinica_service');
  await knex.schema.alterTable('appointments', (t) => {
    t.dropColumn('service_id');
  });
  await knex.schema.dropTableIfExists('professional_services');
  // The normalized unique index lives on clinic_services and is removed via
  // dropTable; no separate DROP INDEX needed.
  await knex.schema.dropTableIfExists('clinic_services');
}
