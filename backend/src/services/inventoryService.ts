import { db } from '../config/db';
import { logger } from '../config/logger';
import { auditLogDao } from '../dao/auditLogDao';
import {
  inventoryItemDao,
  inventoryMovementDao,
} from '../dao/inventoryDao';
import { userClinicalRoleDao } from '../dao/userClinicalRoleDao';
import { HttpError } from '../middlewares/errorHandler';
import type {
  InventoryItemRow,
  InventoryMovementRow,
  InventoryMovementType,
  UserClinicalRoleName,
  UserPapel,
} from '../types/db';
import type { AuthContext } from './authService';

// Estoque básico v0.1 — Sprint 4.8B (ADR 0017).
//
// ADMINISTRATIVE / OPERATIONAL module. Routes use `requireRole`, NOT
// `requireClinicalRole`. profissional_clinico (whose papel is 'secretaria' +
// clinical grant in `user_clinical_roles`) is INTENTIONALLY excluded from
// every inventory endpoint via the service-level role downgrade below.
//
// Permission matrix (ADR 0017 §4):
//   - dono_clinica: full CRUD + register movements + read.
//   - secretaria:   register movements + read. NO item CRUD.
//   - profissional_clinico (papel='secretaria' + grant): BLOCKED in service.
//   - gestor_clinica (papel='secretaria' + grant): read + movements (mirrors
//     "secretaria" rule; gestor never gets item CRUD in v0.1).
//
// Field-level invariants enforced HERE (defense in depth — DB CHECK already
// catches violations, but the service produces clean 400 codes):
//   - name: trim, 1..120 chars, UNIQUE per clinic.
//   - category: trim or null, <= 80 chars.
//   - unit: trim, 1..40 chars.
//   - minimum_quantity: integer 0..MAX_QUANTITY.
//   - location: trim or null, <= 120 chars.
//   - notes: trim or null, <= 500 chars.
//   - movement_type: one of entry|exit|adjustment|loss.
//   - quantity_delta: integer != 0. Sign per movement_type:
//       entry      → > 0
//       exit       → < 0
//       loss       → < 0
//       adjustment → != 0 (positive or negative)
//   - reason: trim or null, <= 300 chars.
//
// NEVER:
//   - mutates current_quantity outside of createMovement transaction.
//   - mutates from this service: id, clinica_id, created_at, current_quantity
//     (except via createMovement).
//   - writes name/notes/location/reason/category to audit_logs (audit is
//     metadata-only per ADR 0017 §5.2).
//   - accepts a patient_id on any inventory row (proibido — ADR 0017 §6.4).

export interface InventoryActorInput {
  clinica_id: string;
  usuario_id: string;
  papel: UserPapel;
}

export interface InventoryActor extends InventoryActorInput {
  clinical_grants: Set<UserClinicalRoleName>;
}

// Loads clinical-role grants once per request (mirrors buildInsuranceActor).
// profissional_clinico carries papel='secretaria' in the JWT, so route-level
// requireRole admits them; the service-level check below rejects.
export async function buildInventoryActor(
  input: InventoryActorInput,
): Promise<InventoryActor> {
  const grants = await userClinicalRoleDao.listActiveRoleNames(
    input.usuario_id,
    input.clinica_id,
  );
  return {
    ...input,
    clinical_grants: new Set(grants),
  };
}

// Roles allowed to register movements / read inventory (papel level).
const INVENTORY_OPERATOR_ROLES: readonly UserPapel[] = ['dono_clinica', 'secretaria'];
// Roles allowed to create/edit/deactivate inventory items (papel level).
const INVENTORY_ADMIN_ROLES: readonly UserPapel[] = ['dono_clinica'];

// ----- Validation constants -------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NAME_MIN = 1;
const NAME_MAX = 120;
const CATEGORY_MAX = 80;
const UNIT_MIN = 1;
const UNIT_MAX = 40;
const LOCATION_MAX = 120;
const NOTES_MAX = 500;
const REASON_MAX = 300;

// Sanity cap on quantity. Matches financial_charges price cap convention.
// Items reasonably never reach 8-digit quantities in a small clinic.
const QUANTITY_MAX = 99_999_999;

const LIST_DEFAULT_LIMIT = 50;
const LIST_MAX_LIMIT = 100;
const LIST_MAX_OFFSET = 10_000;

const MOVEMENT_TYPES: ReadonlyArray<InventoryMovementType> = [
  'entry',
  'exit',
  'adjustment',
  'loss',
];

