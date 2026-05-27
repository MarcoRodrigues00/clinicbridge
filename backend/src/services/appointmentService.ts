import { logger } from '../config/logger';
import { appointmentDao } from '../dao/appointmentDao';
import { auditLogDao } from '../dao/auditLogDao';
import { clinicProfessionalDao } from '../dao/clinicProfessionalDao';
import { clinicServiceDao, professionalServiceDao } from '../dao/clinicServiceDao';
import { patientDao } from '../dao/patientDao';
import { HttpError } from '../middlewares/errorHandler';
import {
  isAppointmentStatus,
  STATUS_UPDATE_ALLOWED,
  toPublicAppointment,
  type PublicAppointment,
} from '../models/appointment';
import type { AuthContext } from './authService';
import type { SchedulingActor } from './clinicProfessionalService';

const NOTES_MAX = 500;
const LIST_DEFAULT_LIMIT = 200;
const LIST_MAX_LIMIT = 500;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new HttpError(400, 'invalid_appointment', `Identificador inválido: ${field}.`);
  }
  return value;
}

function parseIsoDate(value: unknown, field: string): Date {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpError(400, 'invalid_appointment', `Data/hora obrigatória: ${field}.`);
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new HttpError(400, 'invalid_appointment', `Data/hora inválida: ${field}.`);
  }
  return d;
}

// Optional, short, ADMINISTRATIVE note. Backend enforces length only and never
// logs it. Clinical content is out of scope (ADR 0006); the UI must warn the user.
// A textual blocklist is intentionally avoided here to prevent false positives.
function normalizeNotes(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new HttpError(400, 'invalid_appointment', 'administrative_notes inválido.');
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > NOTES_MAX) {
    throw new HttpError(
      400,
      'invalid_appointment',
      `administrative_notes deve ter no máximo ${NOTES_MAX} caracteres.`,
    );
  }
  return trimmed;
}

function assertTimeOrder(starts_at: Date, ends_at: Date): void {
  if (ends_at.getTime() <= starts_at.getTime()) {
    throw new HttpError(400, 'invalid_appointment', 'ends_at deve ser maior que starts_at.');
  }
}

async function safeAudit(
  acao: string,
  recurso_id: string | null,
  actor: SchedulingActor,
  ctx: AuthContext,
): Promise<void> {
  try {
    await auditLogDao.create({
      acao,
      usuario_id: actor.usuario_id,
      clinica_id: actor.clinica_id,
      recurso: 'appointment',
      recurso_id,
      ip: ctx.ip,
      user_agent: ctx.user_agent,
      request_id: ctx.request_id,
    });
  } catch (err) {
    logger.error({ err, acao, audit_write_failed: true }, 'audit log write failed');
  }
}

// Verifies the patient belongs to the actor's clinic (no cross-tenant). 400 keeps
// the response from confirming existence of a cross-clinic patient.
async function assertPatientInClinic(patient_id: string, clinica_id: string): Promise<void> {
  const ok = await patientDao.existsForClinic(patient_id, clinica_id);
  if (!ok) {
    throw new HttpError(400, 'invalid_patient_reference', 'Paciente inválido para esta clínica.');
  }
}

// Verifies the professional (when provided) belongs to the actor's clinic.
async function assertProfessionalInClinic(
  professional_id: string,
  clinica_id: string,
): Promise<void> {
  const prof = await clinicProfessionalDao.findByIdForClinic(professional_id, clinica_id);
  if (!prof) {
    throw new HttpError(
      400,
      'invalid_professional_reference',
      'Profissional inválido para esta clínica.',
    );
  }
}

