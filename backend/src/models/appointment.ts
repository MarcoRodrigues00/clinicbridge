import type { AppointmentRow } from '../types/db';

export type { AppointmentRow };

// Administrative appointment statuses (ADR 0006). Cancellation is a status — there
// is NO physical delete in the MVP.
export const APPOINTMENT_STATUSES = [
  'scheduled',
  'confirmed',
  'cancelled',
  'rescheduled',
  'no_show',
  'completed',
] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

// Statuses a client may set via PATCH /appointments/:id/status. `rescheduled` is
// reached only through the dedicated reschedule endpoint (it changes the times).
export const STATUS_UPDATE_ALLOWED: readonly AppointmentStatus[] = [
  'scheduled',
  'confirmed',
  'cancelled',
  'no_show',
  'completed',
];

export function isAppointmentStatus(value: unknown): value is AppointmentStatus {
  return (
    typeof value === 'string' &&
    (APPOINTMENT_STATUSES as readonly string[]).includes(value)
  );
}

// Client-facing appointment shape (Sprint 3.14). Administrative only — NO clinical
// fields. `administrative_notes` is short/optional and administrative; it is never
// written to logs/audit, but may be shown in the agenda detail/listing.
export interface PublicAppointment {
  id: string;
  patient_id: string;
  professional_id: string | null;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  administrative_notes: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  criado_em: string;
  atualizado_em: string;
}

export function toPublicAppointment(row: AppointmentRow): PublicAppointment {
  return {
    id: row.id,
    patient_id: row.patient_id,
    professional_id: row.professional_id,
    starts_at: new Date(row.starts_at).toISOString(),
    ends_at: new Date(row.ends_at).toISOString(),
    status: row.status as AppointmentStatus,
    administrative_notes: row.administrative_notes,
    created_by_user_id: row.created_by_user_id,
    updated_by_user_id: row.updated_by_user_id,
    criado_em: new Date(row.created_at).toISOString(),
    atualizado_em: new Date(row.updated_at).toISOString(),
  };
}
