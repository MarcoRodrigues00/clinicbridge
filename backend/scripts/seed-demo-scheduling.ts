import 'dotenv/config';
import { db } from '../src/config/db';
import { env } from '../src/config/env';

// Dev-only demo seed for the Administrative Scheduling module (pilot v0.1).
//
// Creates FICTITIOUS demo data so the Agenda can be shown populated:
//   - demo patients   (patients.origem = 'seed_demo' — the cleanup marker)
//   - demo professionals (matched on a fixed name list for cleanup)
//   - demo appointments referencing the above (today / nearby days)
//
// ADMINISTRATIVE ONLY. No clinical data anywhere. No real CPF/phone/email — CPFs
// are invalid placeholders and e-mails use the reserved @example.com domain.
// Tenant-scoped by clinica_id. Idempotent (skips if demo patients already exist).
//
//   pnpm --filter backend seed:demo          # create demo data
//   pnpm --filter backend seed:demo:clean    # remove ONLY the demo data
//
// Target clinic: SEED_CLINIC_ID env, else the clinic that owns the most patients
// (i.e. the working dev clinic, so the logged-in owner sees the demo agenda).

const DEMO_MARKER = 'seed_demo';

// Fixed list — also used by cleanup to find the demo professionals to remove.
// The "[DEMO]" prefix marks them clearly AND makes the name-based cleanup safe:
// real professionals won't carry it, so cleanup can never match real data.
const DEMO_PROFESSIONALS: ReadonlyArray<{ name: string; specialty_label: string }> = [
  { name: '[DEMO] Dra. Helena Costa', specialty_label: 'Atendimento geral (demo)' },
  { name: '[DEMO] Dr. Rafael Nunes', specialty_label: 'Atendimento geral (demo)' },
  { name: '[DEMO] Dra. Beatriz Souza', specialty_label: 'Avaliação inicial (demo)' },
];

// Fictitious patients. CPFs are invalid placeholders; e-mails use @example.com.
const DEMO_PATIENTS: ReadonlyArray<{
  nome: string;
  telefone: string;
  email: string;
  cpf: string;
  data_nascimento: string;
  convenio: string;
}> = [
  { nome: 'Sofia Ramos Lima', telefone: '(11) 90000-2001', email: 'sofia.lima@example.com', cpf: '101.202.303-40', data_nascimento: '1990-04-12', convenio: 'Particular' },
  { nome: 'Diego Martins Alves', telefone: '(21) 90000-2002', email: 'diego.alves@example.com', cpf: '202.303.404-50', data_nascimento: '1986-09-23', convenio: 'Plano Exemplo Saúde' },
  { nome: 'Helena Castro Dias', telefone: '(31) 90000-2003', email: 'helena.dias@example.com', cpf: '303.404.505-60', data_nascimento: '1978-01-05', convenio: 'Particular' },
  { nome: 'Tiago Mendes Rocha', telefone: '(41) 90000-2004', email: 'tiago.rocha@example.com', cpf: '404.505.606-70', data_nascimento: '1995-12-30', convenio: 'Plano Exemplo Saúde' },
  { nome: 'Beatriz Nogueira Pires', telefone: '(11) 90000-2005', email: 'beatriz.pires@example.com', cpf: '505.606.707-80', data_nascimento: '1983-07-18', convenio: 'Particular' },
];

// Appointment plan, indexed into the lists above. dayOffset is relative to "today"
// so the agenda always has same-day content whenever the seed runs.
const DEMO_APPOINTMENTS: ReadonlyArray<{
  patient: number;
  professional: number;
  dayOffset: number;
  hour: number;
  minute: number;
  status: string;
  notes: string | null;
}> = [
  { patient: 0, professional: 0, dayOffset: 0, hour: 13, minute: 0, status: 'scheduled', notes: 'Confirmar presença por telefone.' },
  { patient: 1, professional: 1, dayOffset: 0, hour: 14, minute: 0, status: 'confirmed', notes: null },
  { patient: 2, professional: 2, dayOffset: 0, hour: 15, minute: 0, status: 'scheduled', notes: 'Paciente pediu horário pela manhã, se possível.' },
  { patient: 3, professional: 0, dayOffset: 1, hour: 13, minute: 30, status: 'scheduled', notes: null },
  { patient: 4, professional: 1, dayOffset: 1, hour: 16, minute: 0, status: 'confirmed', notes: 'Reagendou por telefone.' },
  { patient: 0, professional: 2, dayOffset: 2, hour: 12, minute: 0, status: 'scheduled', notes: null },
  { patient: 1, professional: 0, dayOffset: -1, hour: 13, minute: 0, status: 'completed', notes: null },
];

// UTC timestamp at (today + dayOffset) hour:minute. The MVP treats times as UTC
// and the frontend shows them verbatim.
function atUTC(dayOffset: number, hour: number, minute: number): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + dayOffset, hour, minute, 0),
  );
}

interface TargetClinic {
  id: string;
  nome: string;
  ownerId: string | null;
}

