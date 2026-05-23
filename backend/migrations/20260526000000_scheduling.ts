import type { Knex } from 'knex';

// Administrative Scheduling module — Sprint 3.14 (ADR 0006).
//
// ADMINISTRATIVE ONLY. These tables hold scheduling/administrative data — NEVER
// clinical data (no diagnosis, prescription, CID, anamnesis, exams, evolution,
// medication, clinical reason or treatment). `administrative_notes` is a short,
// optional, administrative field; clinical content is out of scope (ADR 0006 /
// docs/administrative-scheduling-scope.md). Everything is tenant-scoped by
// clinica_id.
export async function up(knex: Knex): Promise<void> {
  // --- clinic_professionals -------------------------------------------------
  await knex.schema.createTable('clinic_professionals', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('clinica_id')
      .notNullable()
      .references('id')
      .inTable('clinics')
      .onDelete('CASCADE');
    t.text('name').notNullable();
    // Administrative label only (optional). NOT clinical data and must NOT be used
    // in patient-facing messages (see ADR 0006 reminders addendum).
    t.text('specialty_label').nullable();
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.alterTable('clinic_professionals', (t) => {
    t.index(['clinica_id'], 'idx_clinic_professionals_clinica');
    t.index(['clinica_id', 'is_active'], 'idx_clinic_professionals_clinica_active');
  });

  // --- appointments ---------------------------------------------------------
  await knex.schema.createTable('appointments', (t) => {
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
    // Optional in the MVP: an administrative slot may exist without a defined
    // professional. SET NULL because professionals are deactivated, not deleted.
    t.uuid('professional_id')
      .nullable()
      .references('id')
      .inTable('clinic_professionals')
      .onDelete('SET NULL');
    t.timestamp('starts_at', { useTz: true }).notNullable();
    t.timestamp('ends_at', { useTz: true }).notNullable();
    t.string('status', 20).notNullable().defaultTo('scheduled');
    // Short, OPTIONAL, ADMINISTRATIVE note. Never clinical. Never logged.
    t.text('administrative_notes').nullable();
    t.uuid('created_by_user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    t.uuid('updated_by_user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // Status allowlist enforced at the DB layer (defense in depth; the service also
  // validates). Cancellation is a status — there is no physical delete in the MVP.
  await knex.raw(`
    ALTER TABLE appointments
    ADD CONSTRAINT appointments_status_check
    CHECK (status IN ('scheduled','confirmed','cancelled','rescheduled','no_show','completed'))
  `);

  // ends_at must be strictly after starts_at (service validates too).
  await knex.raw(`
    ALTER TABLE appointments
    ADD CONSTRAINT appointments_time_order_check
    CHECK (ends_at > starts_at)
  `);

  await knex.schema.alterTable('appointments', (t) => {
    t.index(['clinica_id', 'starts_at'], 'idx_appointments_clinica_starts');
    t.index(['clinica_id', 'professional_id', 'starts_at'], 'idx_appointments_clinica_prof_starts');
    t.index(['clinica_id', 'patient_id', 'starts_at'], 'idx_appointments_clinica_patient_starts');
    t.index(['clinica_id', 'status'], 'idx_appointments_clinica_status');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('appointments');
  await knex.schema.dropTableIfExists('clinic_professionals');
}
