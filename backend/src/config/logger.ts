import pino from 'pino';
import { env } from './env';

// Pino redact paths (defense in depth — clinical services must STILL never pass
// clinical content to the logger; this is the safety net for an accidental
// `logger.error({err, body})` or future middleware that logs request bodies).
//
// fast-redact path syntax:
//   - 'foo'          — redacts the TOP-LEVEL key `foo`
//   - '*.foo'        — redacts `foo` ONE level deep, under any parent key
//   - 'a.b.c'        — redacts a static nested path exactly 3 levels deep
//
// Coverage layers:
//   1. Top-level: `chief_complaint`, `paciente_id`, …
//   2. One-level wildcard: `*.chief_complaint`, …  (catches `body.<f>`, `note.<f>`)
//   3. Explicit two-level nested: `body.<field>`, `req.body.<field>`,
//      `payload.<field>` (covers the most likely logger call shapes)
//   4. Explicit three-level nested: `body.initial_note.<f>`,
//      `req.body.initial_note.<f>`, `payload.initial_note.<f>`
//      (covers `POST /clinical/encounters` with `initial_note` sub-object)
//
// The primary guarantee is still discipline: services/controllers MUST NOT
// pass clinical body content to the logger. This redact is the safety net.
const redactPaths = [
  // Existing — auth and identity sensitive.
  'req.headers.authorization',
  'req.headers.cookie',
  'password',
  'senha',
  'senha_hash',
  'cpf',
  'token',
  'access_token',
  'refresh_token',

  // Sprint 4.2B-3 — clinical content fields (ADR 0010 §8.4).
  // Sprint 4.3B — extended with `metadata_json` for clinical documents
  // (ADR 0011 §8.4). `body` as a redact path would clash with `req.body` /
  // `payload.body` wrappers used in legitimate non-clinical logs, so we
  // redact `body` ONLY when nested under {req., payload., note., document.}
  // (Layer 3 below) — discipline + explicit nested patterns cover the
  // realistic logger shapes. Top-level `body` (rare and almost always means
  // request body anyway) is also redacted.
  // Layer 1: top-level.
  'chief_complaint',
  'anamnesis',
  'evolution',
  // 'plan' is intentionally broad: any field literally named `plan` is
  // redacted, even outside clinical contexts. Acceptable trade-off — the
  // project has no legitimate top-level `plan` log payloads (clinics use
  // `plano` in Portuguese for billing plan).
  'plan',
  'internal_note',
  'cancel_reason_text',
  'rectification_reason_text',
  // `metadata_json` — clinical-document per-type semi-structured fields
  // (ADR 0011 §8.4). May contain dosage, exams, CID free text. Treated as
  // clinical content for logging purposes.
  'metadata_json',
  // Clinical-document body and title (Sprint 4.3B; ADR 0011 §8.4).
  // - `body`: free-text clinical content. Top-level redact protects
  //   `logger.info({ body: documentRow.body })`. Wildcard `*.body` covers
  //   the same field nested one level down.
  // - `title`: operator-supplied document title. May contain PII (patient
  //   name) or clinical info (diagnosis). Treated as clinical content.
  // No legitimate non-clinical logger payload in this project uses these
  // names at top level; verified by grep across backend/src.
  'body',
  'title',
  // Pseudonymized patient identifier (ADR 0009 §6.2, ADR 0010 §5.3).
  // Personal data under LGPD; lives ONLY in clinical_read_audit.
  // `patient_id` (English/snake_case) is NOT redacted globally because it is
  // widely used in legitimate administrative logs (appointments, scheduling);
  // clinical services must never pass it to the logger by discipline.
  'paciente_id',

  // Layer 2: one-level wildcards — catch `body.<field>`, `note.<field>`, etc.
  '*.chief_complaint',
  '*.anamnesis',
  '*.evolution',
  '*.plan',
  '*.internal_note',
  '*.cancel_reason_text',
  '*.rectification_reason_text',
  '*.metadata_json',
  '*.body',
  '*.title',
  '*.paciente_id',

  // Layer 3: explicit two-level paths for the three most likely logger shapes.
  // `logger.info({ body, ... })`, `logger.error({ req: { body }, ... })`,
  // `logger.debug({ payload, ... })`.
  'body.chief_complaint',
  'body.anamnesis',
  'body.evolution',
  'body.plan',
  'body.internal_note',
  'body.cancel_reason_text',
  'body.rectification_reason_text',
  'body.metadata_json',
  'body.paciente_id',
  // Sprint 4.3B — document body field nested under request payload wrappers.
  // `body.body` covers `logger.error({ body: req.body })` where the user
  // payload itself has a `body` property holding the document content.
  'body.body',
  'body.title',

  'req.body.chief_complaint',
  'req.body.anamnesis',
  'req.body.evolution',
  'req.body.plan',
  'req.body.internal_note',
  'req.body.cancel_reason_text',
  'req.body.rectification_reason_text',
  'req.body.metadata_json',
  'req.body.paciente_id',
  'req.body.body',
  'req.body.title',

  'payload.chief_complaint',
  'payload.anamnesis',
  'payload.evolution',
  'payload.plan',
  'payload.internal_note',
  'payload.cancel_reason_text',
  'payload.rectification_reason_text',
  'payload.metadata_json',
  'payload.paciente_id',
  'payload.body',
  'payload.title',

  // Layer 4: explicit three-level paths for the `initial_note` sub-object
  // accepted by `POST /clinical/encounters`. Covers accidental
  // `logger.error({ body: req.body })` when body contains `initial_note`.
  'body.initial_note.chief_complaint',
  'body.initial_note.anamnesis',
  'body.initial_note.evolution',
  'body.initial_note.plan',
  'body.initial_note.internal_note',

  'req.body.initial_note.chief_complaint',
  'req.body.initial_note.anamnesis',
  'req.body.initial_note.evolution',
  'req.body.initial_note.plan',
  'req.body.initial_note.internal_note',

  'payload.initial_note.chief_complaint',
  'payload.initial_note.anamnesis',
  'payload.initial_note.evolution',
  'payload.initial_note.plan',
  'payload.initial_note.internal_note',
];

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: redactPaths,
    remove: true,
  },
  base: { service: 'clinicbridge-backend' },
});
