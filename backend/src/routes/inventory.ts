import { Router } from 'express';
import { inventoryController } from '../controllers/inventoryController';
import {
  requireAuth,
  requireClinic,
  requireRole,
} from '../middlewares/requireAuth';
import { patientsRateLimit } from '../middlewares/rateLimit';
import { asyncHandler } from '../utils/asyncHandler';

// Estoque básico v0.1 — Sprint 4.8B (ADR 0017).
//
// ADMINISTRATIVE/OPERATIONAL module — uses requireRole, NOT requireClinicalRole.
//
// Pipeline:
//   1. patientsRateLimit BEFORE auth (mirrors clinic-services / financial GETs).
//   2. requireAuth (Bearer JWT).
//   3. requireClinic (DB-checked; deactivated users / admin_sistema blocked).
//   4. requireRole(['dono_clinica','secretaria']) on EVERY route.
//      - profissional_clinico has papel='secretaria' + clinical grant in
//        user_clinical_roles; route-level requireRole would let them in,
//        so the SERVICE layer downgrades them to 403 via
//        `ensureOperator` / `ensureAdmin` (see inventoryService.ts).
//      - For item CRUD specifically, the service enforces `ensureAdmin`
//        (dono_clinica only). The route stays open to ['dono_clinica',
//        'secretaria'] to keep the pipeline uniform; the 403 surface is
//        produced by the service so the test matrix matches insurance/
//        clinic-services patterns.
//
// Smoke matrix (ADR 0017 §4):
//   - smoke.owner       (papel=dono_clinica)                 → full CRUD + movements
//   - smoke.secretaria  (papel=secretaria)                   → read + movements
//   - smoke.gestor      (papel=secretaria + gestor_clinica)  → read + movements
//   - smoke.profissional(papel=secretaria + profissional_*)  → 403 (service downgrade)
//   - smoke.admin       (papel=admin_sistema)                → 403 no_clinic_context
const inventoryAllowlist = ['dono_clinica', 'secretaria'] as const;

export const inventoryRouter = Router();

// ---- /inventory/movements — list across all items (visão geral recente).
// Defined BEFORE /inventory/items routes so Express does not absorb
// "movements" as part of a different path.
inventoryRouter.get(
  '/inventory/movements',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(inventoryAllowlist),
  asyncHandler(inventoryController.listMovements),
);

// ---- /inventory/items — list with filters (active, low_stock, query, category).
inventoryRouter.get(
  '/inventory/items',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(inventoryAllowlist),
  asyncHandler(inventoryController.listItems),
);

// POST /inventory/items — owner only (service-level ensureAdmin).
inventoryRouter.post(
  '/inventory/items',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(inventoryAllowlist),
  asyncHandler(inventoryController.createItem),
);

// ---- Sub-paths of /inventory/items/:id MUST be declared before the bare
// GET/PATCH on :id so Express never matches "movements" / "status" as an :id.

// GET /inventory/items/:id/movements — history for an item.
inventoryRouter.get(
  '/inventory/items/:id/movements',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(inventoryAllowlist),
  asyncHandler(inventoryController.listMovementsForItem),
);

// POST /inventory/items/:id/movements — register movement.
inventoryRouter.post(
  '/inventory/items/:id/movements',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(inventoryAllowlist),
  asyncHandler(inventoryController.createMovement),
);

// PATCH /inventory/items/:id/status — owner only (service-level ensureAdmin).
inventoryRouter.patch(
  '/inventory/items/:id/status',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(inventoryAllowlist),
  asyncHandler(inventoryController.updateItemStatus),
);

// GET /inventory/items/:id — detail.
inventoryRouter.get(
  '/inventory/items/:id',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(inventoryAllowlist),
  asyncHandler(inventoryController.detailItem),
);

// PATCH /inventory/items/:id — owner only (service-level ensureAdmin).
inventoryRouter.patch(
  '/inventory/items/:id',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(inventoryAllowlist),
  asyncHandler(inventoryController.updateItem),
);