// ----- Error helpers --------------------------------------------------------

function invalid(message: string, code = 'inventory_invalid'): HttpError {
  return new HttpError(400, code, message);
}

function itemNotFound(): HttpError {
  return new HttpError(404, 'inventory_item_not_found', 'Item de estoque não encontrado.');
}

function duplicateName(): HttpError {
  return new HttpError(
    409,
    'inventory_item_name_duplicated',
    'Já existe um item com esse nome nesta clínica.',
  );
}

function itemInactive(): HttpError {
  return new HttpError(
    400,
    'inventory_item_inactive',
    'O item está desativado. Reative-o antes de registrar movimentação.',
  );
}

function quantityInsufficient(): HttpError {
  return new HttpError(
    409,
    'inventory_quantity_insufficient',
    'Quantidade em estoque insuficiente para essa movimentação.',
  );
}

function forbidden(): HttpError {
  return new HttpError(
    403,
    'forbidden_role',
    'Você não tem permissão para executar esta ação.',
  );
}

// ----- Authorization helpers ------------------------------------------------

function ensureNotProfissional(actor: InventoryActor): void {
  // ADR 0017 §4: profissional_clinico is BLOCKED on every inventory endpoint
  // regardless of papel. The JWT exposes papel='secretaria' for users that
  // carry the clinical grant, so we have to consult user_clinical_roles.
  if (actor.clinical_grants.has('profissional_clinico')) {
    throw new HttpError(
      403,
      'forbidden_role',
      'Profissional clínico não tem acesso ao estoque.',
    );
  }
}

function ensureOperator(actor: InventoryActor): void {
  if (!INVENTORY_OPERATOR_ROLES.includes(actor.papel)) {
    throw forbidden();
  }
  ensureNotProfissional(actor);
}

function ensureAdmin(actor: InventoryActor): void {
  if (!INVENTORY_ADMIN_ROLES.includes(actor.papel)) {
    throw forbidden();
  }
  ensureNotProfissional(actor);
}

// ----- Parsers --------------------------------------------------------------

function parseUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw invalid(`Identificador inválido: ${field}.`);
  }
  return value;
}

function parseOptionalUuid(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  return parseUuid(value, field);
}

function parseName(value: unknown): string {
  if (typeof value !== 'string') throw invalid('name é obrigatório.');
  const trimmed = value.trim();
  if (trimmed.length < NAME_MIN) throw invalid('name é obrigatório.');
  if (trimmed.length > NAME_MAX) {
    throw invalid(`name deve ter no máximo ${NAME_MAX} caracteres.`);
  }
  return trimmed;
}

function parseOptionalCategory(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw invalid('category inválido.');
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > CATEGORY_MAX) {
    throw invalid(`category deve ter no máximo ${CATEGORY_MAX} caracteres.`);
  }
  return trimmed;
}

function parseUnit(value: unknown): string {
  if (typeof value !== 'string') throw invalid('unit é obrigatório.');
  const trimmed = value.trim();
  if (trimmed.length < UNIT_MIN) throw invalid('unit é obrigatório.');
  if (trimmed.length > UNIT_MAX) {
    throw invalid(`unit deve ter no máximo ${UNIT_MAX} caracteres.`);
  }
  return trimmed;
}

function parseOptionalLocation(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw invalid('location inválido.');
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > LOCATION_MAX) {
    throw invalid(`location deve ter no máximo ${LOCATION_MAX} caracteres.`);
  }
  return trimmed;
}

function parseOptionalNotes(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw invalid('notes inválido.');
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > NOTES_MAX) {
    throw invalid(`notes deve ter no máximo ${NOTES_MAX} caracteres.`);
  }
  return trimmed;
}

function parseOptionalReason(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw invalid('reason inválido.');
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > REASON_MAX) {
    throw invalid(`reason deve ter no máximo ${REASON_MAX} caracteres.`);
  }
  return trimmed;
}

function parseMinimumQuantity(value: unknown): number {
  // Default to 0 when omitted; explicit nullable is rejected (use 0 to mean
  // "no alert").
  if (value === undefined) return 0;
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw invalid('minimum_quantity deve ser um inteiro.');
  }
  if (value < 0 || value > QUANTITY_MAX) {
    throw invalid(`minimum_quantity deve estar entre 0 e ${QUANTITY_MAX}.`);
  }
  return value;
}

