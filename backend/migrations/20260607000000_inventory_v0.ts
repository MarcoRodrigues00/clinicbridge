import type { Knex } from 'knex';

// Estoque básico v0.1 — Sprint 4.8B (ADR 0017).
//
// FIFTH administrative module (after patients + financial_charges + clinic_services
// + insurance). The inventory layer is operational/administrative:
//   - `notes` (item) / `reason` (movement) are administrative free-text;
//     NEVER carry diagnosis, CID, prescription, or any clinical content
//     (ADR 0017 §5.3). Logger redacts both (config/logger.ts).
//   - Movements are APPEND-ONLY at the application layer. There is no UPDATE
//     or DELETE on inventory_movements anywhere in the backend (corrections
//     are issued as new `adjustment` rows). The DB doesn't have a trigger to
//     enforce immutability — the discipline is in the DAO (no update/delete
//     method) and the service (no codepath touches an existing movement).
//   - `current_quantity` is mutated ONLY by the service inside a
//     SELECT FOR UPDATE transaction together with the movement insert.
//   - Medicamentos controlados (SNGPC / ANVISA), lote/validade obrigatórios,
//     código de barras, fornecedor/NF-e, custo médio, dedução automática
//     por serviço/atendimento ficam FORA do v0.1 (ADR 0017 §7).
//
// SCHEMA INVARIANTS (defended by DB CHECK + service):
//   - inventory_items.name 1..120 chars; trimmed-non-empty; unique per clinic
//     with case-insensitive whitespace-tolerant normalization
//     (UNIQUE INDEX on (clinica_id, lower(btrim(name)))).
//   - inventory_items.category NULL or <= 80 chars.
//   - inventory_items.unit 1..40 chars; trimmed-non-empty.
//   - inventory_items.current_quantity integer >= 0.
//   - inventory_items.minimum_quantity integer >= 0.
//   - inventory_items.location NULL or <= 120 chars.
//   - inventory_items.notes NULL or <= 500 chars.
//   - inventory_items.active boolean; soft-delete only (no physical DELETE
//     at the app layer).
//   - inventory_movements.movement_type IN ('entry','exit','adjustment','loss').
//   - inventory_movements.quantity_delta integer <> 0.
//   - inventory_movements.reason NULL or <= 300 chars.
//   - inventory_movements is APPEND-ONLY at the app layer.
//
// FK ON DELETE policy:
//   - inventory_items.clinica_id            → CASCADE (mirrors tenant tables).
//   - inventory_movements.clinica_id        → CASCADE.
//   - inventory_movements.item_id           → CASCADE (history travels with item;
//                                              physical delete is impossible at
//                                              the app layer — items soft-delete
//                                              via `active`).
//   - inventory_movements.created_by_user_id → SET NULL (preserve evidence even
//                                              if the member leaves the clinic).
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('inventory_items', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('clinica_id')
      .notNullable()
      .references('id')
      .inTable('clinics')
      .onDelete('CASCADE');
    // Administrative item name, e.g. "Gaze 10x10cm", "Luva M". 1..120 chars
    // (DB CHECK + service). Logger redacts via the existing 'notes'/'reason'
    // path? — name is NOT clinical content but is operational; not redacted.
    t.string('name', 120).notNullable();
    // Free-text category — e.g. "Material cirúrgico" | "EPI" | "Administrativo".
    // No enum in DB so categories evolve per clinic without migration.
    t.string('category', 80).nullable();
    // Unit of measure, e.g. "caixa" | "unidade" | "frasco" | "par". 1..40 chars.
    t.string('unit', 40).notNullable();
    // Current quantity. ALWAYS updated by the service inside a SELECT FOR UPDATE
    // transaction together with the movement insert. NEVER touched by direct
    // UPDATE outside of movement processing.
    t.integer('current_quantity').notNullable().defaultTo(0);
    // Visual-alert threshold. 0 means "no alert configured".
    t.integer('minimum_quantity').notNullable().defaultTo(0);
    // Optional physical location ("Sala 1 / armário 2"). Administrative only.
    t.string('location', 120).nullable();
    // Administrative notes. NEVER carries clinical content (invariant — ADR 0017
    // §5.3). Logger REDACTS this field (already covered by the existing 'notes'
    // redact path added in Sprint 4.4B).
    t.text('notes').nullable();
    t.boolean('active').notNullable().defaultTo(true);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // name 1..120 chars AFTER trim. Column width already caps the upper bound at
  // 120 via VARCHAR(120); we keep the explicit upper bound here as
  // defense-in-depth.
  await knex.raw(`
    ALTER TABLE inventory_items
    ADD CONSTRAINT inventory_items_name_length_check
    CHECK (char_length(btrim(name)) >= 1 AND char_length(name) <= 120)
  `);

  // category <= 80 chars (NULL allowed).
  await knex.raw(`
    ALTER TABLE inventory_items
    ADD CONSTRAINT inventory_items_category_length_check
    CHECK (category IS NULL OR char_length(category) <= 80)
  `);

  // unit 1..40 chars AFTER trim.
  await knex.raw(`
    ALTER TABLE inventory_items
    ADD CONSTRAINT inventory_items_unit_length_check
    CHECK (char_length(btrim(unit)) >= 1 AND char_length(unit) <= 40)
  `);

  // current_quantity >= 0. The service ALSO refuses any movement that would
  // drive the value below zero, but the DB CHECK is the real guard against a
  // race window where two concurrent exits both think there is stock.
  await knex.raw(`
    ALTER TABLE inventory_items
    ADD CONSTRAINT inventory_items_current_quantity_nonneg_check
    CHECK (current_quantity >= 0)
  `);

  // minimum_quantity >= 0.
  await knex.raw(`
    ALTER TABLE inventory_items
    ADD CONSTRAINT inventory_items_minimum_quantity_nonneg_check
    CHECK (minimum_quantity >= 0)
  `);

  // location <= 120 chars (NULL allowed).
  await knex.raw(`
    ALTER TABLE inventory_items
    ADD CONSTRAINT inventory_items_location_length_check
    CHECK (location IS NULL OR char_length(location) <= 120)
  `);

  // notes <= 500 chars (NULL allowed).
  await knex.raw(`
    ALTER TABLE inventory_items
    ADD CONSTRAINT inventory_items_notes_length_check
    CHECK (notes IS NULL OR char_length(notes) <= 500)
  `);

  // Case-insensitive, whitespace-tolerant uniqueness inside a clinic. Without
  // normalization the DB would accept "Gaze 10x10", "gaze 10x10", and
  // "  Gaze 10x10  " as distinct rows. The service trims at the edge but the
  // DB unique index is what catches the race (23505 → 409 inventory_item_name_duplicated).
  await knex.raw(`
    CREATE UNIQUE INDEX idx_inventory_items_clinica_name_normalized_unique
    ON inventory_items (clinica_id, lower(btrim(name)))
  `);

  // Tenant-first composite index for list/filter by active (+ name for ORDER).
  await knex.schema.alterTable('inventory_items', (t) => {
    t.index(
      ['clinica_id', 'active', 'name'],
      'idx_inventory_items_clinica_active_name',
    );
  });

  // Partial index for the "low stock" query (UI alert). PostgreSQL cannot
  // index an expression like `current_quantity < minimum_quantity` directly
  // for a WHERE filter, so we just index (clinica_id, active) and let the
  // planner filter; the previous index already covers this. A dedicated
  // partial index would be premature for v0.1 scale.

  await knex.schema.createTable('inventory_movements', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('clinica_id')
      .notNullable()
      .references('id')
      .inTable('clinics')
      .onDelete('CASCADE');
    t.uuid('item_id')
      .notNullable()
      .references('id')
      .inTable('inventory_items')
      .onDelete('CASCADE');
    // movement_type CHECK below; using string column for clarity (no domain).
    t.string('movement_type', 20).notNullable();
    // Signed integer; sign convention enforced by the service:
    //   entry   → quantity_delta > 0
    //   exit    → quantity_delta < 0
    //   loss    → quantity_delta < 0
    //   adjustment → quantity_delta <> 0 (positive or negative)
    // DB CHECK only enforces the universal invariant: <> 0.
    t.integer('quantity_delta').notNullable();
    // Administrative free-text. NEVER clinical content (invariant — ADR 0017
    // §5.3). Logger REDACTS this field via a new 'reason' path added in this
    // sprint (see config/logger.ts).
    t.text('reason').nullable();
    // Required at INSERT time (the service always sets it from the JWT),
    // but the column is NULLABLE so the FK can SET NULL on hard-deletion of
    // the user without aborting the cascade. Mirrors audit_logs.usuario_id.
    t.uuid('created_by_user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // movement_type allowlist.
  await knex.raw(`
    ALTER TABLE inventory_movements
    ADD CONSTRAINT inventory_movements_type_check
    CHECK (movement_type IN ('entry','exit','adjustment','loss'))
  `);

  // quantity_delta <> 0 (universal). Per-type sign rules live in the service.
  await knex.raw(`
    ALTER TABLE inventory_movements
    ADD CONSTRAINT inventory_movements_quantity_delta_nonzero_check
    CHECK (quantity_delta <> 0)
  `);

  // reason <= 300 chars (NULL allowed).
  await knex.raw(`
    ALTER TABLE inventory_movements
    ADD CONSTRAINT inventory_movements_reason_length_check
    CHECK (reason IS NULL OR char_length(reason) <= 300)
  `);

  // Per-item history (the most common access pattern).
  await knex.schema.alterTable('inventory_movements', (t) => {
    t.index(
      ['clinica_id', 'item_id', 'created_at'],
      'idx_inventory_movements_clinica_item_created',
    );
  });

  // Recent listing per clinic (UI "movimentos recentes").
  await knex.schema.alterTable('inventory_movements', (t) => {
    t.index(
      ['clinica_id', 'created_at'],
      'idx_inventory_movements_clinica_created',
    );
  });

  // Filter-by-type listing.
  await knex.schema.alterTable('inventory_movements', (t) => {
    t.index(
      ['clinica_id', 'movement_type', 'created_at'],
      'idx_inventory_movements_clinica_type_created',
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('inventory_movements');
  await knex.schema.dropTableIfExists('inventory_items');
}
