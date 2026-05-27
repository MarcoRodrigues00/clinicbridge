import type { Knex } from 'knex';

// Financial Module v0.1 — Sprint 4.4B (ADR 0012).
//
// FIRST FINANCIAL MODULE — administrative, not clinical (ADR 0012 §2 item 5).
// `financial_charges` rows NEVER carry diagnosis/CID/clinical content; the
// `notes` field is administrative free-text capped at 500 chars. Separation
// of financial × clinical is an invariant of this migration.
//
// SCHEMA INVARIANTS (defended by DB CHECK + service):
//   - amount_cents > 0 (no zero or negative charges).
//   - currency = 'BRL' (no multi-currency in v0.1).
//   - status state machine: pending → paid | canceled (no reversal, no restore).
//   - status='paid'     ⇒ paid_at + paid_by_user_id + payment_method NOT NULL.
//   - status='canceled' ⇒ canceled_at + canceled_by_user_id NOT NULL.
//   - status='pending'  ⇒ no paid_* / canceled_* fields set.
//   - NO physical DELETE allowed at the application layer (ADR 0012 §2.3).
//
// FK ON DELETE policy:
//   - clinica_id        → CASCADE  (mirrors every tenant-scoped table).
//   - patient_id        → RESTRICT (financial history has legal/fiscal value;
//                                   archiving the patient uses status='archived'
//                                   in `patients`, not DELETE).
//   - created_by_user_id → RESTRICT (preserves authorship for fiscal evidence).
//   - paid_by_user_id   → SET NULL (audit-evidence preservation).
//   - canceled_by_user_id → SET NULL (same as above).
//   - appointment_id    → SET NULL (decouple from the agenda without orphaning;
//                                   matches appointments.professional_id pattern).
//
// INTEGRATION WITH AGENDA (ADR 0012 §16 — "Nível 3"):
//   - appointment_id is OPTIONAL. When present, the SERVICE validates
//     same-clinica + same-patient. The FK alone does not enforce same-patient.
//   - The DB does NOT have a UNIQUE constraint on (appointment_id) — a single
//     appointment may have 0..N charges (typical = 1, but retornos/extras
//     justify allowing more).
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('financial_charges', (t) => {
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
      .onDelete('RESTRICT');
    // Optional appointment link — Sprint 4.4A Nível 3 (ADR 0012 §16).
    // Service validates same-clinica + same-patient.
    t.uuid('appointment_id')
      .nullable()
      .references('id')
      .inTable('appointments')
      .onDelete('SET NULL');
    t.uuid('created_by_user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    // Description: administrative label of the charge (e.g. "Consulta clínica 27/05").
    // Service ALSO validates and caps; DB CHECK is defense in depth.
    t.text('description').notNullable();
    // Integer cents (ADR 0012 §6.1 design note) — avoids floating-point issues.
    t.integer('amount_cents').notNullable();
    // ISO-4217 currency code. CHECK fixes 'BRL' for v0.1.
    t.string('currency', 3).notNullable().defaultTo('BRL');
    // Optional due date. NULL = no defined due date (overdue logic uses today
    // strictly when due_date IS NOT NULL).
    t.date('due_date').nullable();
    // Lifecycle: pending → paid | canceled. CHECK enforces the allowlist.
    t.string('status', 20).notNullable().defaultTo('pending');
    // Payment fields — populated atomically in markPaid (DAO CAS).
    t.timestamp('paid_at', { useTz: true }).nullable();
    t.uuid('paid_by_user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    t.string('payment_method', 30).nullable();
    // Cancellation fields — populated atomically in cancel (DAO CAS).
    t.text('cancel_reason').nullable();
    t.timestamp('canceled_at', { useTz: true }).nullable();
    t.uuid('canceled_by_user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    // Administrative free-text notes. Service caps at 500 chars + logger redacts.
    // ADR 0012 §6.1: NEVER contains diagnosis/CID/clinical content — invariant.
    t.text('notes').nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // amount_cents > 0. Service ALSO validates; DB CHECK is defense in depth.
  await knex.raw(`
    ALTER TABLE financial_charges
    ADD CONSTRAINT financial_charges_amount_positive_check
    CHECK (amount_cents > 0)
  `);

  // currency fixed to BRL for v0.1.
  await knex.raw(`
    ALTER TABLE financial_charges
    ADD CONSTRAINT financial_charges_currency_brl_check
    CHECK (currency = 'BRL')
  `);

  // status allowlist (defense in depth — service ALSO validates).
  await knex.raw(`
    ALTER TABLE financial_charges
    ADD CONSTRAINT financial_charges_status_check
    CHECK (status IN ('pending','paid','canceled'))
  `);

  // payment_method allowlist (only checked when present).
  await knex.raw(`
    ALTER TABLE financial_charges
    ADD CONSTRAINT financial_charges_payment_method_check
    CHECK (
      payment_method IS NULL
      OR payment_method IN ('cash','pix','card','bank_transfer','other')
    )
  `);

  // description length cap (500 chars). Service ALSO validates at the edge.
  await knex.raw(`
    ALTER TABLE financial_charges
    ADD CONSTRAINT financial_charges_description_length_check
    CHECK (char_length(description) >= 1 AND char_length(description) <= 500)
  `);

  // notes length cap (500 chars).
  await knex.raw(`
    ALTER TABLE financial_charges
    ADD CONSTRAINT financial_charges_notes_length_check
    CHECK (notes IS NULL OR char_length(notes) <= 500)
  `);

  // cancel_reason length cap (200 chars).
  await knex.raw(`
    ALTER TABLE financial_charges
    ADD CONSTRAINT financial_charges_cancel_reason_length_check
    CHECK (cancel_reason IS NULL OR char_length(cancel_reason) <= 200)
  `);

  // Paid triplet: status='paid' implies paid_at + paid_by_user_id + payment_method.
  await knex.raw(`
    ALTER TABLE financial_charges
    ADD CONSTRAINT financial_charges_paid_consistency_check
    CHECK (
      status != 'paid'
      OR (paid_at IS NOT NULL AND paid_by_user_id IS NOT NULL AND payment_method IS NOT NULL)
    )
  `);

  // Canceled pair: status='canceled' implies canceled_at + canceled_by_user_id.
  await knex.raw(`
    ALTER TABLE financial_charges
    ADD CONSTRAINT financial_charges_canceled_consistency_check
    CHECK (
      status != 'canceled'
      OR (canceled_at IS NOT NULL AND canceled_by_user_id IS NOT NULL)
    )
  `);

  // Non-paid rows must not carry payment fields. This prevents a buggy update
  // from leaving paid_at set on a pending row.
  await knex.raw(`
    ALTER TABLE financial_charges
    ADD CONSTRAINT financial_charges_pending_clean_paid_check
    CHECK (
      status = 'paid'
      OR (paid_at IS NULL AND paid_by_user_id IS NULL AND payment_method IS NULL)
    )
  `);

  // Non-canceled rows must not carry cancellation fields.
  await knex.raw(`
    ALTER TABLE financial_charges
    ADD CONSTRAINT financial_charges_pending_clean_canceled_check
    CHECK (
      status = 'canceled'
      OR (canceled_at IS NULL AND canceled_by_user_id IS NULL AND cancel_reason IS NULL)
    )
  `);

  // Indexes (ADR 0012 §6.1 + scope doc §8.2). Tenant-first composite indexes
  // mirror the patient/clinical_documents tables.
  await knex.schema.alterTable('financial_charges', (t) => {
    t.index(
      ['clinica_id', 'patient_id', 'created_at'],
      'idx_financial_charges_clinica_patient_created',
    );
    t.index(
      ['clinica_id', 'status', 'due_date'],
      'idx_financial_charges_clinica_status_due',
    );
    t.index(
      ['clinica_id', 'created_at'],
      'idx_financial_charges_clinica_created',
    );
  });

  // Partial index: only rows with an appointment link are interesting for the
  // ?appointment_id filter and the future agenda badge JOIN (ADR 0012 §16.4).
  await knex.raw(`
    CREATE INDEX idx_financial_charges_appointment
    ON financial_charges (appointment_id)
    WHERE appointment_id IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Single table; no cross-table FKs added outside this migration.
  await knex.schema.dropTableIfExists('financial_charges');
}
