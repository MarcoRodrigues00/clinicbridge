import { Router } from 'express';
import {
  insurancePlanController,
  insuranceProviderController,
  patientInsuranceController,
  serviceInsurancePriceController,
} from '../controllers/insuranceController';
import {
  CLINIC_ADMIN_ROLES,
  requireAuth,
  requireClinic,
  requireRole,
} from '../middlewares/requireAuth';
import { patientsRateLimit } from '../middlewares/rateLimit';
import { asyncHandler } from '../utils/asyncHandler';

// Convênios v0.1 — Sprint 4.7B (ADR 0016).
//
// ADMINISTRATIVE / COMMERCIAL module — uses requireRole, NOT requireClinicalRole.
//
// Pipeline:
//   1. patientsRateLimit BEFORE auth (mirrors clinic-services routes).
//   2. requireAuth (Bearer JWT).
//   3. requireClinic (DB-checked; deactivated users / admin_sistema blocked).
//   4. requireRole:
//      - READS open to dono_clinica + secretaria.
//      - WRITES on providers/plans/service_prices: CLINIC_ADMIN_ROLES (dono only).
//      - WRITES on patient_insurances: dono_clinica + secretaria (rotina adm).
//
// Smoke matrix (ADR 0016 §4):
//   - smoke.owner                                    → full CRUD on all entities
//   - smoke.secretaria  (papel=secretaria)           → read all + write patient_insurances
//   - smoke.gestor      (papel=secretaria+gestor)    → same as secretaria pura
//   - smoke.profissional(papel=secretaria+profissional) → reads pass middleware
//                                                        (write blocked at route)
//   - smoke.admin       (papel=admin_sistema)        → 403 no_clinic_context

const insuranceReadAllowlist = ['dono_clinica', 'secretaria'] as const;
const patientInsuranceWriteAllowlist = ['dono_clinica', 'secretaria'] as const;

export const insuranceRouter = Router();

// ============================================================================
// /insurance/providers
// ============================================================================

insuranceRouter.get(
  '/insurance/providers',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(insuranceReadAllowlist),
  asyncHandler(insuranceProviderController.list),
);

insuranceRouter.post(
  '/insurance/providers',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(CLINIC_ADMIN_ROLES),
  asyncHandler(insuranceProviderController.create),
);

// /status defined BEFORE /:id so Express does not absorb "status" as :id.
insuranceRouter.patch(
  '/insurance/providers/:id/status',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(CLINIC_ADMIN_ROLES),
  asyncHandler(insuranceProviderController.updateStatus),
);

insuranceRouter.get(
  '/insurance/providers/:id',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(insuranceReadAllowlist),
  asyncHandler(insuranceProviderController.detail),
);

insuranceRouter.patch(
  '/insurance/providers/:id',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(CLINIC_ADMIN_ROLES),
  asyncHandler(insuranceProviderController.update),
);

// ============================================================================
// /insurance/plans
// ============================================================================

insuranceRouter.get(
  '/insurance/plans',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(insuranceReadAllowlist),
  asyncHandler(insurancePlanController.list),
);

insuranceRouter.post(
  '/insurance/plans',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(CLINIC_ADMIN_ROLES),
  asyncHandler(insurancePlanController.create),
);

insuranceRouter.patch(
  '/insurance/plans/:id/status',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(CLINIC_ADMIN_ROLES),
  asyncHandler(insurancePlanController.updateStatus),
);

insuranceRouter.get(
  '/insurance/plans/:id',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(insuranceReadAllowlist),
  asyncHandler(insurancePlanController.detail),
);

insuranceRouter.patch(
  '/insurance/plans/:id',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(CLINIC_ADMIN_ROLES),
  asyncHandler(insurancePlanController.update),
);

// ============================================================================
// /insurance/service-prices
// ============================================================================

insuranceRouter.get(
  '/insurance/service-prices',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(insuranceReadAllowlist),
  asyncHandler(serviceInsurancePriceController.list),
);

insuranceRouter.post(
  '/insurance/service-prices',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(CLINIC_ADMIN_ROLES),
  asyncHandler(serviceInsurancePriceController.create),
);

insuranceRouter.patch(
  '/insurance/service-prices/:id/status',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(CLINIC_ADMIN_ROLES),
  asyncHandler(serviceInsurancePriceController.updateStatus),
);

insuranceRouter.get(
  '/insurance/service-prices/:id',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(insuranceReadAllowlist),
  asyncHandler(serviceInsurancePriceController.detail),
);

insuranceRouter.patch(
  '/insurance/service-prices/:id',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(CLINIC_ADMIN_ROLES),
  asyncHandler(serviceInsurancePriceController.update),
);

// ============================================================================
// /patients/:patient_id/insurances
// ============================================================================

insuranceRouter.get(
  '/patients/:patient_id/insurances',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(insuranceReadAllowlist),
  asyncHandler(patientInsuranceController.list),
);

insuranceRouter.post(
  '/patients/:patient_id/insurances',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(patientInsuranceWriteAllowlist),
  asyncHandler(patientInsuranceController.create),
);

insuranceRouter.patch(
  '/patients/:patient_id/insurances/:id/status',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(patientInsuranceWriteAllowlist),
  asyncHandler(patientInsuranceController.updateStatus),
);

insuranceRouter.get(
  '/patients/:patient_id/insurances/:id',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(insuranceReadAllowlist),
  asyncHandler(patientInsuranceController.detail),
);

insuranceRouter.patch(
  '/patients/:patient_id/insurances/:id',
  patientsRateLimit,
  requireAuth,
  requireClinic,
  requireRole(patientInsuranceWriteAllowlist),
  asyncHandler(patientInsuranceController.update),
);