function parseQuantityDelta(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw invalid('quantity_delta deve ser um inteiro.');
  }
  if (value === 0) {
    throw invalid('quantity_delta não pode ser zero.');
  }
  if (Math.abs(value) > QUANTITY_MAX) {
    throw invalid(`quantity_delta deve estar entre -${QUANTITY_MAX} e ${QUANTITY_MAX}.`);
  }
  return value;
}

function parseMovementType(value: unknown): InventoryMovementType {
  if (typeof value !== 'string') {
    throw invalid('movement_type é obrigatório.');
  }
  if (!(MOVEMENT_TYPES as readonly string[]).includes(value)) {
    throw invalid(
      `movement_type deve ser um de: ${MOVEMENT_TYPES.join(', ')}.`,
    );
  }
  return value as InventoryMovementType;
}

function parseActiveFilter(value: unknown): boolean | null {
  if (value === undefined || value === null || value === '') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw invalid('Filtro active deve ser true ou false.');
}

function parseLowStockFilter(value: unknown): boolean | null {
  if (value === undefined || value === null || value === '') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw invalid('Filtro low_stock deve ser true ou false.');
}

function parseActiveBody(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw invalid('active deve ser booleano.');
  }
  return value;
}

function parseLimit(value: unknown): number {
  if (value === undefined || value === null || value === '') return LIST_DEFAULT_LIMIT;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw invalid('limit inválido.');
  }
  const n = Number(value);
  if (n < 1 || n > LIST_MAX_LIMIT) {
    throw invalid(`limit deve estar entre 1 e ${LIST_MAX_LIMIT}.`);
  }
  return n;
}

function parseOffset(value: unknown): number {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw invalid('offset inválido.');
  }
  const n = Number(value);
  if (n < 0 || n > LIST_MAX_OFFSET) {
    throw invalid(`offset deve estar entre 0 e ${LIST_MAX_OFFSET}.`);
  }
  return n;
}

function parseOptionalQueryString(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw invalid('query inválido.');
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  // Cap the substring to a sane length; nothing useful beyond the column width.
  if (trimmed.length > NAME_MAX) {
    throw invalid(`query deve ter no máximo ${NAME_MAX} caracteres.`);
  }
  return trimmed;
}

function parseOptionalDate(value: unknown, field: string): Date | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw invalid(`${field} inválido.`);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw invalid(`${field} inválido.`);
  return d;
}

function parseOptionalMovementType(value: unknown): InventoryMovementType | null {
  if (value === undefined || value === null || value === '') return null;
  return parseMovementType(value);
}

// ----- Audit ----------------------------------------------------------------

// Audit is METADATA-ONLY (ADR 0017 §5.2). NEVER includes name, notes, location,
// category, reason, or any free-text body field. recurso_id is the entity id.
async function safeAudit(
  acao: string,
  recurso: 'inventory_item' | 'inventory_movement',
  recurso_id: string | null,
  actor: InventoryActor,
  ctx: AuthContext,
): Promise<void> {
  try {
    await auditLogDao.create({
      acao,
      usuario_id: actor.usuario_id,
      clinica_id: actor.clinica_id,
      recurso,
      recurso_id,
      ip: ctx.ip,
      user_agent: ctx.user_agent,
      request_id: ctx.request_id,
    });
  } catch (err) {
    // Best-effort write — mirrors clinicServiceService.safeAudit. The row
    // already exists at this point; an audit miss does not roll the write back
    // for non-movement events. For createMovement we audit INSIDE the
    // transaction with a stricter helper below.
    logger.error({ err, acao, audit_write_failed: true }, 'audit log write failed');
  }
}

// ----- Projections ----------------------------------------------------------

export interface PublicInventoryItem {
  id: string;
  clinica_id: string;
  name: string;
  category: string | null;
  unit: string;
  current_quantity: number;
  minimum_quantity: number;
  location: string | null;
  notes: string | null;
  active: boolean;
  low_stock: boolean;
  created_at: Date;
  updated_at: Date;
}

