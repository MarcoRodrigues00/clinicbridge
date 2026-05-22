import { createHash } from 'node:crypto';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { auditLogDao } from '../dao/auditLogDao';
import { patientDao } from '../dao/patientDao';
import { toPublicPatient, type PatientRow } from '../models/patient';
import type {
  DuplicateConfidence,
  DuplicateGroup,
  DuplicateReason,
  DuplicateScanResult,
} from '../models/patientDuplicate';
import type { AuthContext } from './authService';

export interface PatientDuplicateActor {
  clinica_id: string;
  usuario_id: string;
}

// Reasons ordered strongest → weakest. Used to pick the primary reason and to
// sort the reasons list inside a group. cpf is the only "high" signal.
const REASON_ORDER: DuplicateReason[] = [
  'cpf_match',
  'email_match',
  'telefone_match',
  'name_dob_match',
  'name_telefone_match',
  'name_email_match',
];

function digits(value: string | null): string | null {
  if (!value) return null;
  const d = value.replace(/\D/g, '');
  return d.length > 0 ? d : null;
}

function cpfKey(value: string | null): string | null {
  const d = digits(value);
  return d && d.length === 11 ? d : null;
}

function telefoneKey(value: string | null): string | null {
  const d = digits(value);
  // Require a plausible phone length so we don't cluster on junk fragments.
  return d && d.length >= 8 ? d : null;
}

function emailKey(value: string | null): string | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  return v.length > 0 ? v : null;
}

// lowercase, accent-stripped, whitespace-collapsed name for fuzzy-ish matching.
function nameKey(value: string | null): string | null {
  if (!value) return null;
  const v = value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
  return v.length > 0 ? v : null;
}

function dobKey(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value));
  return match ? match[1] : null;
}

// Minimal union-find (disjoint set) over patient indices.
class UnionFind {
  private parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(x: number): number {
    let root = x;
    while (this.parent[root] !== root) root = this.parent[root];
    while (this.parent[x] !== root) {
      const next = this.parent[x];
      this.parent[x] = root;
      x = next;
    }
    return root;
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[rb] = ra;
  }
}

// Groups patient indices by a normalized key. Returns only keys shared by 2+
// records. The key value itself never leaves this module.
function buildKeyGroups(
  rows: PatientRow[],
  keyOf: (row: PatientRow) => string | null,
): Map<string, number[]> {
  const map = new Map<string, number[]>();
  rows.forEach((row, i) => {
    const k = keyOf(row);
    if (k === null) return;
    const arr = map.get(k);
    if (arr) arr.push(i);
    else map.set(k, [i]);
  });
  for (const [k, idxs] of map) {
    if (idxs.length < 2) map.delete(k);
  }
  return map;
}

// Each criterion: a reason + the key extractor (composite keys for name+X).
const CRITERIA: Array<{ reason: DuplicateReason; keyOf: (row: PatientRow) => string | null }> = [
  { reason: 'cpf_match', keyOf: (r) => cpfKey(r.cpf) },
  { reason: 'email_match', keyOf: (r) => emailKey(r.email) },
  { reason: 'telefone_match', keyOf: (r) => telefoneKey(r.telefone) },
  {
    reason: 'name_dob_match',
    keyOf: (r) => {
      const n = nameKey(r.nome);
      const d = dobKey(r.data_nascimento);
      return n && d ? `${n}|${d}` : null;
    },
  },
  {
    reason: 'name_telefone_match',
    keyOf: (r) => {
      const n = nameKey(r.nome);
      const t = telefoneKey(r.telefone);
      return n && t ? `${n}|${t}` : null;
    },
  },
  {
    reason: 'name_email_match',
    keyOf: (r) => {
      const n = nameKey(r.nome);
      const e = emailKey(r.email);
      return n && e ? `${n}|${e}` : null;
    },
  },
];

function pickPrimaryReason(reasons: Set<DuplicateReason>): DuplicateReason {
  for (const r of REASON_ORDER) {
    if (reasons.has(r)) return r;
  }
  // Unreachable: a group always has at least one reason.
  return 'name_dob_match';
}

function sortReasons(reasons: Set<DuplicateReason>): DuplicateReason[] {
  return REASON_ORDER.filter((r) => reasons.has(r));
}

// Non-reversible, stable key for a cluster. Derived from the sorted member ids
// so it never contains a raw CPF/email/phone/name.
function groupKey(primary: DuplicateReason, memberIds: string[]): string {
  const hash = createHash('sha256')
    .update([...memberIds].sort().join('|'))
    .digest('hex')
    .slice(0, 12);
  return `${primary}:${hash}`;
}

