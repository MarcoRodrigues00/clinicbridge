// Integration tests (DB): clinic governance invariants (ADR 0019).
// Run: `pnpm --filter backend test:integration`.
//
// Covers:
//   1) GOV-NEW-1: a newly REGISTERED clinic is born with exactly one active
//      titular; the governance list shows it; the titular can promote a member.
//   2) Governance audit is metadata-only: the promote audit row references the
//      governance ROW id (never the promoted member's user_id), and audit_logs
//      has no raw-payload column at all (structural guarantee).

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  db,
  newScope,
  registerTestClinic,
  createTestMember,
  cleanup,
  makeCtx,
} from './helpers';
import { clinicGovernanceService } from '../../services/clinicGovernanceService';

const scope = newScope();

after(async () => {
  await cleanup(scope);
  await db.destroy();
});

describe('GOV-NEW-1: register() creates an active titular', () => {
  test('new clinic has exactly one active titular row and lists it', async () => {
    const { user, clinic } = await registerTestClinic(scope, 'gov-owner');

    assert.equal(user.papel, 'dono_clinica');
    assert.ok(clinic.id);

    // Direct DB invariant: exactly one active titular for this clinic.
    const titulars = await db('clinic_governance_members')
      .where({ clinica_id: clinic.id, status: 'active', governance_role: 'titular' })
      .select('user_id');
    assert.equal(titulars.length, 1);
    assert.equal(titulars[0].user_id, user.id);

    // Service path used by GET /clinic-governance.
    const list = await clinicGovernanceService.listForClinic(
      { clinica_id: clinic.id, usuario_id: user.id },
      makeCtx(),
    );
    assert.equal(list.members.length, 1);
    assert.equal(list.members[0].governance_role, 'titular');
    assert.equal(list.members[0].user_id, user.id);
  });

  test('titular can promote a same-clinic member to administrador', async () => {
    const { user, clinic } = await registerTestClinic(scope, 'gov-owner2');
    const member = await createTestMember(scope, clinic.id, 'gov-member');

    const promoted = await clinicGovernanceService.promoteAdministrator(
      { clinica_id: clinic.id, usuario_id: user.id },
      { user_id: member.id },
      makeCtx(),
    );
    assert.equal(promoted.governance_role, 'administrador');
    assert.equal(promoted.user_id, member.id);

    const list = await clinicGovernanceService.listForClinic(
      { clinica_id: clinic.id, usuario_id: user.id },
      makeCtx(),
    );
    const roles = list.members.map((m) => m.governance_role).sort();
    assert.deepEqual(roles, ['administrador', 'titular']);
  });
});

describe('Governance audit is metadata-only (no PII payload)', () => {
  test('promote audit references the governance row id, never the member user_id', async () => {
    const { user, clinic } = await registerTestClinic(scope, 'gov-owner3');
    const member = await createTestMember(scope, clinic.id, 'gov-member3');

    await clinicGovernanceService.promoteAdministrator(
      { clinica_id: clinic.id, usuario_id: user.id },
      { user_id: member.id },
      makeCtx(),
    );

    // The active administrador row for the promoted member.
    const govRow = await db('clinic_governance_members')
      .where({ clinica_id: clinic.id, user_id: member.id, status: 'active' })
      .first('id');
    assert.ok(govRow?.id);

    const audit = await db('audit_logs')
      .where({ clinica_id: clinic.id, acao: 'clinic.governance.admin.granted' })
      .orderBy('criado_em', 'desc')
      .first();

    assert.ok(audit, 'expected a clinic.governance.admin.granted audit row');
    assert.equal(audit.recurso, 'clinic_governance_member');
    // recurso_id is the governance ROW id — NOT the promoted member's user_id.
    assert.equal(audit.recurso_id, govRow.id);
    assert.notEqual(audit.recurso_id, member.id);
    // actor is the titular, not the promoted member.
    assert.equal(audit.usuario_id, user.id);
  });

  test('audit_logs has no raw-payload/metadata column (structural)', async () => {
    const cols: { column_name: string }[] = await db('information_schema.columns')
      .where({ table_name: 'audit_logs' })
      .select('column_name');
    const names = cols.map((c) => c.column_name);
    // The only columns are metadata fields — no JSON payload to leak PII into.
    for (const forbidden of ['metadata', 'entidade_tipo', 'payload', 'body', 'detalhes']) {
      assert.ok(!names.includes(forbidden), `audit_logs must not have a '${forbidden}' column`);
    }
    assert.ok(names.includes('acao') && names.includes('recurso') && names.includes('recurso_id'));
  });
});
