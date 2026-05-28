import type { Knex } from 'knex';
import { db } from '../config/db';
import type {
  BillingEventRow,
  BillingEventStatus,
  BillingProviderName,
} from '../types/db';

// billing_events DAO — Sprint 5.1B (ADR 0018 §5.5).
//
// Idempotency ledger. `recordIfNew` inserts ON CONFLICT DO NOTHING on the
// UNIQUE(provider, external_event_id) key: the SAME provider event is recorded
// at most once, so reprocessing a duplicate webhook is a no-op (returns
// undefined). NEVER stores the raw payload — only `payload_hash` + metadata.
// There is intentionally NO update of an event's identity and NO delete.

export interface RecordEventInput {
  provider: BillingProviderName;
  external_event_id: string;
  event_type: string;
  // Resolved via internal provider maps — NEVER from the payload.
  clinica_id: string | null;
  payload_hash: string | null;
}

export const billingEventDao = {
  // Insert a new event. Returns the row when it is genuinely new; returns
  // undefined when the (provider, external_event_id) already exists (duplicate
  // delivery) — the caller treats undefined as "already processed, no-op".
  async recordIfNew(
    input: RecordEventInput,
    conn: Knex = db,
  ): Promise<BillingEventRow | undefined> {
    const [row] = await conn<BillingEventRow>('billing_events')
      .insert({
        provider: input.provider,
        external_event_id: input.external_event_id,
        event_type: input.event_type,
        clinica_id: input.clinica_id,
        payload_hash: input.payload_hash,
        status: 'received',
      })
      .onConflict(['provider', 'external_event_id'])
      .ignore()
      .returning('*');
    return row;
  },

  async findByExternalEventId(
    provider: BillingProviderName,
    external_event_id: string,
    conn: Knex = db,
  ): Promise<BillingEventRow | undefined> {
    return conn<BillingEventRow>('billing_events')
      .where({ provider, external_event_id })
      .first();
  },

  // Mark a recorded event's processing outcome (received → processed/ignored/
  // failed). Keyed by id; the event identity is immutable.
  async markStatus(
    id: string,
    status: BillingEventStatus,
    conn: Knex = db,
  ): Promise<void> {
    await conn<BillingEventRow>('billing_events')
      .where({ id })
      .update({
        status,
        processed_at: status === 'received' ? null : conn.fn.now(),
      });
  },
};