async function safeAudit(actor: PatientDuplicateActor, ctx: AuthContext): Promise<void> {
  try {
    await auditLogDao.create({
      acao: 'patient.duplicates.list.success',
      usuario_id: actor.usuario_id,
      clinica_id: actor.clinica_id,
      recurso: 'patient',
      recurso_id: null,
      ip: ctx.ip,
      user_agent: ctx.user_agent,
      request_id: ctx.request_id,
    });
  } catch (err) {
    logger.error(
      { err, acao: 'patient.duplicates.list.success', audit_write_failed: true },
      'audit log write failed',
    );
  }
}

export const patientDuplicateService = {
  // Read-only duplicate detection for the actor's clinic. Builds connected
  // components from any matching signal, reports the strongest reason per
  // cluster, and NEVER merges/edits/deletes. CPF is masked in the output.
  async scanForClinic(
    actor: PatientDuplicateActor,
    ctx: AuthContext,
  ): Promise<DuplicateScanResult> {
    const cap = env.DUPLICATES_SCAN_MAX_ROWS;
    // Fetch one extra row to detect whether the cap truncated the scan.
    const fetched = await patientDao.listForDuplicateScan(actor.clinica_id, cap + 1);
    const scanLimited = fetched.length > cap;
    const rows = scanLimited ? fetched.slice(0, cap) : fetched;

    const uf = new UnionFind(rows.length);
    const reasonsByRoot = new Map<number, Set<DuplicateReason>>();

    for (const criterion of CRITERIA) {
      const keyGroups = buildKeyGroups(rows, criterion.keyOf);
      for (const idxs of keyGroups.values()) {
        // Union every record sharing this key.
        for (let i = 1; i < idxs.length; i++) uf.union(idxs[0], idxs[i]);
      }
    }

    // After all unions are settled, attribute each criterion's reason to the
    // (now final) component root of the records it linked.
    for (const criterion of CRITERIA) {
      const keyGroups = buildKeyGroups(rows, criterion.keyOf);
      for (const idxs of keyGroups.values()) {
        const root = uf.find(idxs[0]);
        const set = reasonsByRoot.get(root) ?? new Set<DuplicateReason>();
        set.add(criterion.reason);
        reasonsByRoot.set(root, set);
      }
    }

    // Collect components of size >= 2.
    const componentMembers = new Map<number, number[]>();
    for (let i = 0; i < rows.length; i++) {
      const root = uf.find(i);
      const arr = componentMembers.get(root);
      if (arr) arr.push(i);
      else componentMembers.set(root, [i]);
    }

    const groups: DuplicateGroup[] = [];
    for (const [root, members] of componentMembers) {
      if (members.length < 2) continue;
      const reasonSet = reasonsByRoot.get(root);
      if (!reasonSet || reasonSet.size === 0) continue; // size>=2 with no reason can't happen
      const reasons = sortReasons(reasonSet);
      const primary = pickPrimaryReason(reasonSet);
      const confidence: DuplicateConfidence = reasonSet.has('cpf_match') ? 'high' : 'medium';
      // rows are criado_em ASC; preserve that order within the group.
      const patients = members.map((i) => toPublicPatient(rows[i]));
      const memberIds = patients.map((p) => p.id);
      groups.push({
        group_key: groupKey(primary, memberIds),
        reason: primary,
        reasons,
        confidence,
        count: patients.length,
        patients,
      });
    }

    // Strongest clusters first: high before medium, then by primary-reason
    // strength, then larger clusters, then a stable key tiebreak.
    groups.sort((a, b) => {
      if (a.confidence !== b.confidence) return a.confidence === 'high' ? -1 : 1;
      const ra = REASON_ORDER.indexOf(a.reason);
      const rb = REASON_ORDER.indexOf(b.reason);
      if (ra !== rb) return ra - rb;
      if (a.count !== b.count) return b.count - a.count;
      return a.group_key < b.group_key ? -1 : a.group_key > b.group_key ? 1 : 0;
    });

    const patientsInGroups = groups.reduce((sum, g) => sum + g.count, 0);

    await safeAudit(actor, ctx);

    return {
      groups,
      summary: {
        groups_count: groups.length,
        patients_in_duplicate_groups: patientsInGroups,
        scan_limited: scanLimited,
      },
    };
  },
};
