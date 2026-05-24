import type { ClinicJoinRequestRow, ClinicJoinRequestStatus } from '../types/db';
import type { MyJoinRequestRow, PendingJoinRequestRow } from '../dao/clinicJoinRequestDao';

export type { ClinicJoinRequestRow, ClinicJoinRequestStatus };

// Requester-facing view of one of their own requests. Includes the clinic name
// (they already hold its invite code) and the status. No applicant PII here —
// it's their own record.
export interface MyJoinRequest {
  id: string;
  clinic_id: string;
  clinic_name: string | null;
  requested_role: string;
  status: ClinicJoinRequestStatus;
  message: string | null;
  created_at: string;
  decided_at: string | null;
}

// Owner-facing view of a pending request: the applicant's name + email so the
// owner can recognize who is asking. Shown only to the clinic owner; never logged.
export interface PendingJoinRequest {
  id: string;
  applicant_name: string;
  applicant_email: string;
  requested_role: string;
  message: string | null;
  created_at: string;
}

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

export function toMyJoinRequest(row: MyJoinRequestRow): MyJoinRequest {
  return {
    id: row.id,
    clinic_id: row.clinic_id,
    clinic_name: row.clinic_name ?? null,
    requested_role: row.requested_role,
    status: row.status,
    message: row.message,
    created_at: iso(row.created_at) ?? '',
    decided_at: iso(row.decided_at),
  };
}

export function toPendingJoinRequest(row: PendingJoinRequestRow): PendingJoinRequest {
  return {
    id: row.id,
    applicant_name: row.applicant_name,
    applicant_email: row.applicant_email,
    requested_role: row.requested_role,
    message: row.message,
    created_at: iso(row.created_at) ?? '',
  };
}
