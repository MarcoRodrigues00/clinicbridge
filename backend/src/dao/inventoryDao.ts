import type { Knex } from 'knex';
import { db } from '../config/db';
import type {
  InventoryItemRow,
  InventoryMovementRow,
  InventoryMovementType,
} from '../types/db';

// Estoque básico v0.1 — Sprint 4.8B (ADR 0017).
//
// Defense-in-depth invariants enforced HERE:
//   1. EVERY read and write is ALWAYS scoped by `clinica_id`. There is no
//      `listAll()`; there is no `findById()` without a clinic — cross-tenant
//      access is unreachable from this DAO.
//   2. NO physical DELETE in either table at the app layer. Items use the
//      `active` flag for soft-delete; movements are APPEND-ONLY.
//   3. There is NO `updateMovement` or `deleteMovement` method. Corrections
//      are issued as new `adjustment` rows by the service.
//   4. `current_quantity` is mutated ONLY through `adjustQuantity` while a
//      SELECT FOR UPDATE lock is held on the item row by the service.
//   5. DAO never JOINs against any clinical_* table.

// ---------- inventory_items ------------------------------------------------

export interface CreateInventoryItemInput {
  clinica_id: string;
  name: string;
  category: string | null;
  unit: string;
  minimum_quantity: number;
  location: string | null;
  notes: string | null;
}

export interface UpdateInventoryItemFields {
  name?: string;
  category?: string | null;
  unit?: string;
  minimum_quantity?: number;
  location?: string | null;
  notes?: string | null;
}

export interface ListInventoryItemsFilters {
  active?: boolean | null;
  low_stock?: boolean | null;
  query?: string | null;
  category?: string | null;
  limit: number;
  offset: number;
}

export const inventoryItemDao = {
  async create(
    input: CreateInventoryItemInput,
    conn: Knex = db,
  ): Promise<InventoryItemRow> {
    const [row] = await conn<InventoryItemRow>('inventory_items')
      .insert({
        clinica_id: input.clinica_id,
        name: input.name,
        category: input.category,
        unit: input.unit,
        // current_quantity intentionally NOT set on INSERT: every item starts
        // at 0 (DB default). The first movement (entry/adjustment) populates it
        // through the service transaction. Service never accepts an initial
        // quantity on create.
        minimum_quantity: input.minimum_quantity,
        location: input.location,
        notes: input.notes,
      })
      .returning('*');
    if (!row) throw new Error('inventoryItemDao.create: insert returned no row');
    return row;
  },

  async listForClinic(
    clinica_id: string,
    filters: ListInventoryItemsFilters,
    conn: Knex = db,
  ): Promise<InventoryItemRow[]> {
    const query = conn<InventoryItemRow>('inventory_items').where({ clinica_id });
    if (filters.active === true || filters.active === false) {
      query.andWhere({ active: filters.active });
    }
    if (filters.low_stock === true) {
      // Quantity strictly below the alert threshold AND threshold > 0
      // (threshold 0 = "no alert configured"; never surface a zero-vs-zero row).
      query.andWhere('minimum_quantity', '>', 0);
      query.andWhereRaw('current_quantity < minimum_quantity');
    }
    if (filters.category) {
      query.andWhere({ category: filters.category });
    }
    if (filters.query) {
      // Case-insensitive substring on name. ILIKE in PostgreSQL.
      query.andWhereRaw('lower(name) LIKE ?', [`%${filters.query.toLowerCase()}%`]);
    }
    return query.orderBy('name', 'asc').limit(filters.limit).offset(filters.offset);
  },

  async findByIdForClinic(
    id: string,
    clinica_id: string,
    conn: Knex = db,
  ): Promise<InventoryItemRow | undefined> {
    return conn<InventoryItemRow>('inventory_items').where({ id, clinica_id }).first();
  },

  // SELECT ... FOR UPDATE inside a transaction. Caller MUST hold a `trx`
  // (otherwise the lock has no scope and is released immediately on the
  // implicit autocommit). The service uses this to atomically read +
  // recompute + UPDATE the row alongside the movement INSERT.
  async findByIdForUpdate(
    id: string,
    clinica_id: string,
    trx: Knex.Transaction,
  ): Promise<InventoryItemRow | undefined> {
    return trx<InventoryItemRow>('inventory_items')
      .where({ id, clinica_id })
      .forUpdate()
      .first();
  },

  // Tenant-scoped lookup by exact-cased name. Used by the service to
  // disambiguate 23505 between a same-clinic duplicate and a wider DB error.
  async findByNameForClinic(
    clinica_id: string,
    name: string,
    conn: Knex = db,
  ): Promise<InventoryItemRow | undefined> {
    return conn<InventoryItemRow>('inventory_items')
      .where({ clinica_id, name })
      .first();
  },

  // Tenant-scoped update of METADATA only. Does NOT touch `current_quantity`
  // or `active` — both have dedicated paths (adjustQuantity / updateStatus).
  async updateForClinic(
    id: string,
    clinica_id: string,
    fields: UpdateInventoryItemFields,
    conn: Knex = db,
  ): Promise<InventoryItemRow | undefined> {
    const patch: Record<string, unknown> = { updated_at: conn.fn.now() };
    if (fields.name !== undefined) patch.name = fields.name;
    if (fields.category !== undefined) patch.category = fields.category;
    if (fields.unit !== undefined) patch.unit = fields.unit;
    if (fields.minimum_quantity !== undefined) {
      patch.minimum_quantity = fields.minimum_quantity;
    }
    if (fields.location !== undefined) patch.location = fields.location;
    if (fields.notes !== undefined) patch.notes = fields.notes;

    const [row] = await conn<InventoryItemRow>('inventory_items')
      .where({ id, clinica_id })
      .update(patch)
      .returning('*');
    return row;
  },

  // Tenant-scoped status toggle. Soft-delete only — `active=false` keeps the
  // row referenceable by historical movements.
  async updateStatus(
    id: string,
    clinica_id: string,
    active: boolean,
    conn: Knex = db,
  ): Promise<InventoryItemRow | undefined> {
    const [row] = await conn<InventoryItemRow>('inventory_items')
      .where({ id, clinica_id })
      .update({ active, updated_at: conn.fn.now() })
      .returning('*');
    return row;
  },

  // Mutates `current_quantity` ONLY inside the movement transaction. The
  // caller (inventoryService.createMovement) must have already validated:
  //   - the item belongs to the clinic (locked via findByIdForUpdate);
  //   - the item is active;
  //   - new_quantity >= 0.
  // This DAO trusts those preconditions and just writes the value.
  async setQuantity(
    id: string,
    clinica_id: string,
    new_quantity: number,
    trx: Knex.Transaction,
  ): Promise<InventoryItemRow | undefined> {
    const [row] = await trx<InventoryItemRow>('inventory_items')
      .where({ id, clinica_id })
      .update({ current_quantity: new_quantity, updated_at: trx.fn.now() })
      .returning('*');
    return row;
  },
};

