import type { PublicPatient } from './patient';

// Why a patient cluster is suspected to be the same person. Ordered by strength:
// cpf is the only "high" signal; everything else is "medium".
export type DuplicateReason =
  | 'cpf_match'
  | 'email_match'
  | 'telefone_match'
  | 'name_dob_match'
  | 'name_telefone_match'
  | 'name_email_match';

export type DuplicateConfidence = 'high' | 'medium';

// A cluster of patient records (same clinic) that look like the same person.
// This is INFORMATIONAL only: nothing is merged, edited or deleted.
export interface DuplicateGroup {
  // Stable, non-reversible key for the cluster (never contains a raw CPF/email/
  // phone). Built from the member ids, prefixed by the strongest reason.
  group_key: string;
  // Strongest reason present in the cluster.
  reason: DuplicateReason;
  // Every reason that links members of this cluster (strongest first).
  reasons: DuplicateReason[];
  confidence: DuplicateConfidence;
  count: number;
  patients: PublicPatient[];
}

export interface DuplicateScanResult {
  groups: DuplicateGroup[];
  summary: {
    groups_count: number;
    patients_in_duplicate_groups: number;
    // true when the scan hit the row cap and may have missed later records.
    scan_limited: boolean;
  };
}
