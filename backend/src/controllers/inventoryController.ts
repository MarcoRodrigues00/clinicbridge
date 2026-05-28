import type { Request, Response } from 'express';
import { HttpError } from '../middlewares/errorHandler';
import { buildInventoryActor, inventoryService } from '../services/inventoryService';
import type { InventoryActor } from '../services/inventoryService';
import { buildAuthContext } from '../utils/authContext';

// Estoque básico v0.1 — Sprint 4.8B (ADR 0017).
//
// requireAuth + requireClinic + requireRole(...) run BEFORE these handlers.
// The service performs additional permission checks:
//   - ensureNotProfissional: rejects users whose user_clinical_roles row holds
//     profissional_clinico (their JWT papel is 'secretaria' so route-level
//     requireRole would let them through).
//   - ensureAdmin: item CRUD requires papel='dono_clinica'.
//   - ensureOperator: movements + reads accept dono_clinica + secretaria.
async function inventoryActor(req: Request): Promise<InventoryActor> {
  if (!req.auth) {
    throw new HttpError(401, 'unauthorized', 'Autenticação necessária.');
  }
  if (!req.auth.clinica_id) {
    throw new HttpError(403, 'no_clinic_context', 'Nenhuma clínica associada ao usuário.');
  }
  return buildInventoryActor({
    clinica_id: req.auth.clinica_id,
    usuario_id: req.auth.sub,
    papel: req.auth.papel,
  });
}

function asObject(body: unknown): Record<string, unknown> {
  return typeof body === 'object' && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

export const inventoryController = {
  // GET /inventory/items
  async listItems(req: Request, res: Response): Promise<void> {
    const actor = await inventoryActor(req);
    const result = await inventoryService.listItems(actor, {
      active: req.query.active,
      low_stock: req.query.low_stock,
      query: req.query.query,
      category: req.query.category,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.status(200).json(result);
  },

  // GET /inventory/items/:id
  async detailItem(req: Request, res: Response): Promise<void> {
    const actor = await inventoryActor(req);
    const result = await inventoryService.findItem(actor, req.params.id);
    res.status(200).json(result);
  },

  // POST /inventory/items
  async createItem(req: Request, res: Response): Promise<void> {
    const actor = await inventoryActor(req);
    const ctx = buildAuthContext(req);
    const body = asObject(req.body);
    const result = await inventoryService.createItem(
      actor,
      {
        name: body.name,
        category: body.category,
        unit: body.unit,
        minimum_quantity: body.minimum_quantity,
        location: body.location,
        notes: body.notes,
      },
      ctx,
    );
    res.status(201).json(result);
  },

  // PATCH /inventory/items/:id
  async updateItem(req: Request, res: Response): Promise<void> {
    const actor = await inventoryActor(req);
    const ctx = buildAuthContext(req);
    const body = asObject(req.body);
    const result = await inventoryService.updateItem(
      actor,
      req.params.id,
      {
        name: body.name,
        category: body.category,
        unit: body.unit,
        minimum_quantity: body.minimum_quantity,
        location: body.location,
        notes: body.notes,
      },
      ctx,
    );
    res.status(200).json(result);
  },

  // PATCH /inventory/items/:id/status
  async updateItemStatus(req: Request, res: Response): Promise<void> {
    const actor = await inventoryActor(req);
    const ctx = buildAuthContext(req);
    const body = asObject(req.body);
    const result = await inventoryService.setItemStatus(
      actor,
      req.params.id,
      { active: body.active },
      ctx,
    );
    res.status(200).json(result);
  },

  // GET /inventory/items/:id/movements
  async listMovementsForItem(req: Request, res: Response): Promise<void> {
    const actor = await inventoryActor(req);
    const result = await inventoryService.listMovementsForItem(actor, req.params.id, {
      movement_type: req.query.movement_type,
      date_from: req.query.date_from,
      date_to: req.query.date_to,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.status(200).json(result);
  },

  // POST /inventory/items/:id/movements
  async createMovement(req: Request, res: Response): Promise<void> {
    const actor = await inventoryActor(req);
    const ctx = buildAuthContext(req);
    const body = asObject(req.body);
    const result = await inventoryService.createMovement(
      actor,
      req.params.id,
      {
        movement_type: body.movement_type,
        quantity_delta: body.quantity_delta,
        reason: body.reason,
      },
      ctx,
    );
    res.status(201).json(result);
  },

  // GET /inventory/movements
  async listMovements(req: Request, res: Response): Promise<void> {
    const actor = await inventoryActor(req);
    const result = await inventoryService.listMovements(actor, {
      item_id: req.query.item_id,
      movement_type: req.query.movement_type,
      date_from: req.query.date_from,
      date_to: req.query.date_to,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.status(200).json(result);
  },
};
