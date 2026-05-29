// Integration test (DB): multi-tenant isolation on the service catalog.
// Run: `pnpm --filter backend test:integration`.
//
// Two synthetic clinics A and B. A service created in B must be invisible and
// immutable to clinic A's owner: reading it as A yields a generic
// service_not_found (anti-enumeration), and an update attempt as A must NOT
// mutate B's row. This guards the clinica_id scoping in clinicServiceService/Dao.

import { test, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { db, newScope, registerTestClinic, cleanup, makeCtx } from './helpers';
import { clinicServiceService } from '../../services/clinicServiceService';
import { HttpError } from '../../middlewares/errorHandler';

const scope = newScope();

after(async () => {
  await cleanup(scope);
  await db.destroy();
});

describe('Tenant isolation: clinic A cannot read or edit clinic B services', () => {
  test('cross-tenant findById and update yield service_not_found; B is unchanged', async () => {
    const a = await registerTestClinic(scope, 'ten-A');
    const b = await registerTestClinic(scope, 'ten-B');

    const actorA = { clinica_id: a.clinic.id, usuario_id: a.user.id };
    const actorB = { clinica_id: b.clinic.id, usuario_id: b.user.id };

    // Service lives in clinic B.
    const created = await clinicServiceService.create(
      actorB,
      { name: 'TEN ITEST Service B', duration_minutes: 30, price_cents: 5000 },
      makeCtx(),
    );
    const serviceId = created.service.id;

    // A reads B's service → generic 404 service_not_found.
    await assert.rejects(
      () => clinicServiceService.findById(actorA, serviceId),
      (err: unknown) => {
        assert.ok(err instanceof HttpError);
        assert.equal((err as HttpError).status, 404);
        assert.equal((err as HttpError).code, 'service_not_found');
        return true;
      },
    );

    // A tries to edit B's service → also 404; row must stay intact.
    await assert.rejects(
      () => clinicServiceService.update(actorA, serviceId, { price_cents: 999 }, makeCtx()),
      (err: unknown) => {
        assert.ok(err instanceof HttpError);
        assert.equal((err as HttpError).status, 404);
        return true;
      },
    );

    const rowAfter = await db('clinic_services').where({ id: serviceId }).first();
    assert.equal(rowAfter.price_cents, 5000, "clinic B's service must be unchanged");
    assert.equal(rowAfter.clinica_id, b.clinic.id);

    // Sanity: B can read its own service.
    const readByB = await clinicServiceService.findById(actorB, serviceId);
    assert.equal(readByB.service.id, serviceId);
  });
});
