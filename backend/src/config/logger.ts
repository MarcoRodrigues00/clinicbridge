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
  'body.paciente_id',

  'req.body.chief_complaint',
  'req.body.anamnesis',
  'req.body.evolution',
  'req.body.plan',
  'req.body.internal_note',
  'req.body.cancel_reason_text',
  'req.body.rectification_reason_text',
  'req.body.paciente_id',

  'payload.chief_complaint',
  'payload.anamnesis',
  'payload.evolution',
  'payload.plan',
  'payload.internal_note',
  'payload.cancel_reason_text',
  'payload.rectification_reason_text',
  'payload.paciente_id',

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
