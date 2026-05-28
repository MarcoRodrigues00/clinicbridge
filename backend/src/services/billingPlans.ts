import type {
  ClinicEntitlementRow,
  EntitlementSource,
  PlanCode,
} from '../types/db';

// Plan catalog + entitlement computation — Sprint 5.1B (ADR 0018 §4, §5.2).
//
// PURE module: no DB, no I/O. `computeEntitlements` is a pure function of
// (plan, overrides) so it is trivially testable and is the SINGLE source of
// truth for "what does this tenant's plan include".
//
// THREE ORTHOGONAL LAYERS (ADR 0018 §3): role (authz) × plan (what was bought)
// × entitlement (what the tenant may do). This file owns ONLY the plan→
// entitlement mapping. Roles are untouched. Subscription STATUS governs the
// soft-lock (billingStateMachine.ts), NOT module membership — a suspended
// clinic still "has" its plan's modules; it just cannot create new records.
//
// CLINICAL GATE INVARIANT (ADR 0018 §2.10): a plan may RESTRICT clinical
// modules but NEVER liberate them. `module.clinical_records` /
// `module.clinical_documents` here only express the COMMERCIAL dimension; the
// real clinical access gate (`requireClinicalRole`, ADR 0009/0010/0011) is
// independent and unchanged. Nothing in 5.1B enforces these entitlements on a
// route, so the plan cannot bypass the clinical gate.
//
// Keys/limits are the EXACT keys for v0.1 (ADR 0018 §4 + scope §3 explicitly
// defer the final keys to this sprint). Limits are product-tunable defaults.

export const MODULE_KEYS = [
  'module.patients',
  'module.schedule',
  'module.financial',
  'module.reports',
  'module.services',
  'module.insurance',
  'module.inventory',
  'module.clinical_records',
  'module.clinical_documents',
] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export const LIMIT_KEYS = [
  'limit.users',
  'limit.professionals',
  'limit.imports_per_month',
] as const;
export type LimitKey = (typeof LIMIT_KEYS)[number];

export type FeatureKey = ModuleKey | LimitKey;

export const PLAN_CODES: readonly PlanCode[] = [
  'essential',
  'professional',
  'assisted_pilot',
];

export interface PlanDefinition {
  // null limit = unlimited / not-applicable.
  modules: Record<ModuleKey, boolean>;
  limits: Record<LimitKey, number | null>;
}

// v0.1 plan catalog. Prices are a future commercial decision (NOT modeled here).
// Numbers are tunable product defaults — changing them needs no migration.
export const PLAN_CATALOG: Record<PlanCode, PlanDefinition> = {
  essential: {
    modules: {
      'module.patients': true,
      'module.schedule': true,
      'module.financial': true,
      'module.reports': true,
      'module.services': true,
      'module.insurance': false,
      'module.inventory': false,
      // Clinical modules are NOT sold commercially in the entry plan. Even if
      // they were `true`, the clinical gate (requireClinicalRole) would still
      // be the real authority — the plan only RESTRICTS here (ADR 0018 §2.10).
      'module.clinical_records': false,
      'module.clinical_documents': false,
    },
    limits: {
      'limit.users': 3,
      'limit.professionals': 2,
      'limit.imports_per_month': 5,
    },
  },
  professional: {
    modules: {
      'module.patients': true,
      'module.schedule': true,
      'module.financial': true,
      'module.reports': true,
      'module.services': true,
      'module.insurance': true,
      'module.inventory': true,
      'module.clinical_records': true,
      'module.clinical_documents': true,
    },
    limits: {
      'limit.users': 15,
      'limit.professionals': 15,
      'limit.imports_per_month': 50,
    },
  },
  // Assisted pilot: entitlements equivalent to Professional; exact limits are
  // "conforme venda" (ADR 0018 §4.3) and can be tightened/loosened per tenant
  // via clinic_entitlements overrides.
  assisted_pilot: {
    modules: {
      'module.patients': true,
      'module.schedule': true,
      'module.financial': true,
      'module.reports': true,
      'module.services': true,
      'module.insurance': true,
      'module.inventory': true,
      'module.clinical_records': true,
      'module.clinical_documents': true,
    },
    limits: {
      'limit.users': 25,
      'limit.professionals': 25,
      'limit.imports_per_month': 100,
    },
  },
};

export function isPlanCode(value: unknown): value is PlanCode {
  return typeof value === 'string' && (PLAN_CODES as readonly string[]).includes(value);
}

// One effective entitlement after merging plan defaults with tenant overrides.
export interface EffectiveEntitlement {
  feature_key: FeatureKey;
  enabled: boolean;
  // Numeric for limit.* keys; null for module.* keys or unlimited limits.
  limit_value: number | null;
  source: EntitlementSource;
}

export interface ComputedEntitlements {
  modules: Record<ModuleKey, boolean>;
  limits: Record<LimitKey, number | null>;
  // Flat list (modules + limits) with provenance — convenient for the API.
  features: EffectiveEntitlement[];
}

function isModuleKey(key: string): key is ModuleKey {
  return (MODULE_KEYS as readonly string[]).includes(key);
}
function isLimitKey(key: string): key is LimitKey {
  return (LIMIT_KEYS as readonly string[]).includes(key);
}

// Compute the effective entitlements for a plan, applying per-tenant overrides.
// Pure: (plan, overrides) -> entitlements. Overrides for a known feature_key
// replace the plan default; unknown override keys are ignored (defensive — the
// catalog is the allowlist of meaningful keys).
export function computeEntitlements(
  plan_code: PlanCode,
  overrides: ClinicEntitlementRow[] = [],
): ComputedEntitlements {
  const def = PLAN_CATALOG[plan_code];
  const modules: Record<ModuleKey, boolean> = { ...def.modules };
  const limits: Record<LimitKey, number | null> = { ...def.limits };

  const overrideByKey = new Map<string, ClinicEntitlementRow>();
  for (const ov of overrides) overrideByKey.set(ov.feature_key, ov);

  for (const ov of overrides) {
    if (isModuleKey(ov.feature_key)) {
      modules[ov.feature_key] = ov.enabled;
    } else if (isLimitKey(ov.feature_key)) {
      limits[ov.feature_key] = ov.enabled ? ov.limit_value : null;
    }
    // Unknown keys are ignored on purpose.
  }

  const features: EffectiveEntitlement[] = [];
  for (const key of MODULE_KEYS) {
    const ov = overrideByKey.get(key);
    features.push({
      feature_key: key,
      enabled: modules[key],
      limit_value: null,
      source: ov ? ov.source : 'plan',
    });
  }
  for (const key of LIMIT_KEYS) {
    const ov = overrideByKey.get(key);
    features.push({
      feature_key: key,
      enabled: limits[key] !== 0, // a 0 limit reads as "disabled"
      limit_value: limits[key],
      source: ov ? ov.source : 'plan',
    });
  }

  return { modules, limits, features };
}