function toPublicItem(row: InventoryItemRow): PublicInventoryItem {
  return {
    id: row.id,
    clinica_id: row.clinica_id,
    name: row.name,
    category: row.category,
    unit: row.unit,
    current_quantity: row.current_quantity,
    minimum_quantity: row.minimum_quantity,
    location: row.location,
    notes: row.notes,
    active: row.active,
    // Helper derived field — true when minimum_quantity > 0 and current < min.
    low_stock:
      row.minimum_quantity > 0 && row.current_quantity < row.minimum_quantity,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export interface PublicInventoryMovement {
  id: string;
  clinica_id: string;
  item_id: string;
  movement_type: InventoryMovementType;
  quantity_delta: number;
  reason: string | null;
  created_by_user_id: string | null;
  created_at: Date;
}

function toPublicMovement(row: InventoryMovementRow): PublicInventoryMovement {
  return {
    id: row.id,
    clinica_id: row.clinica_id,
    item_id: row.item_id,
    movement_type: row.movement_type,
    quantity_delta: row.quantity_delta,
    reason: row.reason,
    created_by_user_id: row.created_by_user_id,
    created_at: row.created_at,
  };
}

// ----- Unique-violation detection -------------------------------------------

interface PgUniqueViolation {
  code: '23505';
}
function isUniqueViolation(err: unknown): err is PgUniqueViolation {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === '23505'
  );
}

// ----- Service --------------------------------------------------------------

export const inventoryService = {
  // GET /inventory/items
  async listItems(
    actor: InventoryActor,
    rawQuery: {
      active?: unknown;
      low_stock?: unknown;
      query?: unknown;
      category?: unknown;
      limit?: unknown;
      offset?: unknown;
    },
  ): Promise<{ items: PublicInventoryItem[] }> {
    ensureOperator(actor);
    const active = parseActiveFilter(rawQuery.active);
    const low_stock = parseLowStockFilter(rawQuery.low_stock);
    const limit = parseLimit(rawQuery.limit);
    const offset = parseOffset(rawQuery.offset);
    const query = parseOptionalQueryString(rawQuery.query);
    const category = parseOptionalCategory(rawQuery.category);
    const rows = await inventoryItemDao.listForClinic(actor.clinica_id, {
      active,
      low_stock,
      query,
      category,
      limit,
      offset,
    });
    return { items: rows.map(toPublicItem) };
  },

  // GET /inventory/items/:id
  async findItem(
    actor: InventoryActor,
    id_param: string,
  ): Promise<{ item: PublicInventoryItem }> {
    ensureOperator(actor);
    const id = parseUuid(id_param, 'id');
    const row = await inventoryItemDao.findByIdForClinic(id, actor.clinica_id);
    if (!row) throw itemNotFound();
    return { item: toPublicItem(row) };
  },

  // POST /inventory/items — dono_clinica only.
  async createItem(
    actor: InventoryActor,
    body: {
      name?: unknown;
      category?: unknown;
      unit?: unknown;
      minimum_quantity?: unknown;
      location?: unknown;
      notes?: unknown;
    },
    ctx: AuthContext,
  ): Promise<{ item: PublicInventoryItem }> {
    ensureAdmin(actor);
    const name = parseName(body.name);
    const category = parseOptionalCategory(body.category);
    const unit = parseUnit(body.unit);
    const minimum_quantity = parseMinimumQuantity(body.minimum_quantity);
    const location = parseOptionalLocation(body.location);
    const notes = parseOptionalNotes(body.notes);

    // Pre-check duplicate (case-insensitive + trim is handled by the DB unique
    // index on lower(btrim(name))). We pre-check on the exact-cased name first
    // so the common path returns 409 without burning an INSERT; the DB unique
    // is the real guard against a race window.
    const existing = await inventoryItemDao.findByNameForClinic(actor.clinica_id, name);
    if (existing) throw duplicateName();

    let row: InventoryItemRow;
    try {
      row = await inventoryItemDao.create({
        clinica_id: actor.clinica_id,
        name,
        category,
        unit,
        minimum_quantity,
        location,
        notes,
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw duplicateName();
      throw err;
    }

    await safeAudit('inventory.item.create.success', 'inventory_item', row.id, actor, ctx);
    return { item: toPublicItem(row) };
  },

  // PATCH /inventory/items/:id — dono_clinica only. Does NOT touch `active` or
  // `current_quantity` (dedicated endpoints handle those).
  async updateItem(
    actor: InventoryActor,
    id_param: string,
    body: {
      name?: unknown;
      category?: unknown;
      unit?: unknown;
      minimum_quantity?: unknown;
      location?: unknown;
      notes?: unknown;
    },
    ctx: AuthContext,
  ): Promise<{ item: PublicInventoryItem }> {
    ensureAdmin(actor);
    const id = parseUuid(id_param, 'id');

    const existing = await inventoryItemDao.findByIdForClinic(id, actor.clinica_id);
    if (!existing) throw itemNotFound();

    const patch: {
      name?: string;
      category?: string | null;
      unit?: string;
      minimum_quantity?: number;
      location?: string | null;
      notes?: string | null;
    } = {};
    if (body.name !== undefined) patch.name = parseName(body.name);
    if (body.category !== undefined) patch.category = parseOptionalCategory(body.category);
    if (body.unit !== undefined) patch.unit = parseUnit(body.unit);
    if (body.minimum_quantity !== undefined) {
      patch.minimum_quantity = parseMinimumQuantity(body.minimum_quantity);
    }
    if (body.location !== undefined) patch.location = parseOptionalLocation(body.location);
    if (body.notes !== undefined) patch.notes = parseOptionalNotes(body.notes);
    if (Object.keys(patch).length === 0) {
      throw invalid('Nenhum campo para atualizar.');
    }

    if (patch.name !== undefined && patch.name !== existing.name) {
      const dup = await inventoryItemDao.findByNameForClinic(actor.clinica_id, patch.name);
      if (dup && dup.id !== id) throw duplicateName();
    }

    let updated: InventoryItemRow | undefined;
    try {
      updated = await inventoryItemDao.updateForClinic(id, actor.clinica_id, patch);
    } catch (err) {
      if (isUniqueViolation(err)) throw duplicateName();
      throw err;
    }
    if (!updated) throw itemNotFound();

    await safeAudit('inventory.item.update.success', 'inventory_item', updated.id, actor, ctx);
    return { item: toPublicItem(updated) };
  },

  // PATCH /inventory/items/:id/status — dono_clinica only. Soft-delete only.
  // Historical movements keep their item_id; a reactivated item resumes movement
  // registration without losing its prior current_quantity.
  async setItemStatus(
    actor: InventoryActor,
    id_param: string,
    body: { active?: unknown },
    ctx: AuthContext,
  ): Promise<{ item: PublicInventoryItem }> {
    ensureAdmin(actor);
    const id = parseUuid(id_param, 'id');
    const active = parseActiveBody(body.active);

    const row = await inventoryItemDao.updateStatus(id, actor.clinica_id, active);
    if (!row) throw itemNotFound();

    await safeAudit('inventory.item.status.update.success', 'inventory_item', row.id, actor, ctx);
    return { item: toPublicItem(row) };
  },

  // GET /inventory/items/:id/movements
  async listMovementsForItem(
    actor: InventoryActor,
    id_param: string,
    rawQuery: {
      movement_type?: unknown;
      date_from?: unknown;
      date_to?: unknown;
      limit?: unknown;
      offset?: unknown;
    },
  ): Promise<{ movements: PublicInventoryMovement[] }> {
    ensureOperator(actor);
    const item_id = parseUuid(id_param, 'id');

    // Verify item belongs to actor's clinic (cross-tenant probe → 404).
    const item = await inventoryItemDao.findByIdForClinic(item_id, actor.clinica_id);
    if (!item) throw itemNotFound();

    const movement_type = parseOptionalMovementType(rawQuery.movement_type);
    const date_from = parseOptionalDate(rawQuery.date_from, 'date_from');
    const date_to = parseOptionalDate(rawQuery.date_to, 'date_to');
    const limit = parseLimit(rawQuery.limit);
    const offset = parseOffset(rawQuery.offset);

    const rows = await inventoryMovementDao.listForClinic(actor.clinica_id, {
      item_id,
      movement_type,
      date_from,
      date_to,
      limit,
      offset,
    });
    return { movements: rows.map(toPublicMovement) };
  },

  // GET /inventory/movements (visão geral recente).
  async listMovements(
    actor: InventoryActor,
    rawQuery: {
      item_id?: unknown;
      movement_type?: unknown;
      date_from?: unknown;
      date_to?: unknown;
      limit?: unknown;
      offset?: unknown;
    },
  ): Promise<{ movements: PublicInventoryMovement[] }> {
    ensureOperator(actor);
    const item_id = parseOptionalUuid(rawQuery.item_id, 'item_id');
    const movement_type = parseOptionalMovementType(rawQuery.movement_type);
    const date_from = parseOptionalDate(rawQuery.date_from, 'date_from');
    const date_to = parseOptionalDate(rawQuery.date_to, 'date_to');
    const limit = parseLimit(rawQuery.limit);
    const offset = parseOffset(rawQuery.offset);

    // When item_id is provided, verify it belongs to the clinic (cross-tenant
    // probe → 404).
    if (item_id) {
      const item = await inventoryItemDao.findByIdForClinic(item_id, actor.clinica_id);
      if (!item) throw itemNotFound();
    }

    const rows = await inventoryMovementDao.listForClinic(actor.clinica_id, {
      item_id,
      movement_type,
      date_from,
      date_to,
      limit,
      offset,
    });
    return { movements: rows.map(toPublicMovement) };
  },

  // POST /inventory/items/:id/movements — dono_clinica + secretaria.
  //
  // CRITICAL invariants this method enforces atomically:
  //   1. SELECT FOR UPDATE the inventory_items row so two concurrent exits
  //      cannot race past the quantity check.
  //   2. Refuse movement on an inactive item (preserve clean historical state).
  //   3. Enforce sign-per-type rules.
  //   4. Compute new_quantity = current_quantity + quantity_delta.
  //   5. If new_quantity < 0 → 409 inventory_quantity_insufficient (DB CHECK
  //      would also reject; we surface it cleanly first).
  //   6. If new_quantity > QUANTITY_MAX → 400 (overflow guard).
  //   7. UPDATE item.current_quantity + INSERT movement in the same trx.
  //   8. Audit metadata-only (item_id, movement_type, quantity_delta;
  //      recurso_id = movement.id). reason/notes/name never enter audit_logs.
  async createMovement(
    actor: InventoryActor,
    id_param: string,
    body: {
      movement_type?: unknown;
      quantity_delta?: unknown;
      reason?: unknown;
    },
    ctx: AuthContext,
  ): Promise<{ item: PublicInventoryItem; movement: PublicInventoryMovement }> {
    ensureOperator(actor);
    const item_id = parseUuid(id_param, 'id');
    const movement_type = parseMovementType(body.movement_type);
    const quantity_delta = parseQuantityDelta(body.quantity_delta);
    const reason = parseOptionalReason(body.reason);

    // Sign rules per type — defense-in-depth before opening a transaction.
    if (movement_type === 'entry' && quantity_delta <= 0) {
      throw invalid('Para entry, quantity_delta deve ser positivo.', 'inventory_movement_sign_invalid');
    }
    if ((movement_type === 'exit' || movement_type === 'loss') && quantity_delta >= 0) {
      throw invalid(
        `Para ${movement_type}, quantity_delta deve ser negativo.`,
        'inventory_movement_sign_invalid',
      );
    }
    // adjustment may be positive or negative — already covered by != 0 above.

    return db.transaction(async (trx) => {
      // Lock the item row. Any concurrent createMovement for the same item
      // will block here until this transaction commits/rolls back.
      const locked = await inventoryItemDao.findByIdForUpdate(item_id, actor.clinica_id, trx);
      if (!locked) throw itemNotFound();
      if (!locked.active) throw itemInactive();

      const new_quantity = locked.current_quantity + quantity_delta;
      if (new_quantity < 0) {
        throw quantityInsufficient();
      }
      if (new_quantity > QUANTITY_MAX) {
        throw invalid(
          `A movimentação levaria current_quantity acima do limite (${QUANTITY_MAX}).`,
          'inventory_quantity_overflow',
        );
      }

      const updatedItem = await inventoryItemDao.setQuantity(
        item_id,
        actor.clinica_id,
        new_quantity,
        trx,
      );
      if (!updatedItem) {
        // The lock above guarantees the row exists; a missing return here
        // means a concurrent DELETE — impossible by current invariants
        // (no physical delete). Roll back and surface 404.
        throw itemNotFound();
      }

      const movement = await inventoryMovementDao.create(
        {
          clinica_id: actor.clinica_id,
          item_id,
          movement_type,
          quantity_delta,
          reason,
          created_by_user_id: actor.usuario_id,
        },
        trx,
      );

      // Audit INSIDE the transaction so a rollback erases the audit too —
      // never leave inflated evidence behind. Metadata-only: the row id only.
      // reason/notes/name/location/category do NOT appear here.
      try {
        await auditLogDao.create(
          {
            acao: 'inventory.movement.create.success',
            usuario_id: actor.usuario_id,
            clinica_id: actor.clinica_id,
            recurso: 'inventory_movement',
            recurso_id: movement.id,
            ip: ctx.ip,
            user_agent: ctx.user_agent,
            request_id: ctx.request_id,
          },
          trx,
        );
      } catch (err) {
        // Stricter than read-side audits: audit failure aborts the movement
        // so we never have a quantity change without its evidence.
        logger.error(
          { err, acao: 'inventory.movement.create.success', audit_write_failed: true },
          'audit log write failed',
        );
        throw err;
      }

      return {
        item: toPublicItem(updatedItem),
        movement: toPublicMovement(movement),
      };
    });
  },
};