export const appointmentService = {
  // Owner + secretaria. Creates an administrative appointment (status 'scheduled').
  async create(
    actor: SchedulingActor,
    body: {
      patient_id?: unknown;
      professional_id?: unknown;
      service_id?: unknown;
      starts_at?: unknown;
      ends_at?: unknown;
      administrative_notes?: unknown;
    },
    ctx: AuthContext,
  ): Promise<PublicAppointment> {
    const patient_id = parseUuid(body.patient_id, 'patient_id');
    const starts_at = parseIsoDate(body.starts_at, 'starts_at');
    const ends_at = parseIsoDate(body.ends_at, 'ends_at');
    assertTimeOrder(starts_at, ends_at);
    const administrative_notes = normalizeNotes(body.administrative_notes);

    let professional_id: string | null = null;
    if (body.professional_id !== undefined && body.professional_id !== null && body.professional_id !== '') {
      professional_id = parseUuid(body.professional_id, 'professional_id');
    }

    // Optional service catalog reference (ADR 0015). NEVER auto-fills starts_at/ends_at.
    let service_id: string | null = null;
    if (body.service_id !== undefined && body.service_id !== null && body.service_id !== '') {
      service_id = parseUuid(body.service_id, 'service_id');
      const svc = await clinicServiceDao.findByIdForClinic(service_id, actor.clinica_id);
      if (!svc) {
        throw new HttpError(400, 'service_not_found', 'Serviço não encontrado nesta clínica.');
      }
      if (!svc.active) {
        throw new HttpError(400, 'service_inactive', 'Serviço inativo. Reative-o antes de usá-lo.');
      }
      if (professional_id) {
        const binding = await professionalServiceDao.findBinding(
          actor.clinica_id,
          professional_id,
          service_id,
        );
        if (!binding || !binding.active) {
          throw new HttpError(
            400,
            'service_not_available_for_professional',
            'Este serviço não está vinculado ao profissional selecionado.',
          );
        }
      }
    }

    await assertPatientInClinic(patient_id, actor.clinica_id);
    if (professional_id) await assertProfessionalInClinic(professional_id, actor.clinica_id);

    const row = await appointmentDao.create({
      clinica_id: actor.clinica_id,
      patient_id,
      professional_id,
      service_id,
      starts_at,
      ends_at,
      status: 'scheduled',
      administrative_notes,
      created_by_user_id: actor.usuario_id,
    });
    await safeAudit('appointment.create.success', row.id, actor, ctx);
    return toPublicAppointment(row);
  },

  // Owner + secretaria. Lists the clinic's appointments with optional filters.
  async list(
    actor: SchedulingActor,
    rawQuery: { date?: unknown; from?: unknown; to?: unknown; professional_id?: unknown; status?: unknown; limit?: unknown },
    ctx: AuthContext,
  ): Promise<{ appointments: PublicAppointment[] }> {
    let from: Date | null = null;
    let to: Date | null = null;

    if (rawQuery.date !== undefined && rawQuery.date !== '') {
      if (typeof rawQuery.date !== 'string' || !DATE_RE.test(rawQuery.date)) {
        throw new HttpError(400, 'invalid_filter', 'date deve estar no formato YYYY-MM-DD.');
      }
      from = new Date(`${rawQuery.date}T00:00:00.000Z`);
      if (Number.isNaN(from.getTime())) {
        throw new HttpError(400, 'invalid_filter', 'date inválida.');
      }
      to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
    } else {
      if (rawQuery.from !== undefined && rawQuery.from !== '') from = parseIsoDate(rawQuery.from, 'from');
      if (rawQuery.to !== undefined && rawQuery.to !== '') to = parseIsoDate(rawQuery.to, 'to');
      if (from && to && to.getTime() <= from.getTime()) {
        throw new HttpError(400, 'invalid_filter', 'to deve ser maior que from.');
      }
    }

    let professional_id: string | null = null;
    if (rawQuery.professional_id !== undefined && rawQuery.professional_id !== '') {
      professional_id = parseUuid(rawQuery.professional_id, 'professional_id');
    }

    let status: string | null = null;
    if (rawQuery.status !== undefined && rawQuery.status !== '') {
      if (!isAppointmentStatus(rawQuery.status)) {
        throw new HttpError(400, 'invalid_filter', 'status inválido.');
      }
      status = rawQuery.status;
    }

    let limit = LIST_DEFAULT_LIMIT;
    if (rawQuery.limit !== undefined && rawQuery.limit !== '') {
      if (typeof rawQuery.limit !== 'string' || !/^\d+$/.test(rawQuery.limit)) {
        throw new HttpError(400, 'invalid_filter', 'limit inválido.');
      }
      limit = Number(rawQuery.limit);
      if (limit < 1 || limit > LIST_MAX_LIMIT) {
        throw new HttpError(400, 'invalid_filter', `limit deve estar entre 1 e ${LIST_MAX_LIMIT}.`);
      }
    }

    const rows = await appointmentDao.listByClinic(actor.clinica_id, {
      from,
      to,
      professional_id,
      status,
      limit,
    });
    await safeAudit('appointment.list.success', null, actor, ctx);
    return { appointments: rows.map(toPublicAppointment) };
  },

  // Owner + secretaria. Tenant-scoped detail.
  async detail(actor: SchedulingActor, id: string, ctx: AuthContext): Promise<PublicAppointment> {
    parseUuid(id, 'id');
    const row = await appointmentDao.findByIdForClinic(id, actor.clinica_id);
    if (!row) {
      throw new HttpError(404, 'appointment_not_found', 'Agendamento não encontrado.');
    }
    await safeAudit('appointment.detail.success', row.id, actor, ctx);
    return toPublicAppointment(row);
  },

  // Owner + secretaria. Sets status to one of STATUS_UPDATE_ALLOWED (not
  // 'rescheduled' — that goes through reschedule, which changes the times).
  async updateStatus(
    actor: SchedulingActor,
    id: string,
    body: { status?: unknown },
    ctx: AuthContext,
  ): Promise<PublicAppointment> {
    parseUuid(id, 'id');
    const status = body.status;
    if (!isAppointmentStatus(status) || !STATUS_UPDATE_ALLOWED.includes(status)) {
      throw new HttpError(
        400,
        'invalid_appointment',
        `status inválido. Use um de: ${STATUS_UPDATE_ALLOWED.join(', ')}.`,
      );
    }
    const row = await appointmentDao.updateStatusForClinic(
      id,
      actor.clinica_id,
      status,
      actor.usuario_id,
    );
    if (!row) {
      throw new HttpError(404, 'appointment_not_found', 'Agendamento não encontrado.');
    }
    await safeAudit('appointment.status.update.success', row.id, actor, ctx);
    return toPublicAppointment(row);
  },

  // Owner + secretaria. Updates the time window and marks status 'rescheduled'.
  async reschedule(
    actor: SchedulingActor,
    id: string,
    body: { starts_at?: unknown; ends_at?: unknown },
    ctx: AuthContext,
  ): Promise<PublicAppointment> {
    parseUuid(id, 'id');
    const starts_at = parseIsoDate(body.starts_at, 'starts_at');
    const ends_at = parseIsoDate(body.ends_at, 'ends_at');
    assertTimeOrder(starts_at, ends_at);

    const row = await appointmentDao.rescheduleForClinic(
      id,
      actor.clinica_id,
      starts_at,
      ends_at,
      actor.usuario_id,
    );
    if (!row) {
      throw new HttpError(404, 'appointment_not_found', 'Agendamento não encontrado.');
    }
    await safeAudit('appointment.reschedule.success', row.id, actor, ctx);
    return toPublicAppointment(row);
  },
};