async function resolveClinic(): Promise<TargetClinic> {
  const override = process.env.SEED_CLINIC_ID;
  if (override) {
    const c = await db('clinics').where({ id: override }).first();
    if (!c) throw new Error(`SEED_CLINIC_ID ${override} not found in clinics.`);
    return { id: c.id, nome: c.nome, ownerId: c.responsavel_id };
  }
  const top = await db('patients')
    .select('clinica_id')
    .count<{ clinica_id: string; c: string }[]>({ c: '*' })
    .groupBy('clinica_id')
    .orderBy('c', 'desc')
    .first();
  const clinicId = top?.clinica_id;
  const c = clinicId
    ? await db('clinics').where({ id: clinicId }).first()
    : await db('clinics').orderBy('criado_em', 'asc').first();
  if (!c) throw new Error('No clinic found. Create a clinic (register an owner) first.');
  return { id: c.id, nome: c.nome, ownerId: c.responsavel_id };
}

async function seed(clinic: TargetClinic): Promise<void> {
  const existing = await db('patients')
    .where({ clinica_id: clinic.id, origem: DEMO_MARKER })
    .count<{ c: string }[]>({ c: '*' })
    .first();
  if (existing && Number(existing.c) > 0) {
    // eslint-disable-next-line no-console
    console.log(
      `[seed] demo data already present in clinic "${clinic.nome}" (${existing.c} demo patients). ` +
        'Run with "clean" first to reseed. Nothing to do.',
    );
    return;
  }

  await db.transaction(async (trx) => {
    // Professionals
    const profIds: string[] = [];
    for (const p of DEMO_PROFESSIONALS) {
      const [row] = await trx('clinic_professionals')
        .insert({ clinica_id: clinic.id, name: p.name, specialty_label: p.specialty_label })
        .returning('id');
      profIds.push(row.id);
    }

    // Patients (administrative only; fictitious; marked origem='seed_demo')
    const patientIds: string[] = [];
    for (const pt of DEMO_PATIENTS) {
      const [row] = await trx('patients')
        .insert({
          clinica_id: clinic.id,
          nome: pt.nome,
          telefone: pt.telefone,
          email: pt.email,
          cpf: pt.cpf,
          data_nascimento: pt.data_nascimento,
          convenio: pt.convenio,
          status: 'active',
          origem: DEMO_MARKER,
        })
        .returning('id');
      patientIds.push(row.id);
    }

    // Appointments
    for (const a of DEMO_APPOINTMENTS) {
      const starts = atUTC(a.dayOffset, a.hour, a.minute);
      const ends = new Date(starts.getTime() + 30 * 60 * 1000);
      await trx('appointments').insert({
        clinica_id: clinic.id,
        patient_id: patientIds[a.patient],
        professional_id: profIds[a.professional],
        starts_at: starts,
        ends_at: ends,
        status: a.status,
        administrative_notes: a.notes,
        created_by_user_id: clinic.ownerId,
      });
    }

    // eslint-disable-next-line no-console
    console.log(
      `[seed] created in clinic "${clinic.nome}" (${clinic.id}): ` +
        `${profIds.length} professionals, ${patientIds.length} patients, ${DEMO_APPOINTMENTS.length} appointments.`,
    );
  });
}

async function clean(clinic: TargetClinic): Promise<void> {
  await db.transaction(async (trx) => {
    const demoPatientIds = await trx('patients')
      .where({ clinica_id: clinic.id, origem: DEMO_MARKER })
      .pluck('id');

    let removedAppts = 0;
    if (demoPatientIds.length > 0) {
      removedAppts = await trx('appointments')
        .where({ clinica_id: clinic.id })
        .whereIn('patient_id', demoPatientIds)
        .del();
    }

    const removedProfs = await trx('clinic_professionals')
      .where({ clinica_id: clinic.id })
      .whereIn(
        'name',
        DEMO_PROFESSIONALS.map((p) => p.name),
      )
      .del();

    const removedPatients = await trx('patients')
      .where({ clinica_id: clinic.id, origem: DEMO_MARKER })
      .del();

    // eslint-disable-next-line no-console
    console.log(
      `[seed:clean] removed from clinic "${clinic.nome}" (${clinic.id}): ` +
        `${removedAppts} appointments, ${removedProfs} professionals, ${removedPatients} patients.`,
    );
  });
}

async function main(): Promise<void> {
  if (env.NODE_ENV === 'production') {
    // eslint-disable-next-line no-console
    console.error('[seed] refusing to run with NODE_ENV=production. Dev/staging only.');
    process.exit(1);
  }

  const mode = (process.argv[2] ?? process.env.SEED_MODE ?? 'seed').toLowerCase();
  if (mode !== 'seed' && mode !== 'clean') {
    // eslint-disable-next-line no-console
    console.error(`[seed] unknown mode "${mode}". Use "seed" or "clean".`);
    process.exit(2);
  }

  const clinic = await resolveClinic();
  if (mode === 'clean') {
    await clean(clinic);
  } else {
    await seed(clinic);
  }
}

main()
  .catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error('[seed] failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => {
    void db.destroy();
  });
