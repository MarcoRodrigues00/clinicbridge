// Integration test (DB): financial charge compare-and-set (CAS) on markPaid.
// Run: `pnpm --filter backend test:integration`.
//
// markPaid is a CAS UPDATE whose WHERE includes status='pending'. The first
// mark transitions pending → paid and returns the row; a second (repeated /
// concurrent) mark misses the CAS and returns undefined, so a charge can NEVER
// be paid twice or have its paid_at/paid_by overwritten. This guards the
// double-payment invariant (ADR 0012) without any HTTP layer.

import { test, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  db,
  newScope,
  registerTestClinic,
  createTestPatient,
  cleanup,
} from './helpers';
import { financialChargeDao } from '../../dao/financialChargeDao';

const scope = newScope();

after(async () => {
  await cleanup(scope);
  await db.destroy();
});

describe('Financial CAS: a charge cannot be marked paid twice', () => {
  test('first markPaid succeeds; a second markPaid misses the CAS (undefined)', async () => {
    const owner = await registerTestClinic(scope, 'fin-owner');
    const patientId = await createTestPatient(owner.clinic.id, 'fin-patient');

    const charge = await financialChargeDao.create({
      clinica_id: owner.clinic.id,
      patient_id: patientId,
      appointment_id: null,
      service_id: null,
      created_by_user_id: owner.user.id,
      description: 'FIN ITEST charge',
      amount_cents: 12345,
      due_date: null,
      notes: null,
      payer_type: null,
      insurance_provider_id: null,
      patient_insurance_id: null,
      copay_amount_cents: null,
      insurance_amount_cents: null,
    });
    assert.equal(charge.status, 'pending');

    const first = await financialChargeDao.markPaid(
      charge.id,
      owner.clinic.id,
      owner.user.id,
      'pix',
      new Date(),
    );
    assert.ok(first, 'first markPaid should return the updated row');
    assert.equal(first!.status, 'paid');
    const firstPaidAt = first!.paid_at;

    // Second attempt — already paid, so the CAS (status='pending') misses.
    const second = await financialChargeDao.markPaid(
      charge.id,
      owner.clinic.id,
      owner.user.id,
      'cash',
      new Date(),
    );
    assert.equal(second, undefined, 'second markPaid must miss the CAS');

    // The stored row is untouched by the second attempt (still pix, same paid_at).
    const stored = await db('financial_charges').where({ id: charge.id }).first();
    assert.equal(stored.status, 'paid');
    assert.equal(stored.payment_method, 'pix');
    assert.equal(new Date(stored.paid_at).getTime(), new Date(firstPaidAt!).getTime());
  });

  test('cross-tenant markPaid cannot pay another clinic charge', async () => {
    const a = await registerTestClinic(scope, 'fin-A');
    const b = await registerTestClinic(scope, 'fin-B');
    const patientB = await createTestPatient(b.clinic.id, 'fin-patient-B');

    const chargeB = await financialChargeDao.create({
      clinica_id: b.clinic.id,
      patient_id: patientB,
      appointment_id: null,
      service_id: null,
      created_by_user_id: b.user.id,
      description: 'FIN ITEST cross-tenant',
      amount_cents: 5000,
      due_date: null,
      notes: null,
      payer_type: null,
      insurance_provider_id: null,
      patient_insurance_id: null,
      copay_amount_cents: null,
      insurance_amount_cents: null,
    });

    // Clinic A tries to pay clinic B's charge → CAS miss (clinica_id mismatch).
    const result = await financialChargeDao.markPaid(
      chargeB.id,
      a.clinic.id,
      a.user.id,
      'pix',
      new Date(),
    );
    assert.equal(result, undefined);

    const stored = await db('financial_charges').where({ id: chargeB.id }).first();
    assert.equal(stored.status, 'pending', "B's charge must remain pending");
  });
});