// ---------- inventory_movements (APPEND-ONLY) ------------------------------

export interface CreateInventoryMovementInput {
  clinica_id: string;
  item_id: string;
  movement_type: InventoryMovementType;
  quantity_delta: number;
  reason: string | null;
  created_by_user_id: string;
}

export interface ListInventoryMovementsFilters {
  item_id?: string | null;
  movement_type?: InventoryMovementType | null;
  date_from?: Date | null;
  date_to?: Date | null;
  limit: number;
  offset: number;
}

export const inventoryMovementDao = {
  // INSERT must happen inside the same transaction as the item.setQuantity
  // call so a partial failure cannot leave the running quantity out of sync
  // with the movement history.
  async create(
    input: CreateInventoryMovementInput,
    trx: Knex.Transaction,
  ): Promise<InventoryMovementRow> {
    const [row] = await trx<InventoryMovementRow>('inventory_movements')
      .insert({
        clinica_id: input.clinica_id,
        item_id: input.item_id,
        movement_type: input.movement_type,
        quantity_delta: input.quantity_delta,
        reason: input.reason,
        created_by_user_id: input.created_by_user_id,
      })
      .returning('*');
    if (!row) throw new Error('inventoryMovementDao.create: insert returned no row');
    return row;
  },

  async listForClinic(
    clinica_id: string,
    filters: ListInventoryMovementsFilters,
    conn: Knex = db,
  ): Promise<InventoryMovementRow[]> {
    const query = conn<InventoryMovementRow>('inventory_movements').where({ clinica_id });
    if (filters.item_id) {
      query.andWhere({ item_id: filters.item_id });
    }
    if (filters.movement_type) {
      query.andWhere({ movement_type: filters.movement_type });
    }
    if (filters.date_from) {
      query.andWhere('created_at', '>=', filters.date_from);
    }
    if (filters.date_to) {
      query.andWhere('created_at', '<=', filters.date_to);
    }
    return query.orderBy('created_at', 'desc').limit(filters.limit).offset(filters.offset);
  },

  // No update(). No remove(). Movements are append-only by invariant.
};
