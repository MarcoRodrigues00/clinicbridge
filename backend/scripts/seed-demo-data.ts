import 'dotenv/config';
import crypto from 'crypto';
import argon2 from 'argon2';
import { db } from '../src/config/db';
import { env } from '../src/config/env';

// =============================================================================
// DEMO SEED — COMPREHENSIVE — dev/staging ONLY
// =============================================================================
//
// Populates a dedicated "Clínica Demo Aurora" with 100% SYNTHETIC data suitable
// for demonstrations and pilot testing.  Nothing here is real patient data.
//
// What gets created:
//   - Separate demo clinic + 5 demo users (owner, secretaria, médico, psicóloga, gestor)
//   - 3 clinic professionals (agenda)
//   - 6 services (catálogo)
//   - 20 synthetic patients (various statuses, some with convenio links)
//   - 20 appointments (today + next 7 days, varied statuses)
//   - 12 financial charges (particular, convênio, misto, various statuses)
//   - 2 insurance providers + 2 plans + 3 service prices + 3 patient insurances
//   - 7 inventory items + movements (2 below minimum for low-stock demo)
//
// Clinical encounters/documents: skipped — only safe with fake IDs after proper
// role setup. Documented as 5.0B.1 follow-up.
//
// GUARDS:
//   1. Refuses if NODE_ENV=production
//   2. Refuses unless ALLOW_DEMO_SEED=true
//
// IDEMPOTENT: if demo patients already exist, prints a summary and exits.
// CLEAN: removes only the demo clinic and its entire subtree (CASCADE + explicit
//        delete of financial_charges, which have RESTRICT on patient_id).
//
// Usage:
//   ALLOW_DEMO_SEED=true pnpm --filter backend seed:demo:full
//   ALLOW_DEMO_SEED=true pnpm --filter backend seed:demo:full:clean
//
// SMOKE USERS ARE NEVER TOUCHED.
// =============================================================================

const DEMO_MARKER = 'seed_demo_full';
const DEMO_CLINIC_NAME = 'Clínica Demo Aurora';
const DEMO_OWNER_EMAIL = 'demo.owner@clinicbridge.local';
const DEMO_PASSWORD = 'DemoDevOnly!23';

// Argon2id options — same as production passwordService for realistic test.
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 46 * 1024,
  timeCost: 1,
  parallelism: 1,
};

// ── Demo users ────────────────────────────────────────────────────────────────

const DEMO_USERS = [
  { key: 'owner',     email: 'demo.owner@clinicbridge.local',      nome: 'Aurora Demo (Dono)',         papel: 'dono_clinica', clinicalRole: null               },
  { key: 'sec',       email: 'demo.secretaria@clinicbridge.local', nome: 'Laura Demo (Secretaria)',    papel: 'secretaria',   clinicalRole: null               },
  { key: 'medico',    email: 'demo.medico@clinicbridge.local',     nome: 'Dr. Rafael Demo (Médico)',   papel: 'secretaria',   clinicalRole: 'profissional_clinico' },
  { key: 'psicologa', email: 'demo.psicologa@clinicbridge.local',  nome: 'Dra. Helena Demo (Psico)',   papel: 'secretaria',   clinicalRole: 'profissional_clinico' },
  { key: 'gestor',    email: 'demo.gestor@clinicbridge.local',     nome: 'Carlos Demo (Gestor)',       papel: 'secretaria',   clinicalRole: 'gestor_clinica'   },
] as const;

// ── Clinic professionals (agenda) ─────────────────────────────────────────────

const DEMO_PROFESSIONALS = [
  { name: '[DEMO] Dr. Rafael Aurora',  specialty_label: 'Clínica médica (demo)' },
  { name: '[DEMO] Dra. Helena Aurora', specialty_label: 'Psicologia (demo)' },
  { name: '[DEMO] Dra. Clara Aurora',  specialty_label: 'Odontologia (demo)' },
] as const;

// ── Services ──────────────────────────────────────────────────────────────────

const DEMO_SERVICES = [
  { name: 'Consulta médica',       category: 'Consulta',    duration_minutes: 30, price_cents: 25000 },
  { name: 'Retorno médico',        category: 'Consulta',    duration_minutes: 20, price_cents: 12000 },
  { name: 'Sessão de psicologia',  category: 'Sessão',      duration_minutes: 50, price_cents: 18000 },
  { name: 'Consulta odontológica', category: 'Odontologia', duration_minutes: 40, price_cents: 22000 },
  { name: 'Limpeza dental',        category: 'Odontologia', duration_minutes: 60, price_cents: 30000 },
  { name: 'Consulta de rotina',    category: 'Consulta',    duration_minutes: 25, price_cents: 15000 },
] as const;

// ── Synthetic patients ────────────────────────────────────────────────────────
// CPFs are arithmetically invalid.  Phones use (41) 9000x-xxxx (fictitious).
// Emails use @demo.local domain.

const DEMO_PATIENTS = [
  // Medicina (8)
  { nome: 'Mariana Alves Fonseca',  telefone: '(41) 90001-0001', email: 'mariana.fonseca@demo.local',  data_nascimento: '1988-03-14', status: 'active'   },
  { nome: 'Fernando Costa Braga',   telefone: '(41) 90001-0002', email: 'fernando.braga@demo.local',   data_nascimento: '1975-11-22', status: 'active'   },
  { nome: 'Camila Rocha Teixeira',  telefone: '(41) 90001-0003', email: 'camila.teixeira@demo.local',  data_nascimento: '1992-07-05', status: 'active'   },
  { nome: 'Ricardo Pinto Lemos',    telefone: '(41) 90001-0004', email: 'ricardo.lemos@demo.local',    data_nascimento: '1980-01-30', status: 'active'   },
  { nome: 'Juliana Moura Ribeiro',  telefone: '(41) 90001-0005', email: 'juliana.ribeiro@demo.local',  data_nascimento: '1995-09-18', status: 'active'   },
  { nome: 'André Melo Carvalho',    telefone: '(41) 90001-0006', email: 'andre.carvalho@demo.local',   data_nascimento: '1967-06-03', status: 'active'   },
  { nome: 'Patricia Lima Duarte',   telefone: '(41) 90001-0007', email: 'patricia.duarte@demo.local',  data_nascimento: '1983-04-25', status: 'active'   },
  { nome: 'Lucas Ferreira Neves',   telefone: '(41) 90001-0008', email: 'lucas.neves@demo.local',      data_nascimento: '2001-12-09', status: 'active'   },
  // Psicologia (6)
  { nome: 'Beatriz Sousa Pires',    telefone: '(41) 90001-0009', email: 'beatriz.pires@demo.local',    data_nascimento: '1990-08-14', status: 'active'   },
  { nome: 'Thiago Ramos Cunha',     telefone: '(41) 90001-0010', email: 'thiago.cunha@demo.local',     data_nascimento: '1985-02-28', status: 'active'   },
  { nome: 'Amanda Vieira Santos',   telefone: '(41) 90001-0011', email: 'amanda.santos@demo.local',    data_nascimento: '1998-10-11', status: 'active'   },
  { nome: 'Gustavo Mendes Aguiar',  telefone: '(41) 90001-0012', email: 'gustavo.aguiar@demo.local',   data_nascimento: '1970-05-17', status: 'active'   },
  { nome: 'Fernanda Oliveira Paz',  telefone: '(41) 90001-0013', email: 'fernanda.paz@demo.local',     data_nascimento: '1993-03-22', status: 'active'   },
  { nome: 'Rodrigo Castro Silva',   telefone: '(41) 90001-0014', email: 'rodrigo.silva@demo.local',    data_nascimento: '1978-07-30', status: 'active'   },
  // Odontologia (4)
  { nome: 'Isabela Torres Campos',  telefone: '(41) 90001-0015', email: 'isabela.campos@demo.local',   data_nascimento: '1996-11-04', status: 'active'   },
  { nome: 'Vinicius Lopes Mota',    telefone: '(41) 90001-0016', email: 'vinicius.mota@demo.local',    data_nascimento: '1982-09-16', status: 'active'   },
  { nome: 'Daniela Rocha Freitas',  telefone: '(41) 90001-0017', email: 'daniela.freitas@demo.local',  data_nascimento: '2000-01-28', status: 'active'   },
  { nome: 'Eduardo Gomes Barros',   telefone: '(41) 90001-0018', email: 'eduardo.barros@demo.local',   data_nascimento: '1973-06-12', status: 'active'   },
  // Arquivados (2)
  { nome: 'Claudia Nunes Farias',   telefone: '(41) 90001-0019', email: 'claudia.farias@demo.local',   data_nascimento: '1965-08-20', status: 'archived' },
  { nome: 'Marcos Azevedo Prado',   telefone: '(41) 90001-0020', email: 'marcos.prado@demo.local',     data_nascimento: '1958-12-05', status: 'archived' },
] as const;

// ── Appointments ──────────────────────────────────────────────────────────────
// patient/professional indexes are 0-based into DEMO_PATIENTS / DEMO_PROFESSIONALS.
// service index is 0-based into DEMO_SERVICES.

const DEMO_APPOINTMENTS = [
  // Today
  { patient: 0, prof: 0, svc: 0, dayOffset: 0, hour: 9,  min: 0,  status: 'scheduled',  notes: 'Primeira consulta. DADO SINTÉTICO.' },
  { patient: 1, prof: 0, svc: 0, dayOffset: 0, hour: 10, min: 0,  status: 'confirmed',  notes: null },
  { patient: 8, prof: 1, svc: 2, dayOffset: 0, hour: 10, min: 30, status: 'scheduled',  notes: 'Sessão de acompanhamento. DADO SINTÉTICO.' },
  { patient: 2, prof: 0, svc: 1, dayOffset: 0, hour: 11, min: 0,  status: 'confirmed',  notes: null },
  { patient: 9, prof: 1, svc: 2, dayOffset: 0, hour: 14, min: 0,  status: 'scheduled',  notes: null },
  { patient: 14, prof: 2, svc: 3, dayOffset: 0, hour: 15, min: 0, status: 'confirmed',  notes: null },
  // Yesterday (completed/no-show)
  { patient: 3, prof: 0, svc: 0, dayOffset: -1, hour: 9, min: 0,  status: 'completed',  notes: null },
  { patient: 10, prof: 1, svc: 2, dayOffset: -1, hour: 10, min: 0, status: 'completed', notes: null },
  { patient: 5, prof: 0, svc: 5, dayOffset: -1, hour: 11, min: 0, status: 'no_show',   notes: 'Não compareceu. DADO SINTÉTICO.' },
  // Next 7 days
  { patient: 4, prof: 0, svc: 0, dayOffset: 1, hour: 9,  min: 30, status: 'scheduled',  notes: null },
  { patient: 11, prof: 1, svc: 2, dayOffset: 1, hour: 10, min: 30, status: 'scheduled', notes: null },
  { patient: 15, prof: 2, svc: 4, dayOffset: 1, hour: 14, min: 0,  status: 'scheduled', notes: null },
  { patient: 6, prof: 0, svc: 1, dayOffset: 2, hour: 9,  min: 0,  status: 'scheduled',  notes: null },
  { patient: 12, prof: 1, svc: 2, dayOffset: 2, hour: 10, min: 0, status: 'scheduled',  notes: null },
  { patient: 7, prof: 0, svc: 0, dayOffset: 3, hour: 9,  min: 0,  status: 'scheduled',  notes: null },
  { patient: 16, prof: 2, svc: 3, dayOffset: 3, hour: 13, min: 0, status: 'scheduled',  notes: null },
  { patient: 13, prof: 1, svc: 2, dayOffset: 4, hour: 10, min: 0, status: 'confirmed',  notes: null },
  { patient: 0, prof: 0, svc: 5, dayOffset: 5, hour: 9,  min: 0,  status: 'scheduled',  notes: null },
  { patient: 17, prof: 2, svc: 4, dayOffset: 6, hour: 14, min: 0, status: 'scheduled',  notes: null },
  // Cancelled
  { patient: 2, prof: 0, svc: 0, dayOffset: -2, hour: 9, min: 0,  status: 'cancelled',  notes: 'Cancelado pelo paciente. DADO SINTÉTICO.' },
] as const;

// ── Inventory items ───────────────────────────────────────────────────────────

const DEMO_INVENTORY = [
  { name: 'Luvas descartáveis M',   category: 'EPI',              unit: 'caixa',   current: 8,  minimum: 5,  location: 'Sala de suprimentos' },
  { name: 'Máscaras cirúrgicas',    category: 'EPI',              unit: 'caixa',   current: 3,  minimum: 5,  location: 'Sala de suprimentos' }, // low stock
  { name: 'Álcool 70% 500ml',       category: 'Higiene',          unit: 'frasco',  current: 12, minimum: 4,  location: null },
  { name: 'Papel toalha',           category: 'Higiene',          unit: 'pacote',  current: 2,  minimum: 3,  location: 'Recepção' }, // low stock
  { name: 'Gaze 10x10cm',           category: 'Material clínico', unit: 'pacote',  current: 20, minimum: 5,  location: 'Sala 1' },
  { name: 'Canetas recepção',       category: 'Administrativo',   unit: 'unidade', current: 15, minimum: 0,  location: 'Recepção' },
  { name: 'Fichas de atendimento',  category: 'Administrativo',   unit: 'bloco',   current: 5,  minimum: 2,  location: 'Recepção' },
] as const;

// ── invite_code generator (same alphabet as clinic_team migration) ────────────

const INVITE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
function genInviteCode(): string {
  let out = '';
  for (let i = 0; i < 8; i++) out += INVITE_ALPHABET[crypto.randomInt(INVITE_ALPHABET.length)];
  return out;
}

// ── UTC timestamp helper ───────────────────────────────────────────────────────

function atUTC(dayOffset: number, hour: number, minute: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + dayOffset, hour, minute, 0));
}

// ── Resolve or create demo clinic ─────────────────────────────────────────────

interface DemoClinic {
  id: string;
  nome: string;
  ownerId: string;
  isNew: boolean;
}

async function resolveOrCreateDemoClinic(): Promise<DemoClinic> {
  // Clinic already exists — reuse it.
  const existingClinic = await db('clinics').where({ nome: DEMO_CLINIC_NAME }).first();
  if (existingClinic) {
    return { id: existingClinic.id, nome: existingClinic.nome, ownerId: existingClinic.responsavel_id, isNew: false };
  }

  const senha_hash = await argon2.hash(DEMO_PASSWORD, ARGON2_OPTIONS);

  // Upsert owner user — handles partial state from a previously failed run.
  const existingOwner = await db('users').where({ email: DEMO_OWNER_EMAIL }).first();
  let ownerId: string;
  if (existingOwner) {
    ownerId = existingOwner.id as string;
  } else {
    // 1. Create owner user (clinica_id NULL initially — circular FK)
    const [ownerRow] = await db('users')
      .insert({ nome: 'Aurora Demo (Dono)', email: DEMO_OWNER_EMAIL, senha_hash, papel: 'dono_clinica', clinica_id: null, ativo: true })
      .returning('id');
    ownerId = ownerRow.id as string;
  }

  // 2. Create clinic with owner reference
  const [clinicRow] = await db('clinics')
    .insert({ nome: DEMO_CLINIC_NAME, responsavel_id: ownerId, plano: 'free', consentimento_lgpd: true, contrato_aceito_em: new Date(), invite_code: genInviteCode() })
    .returning('id');
  const clinicId: string = clinicRow.id as string;

  // 3. Link owner to clinic
  await db('users').where({ id: ownerId }).update({ clinica_id: clinicId });

  return { id: clinicId, nome: DEMO_CLINIC_NAME, ownerId, isNew: true };
}

// ── Main seed ─────────────────────────────────────────────────────────────────

async function seed(clinic: DemoClinic): Promise<void> {
  // Idempotency check
  const existing = await db('patients')
    .where({ clinica_id: clinic.id, origem: DEMO_MARKER })
    .count<{ c: string }[]>({ c: '*' })
    .first();
  if (existing && Number(existing.c) > 0) {
    console.log(`[seed:demo:full] demo data already present in "${clinic.nome}" (${existing.c} demo patients). Run "clean" first to reseed.`);
    return;
  }

  const senha_hash = await argon2.hash(DEMO_PASSWORD, ARGON2_OPTIONS);

  // ── Users (secretaria, médico, psicóloga, gestor) ─────────────────────────
  const userMap: Record<string, string> = { owner: clinic.ownerId };
  for (const u of DEMO_USERS) {
    if (u.key === 'owner') continue;
    const [row] = await db('users')
      .insert({ nome: u.nome, email: u.email, senha_hash, papel: u.papel, clinica_id: clinic.id, ativo: true })
      .returning('id');
    userMap[u.key] = row.id as string;
  }

  // ── Clinical roles for profissional_clinico / gestor ──────────────────────
  for (const u of DEMO_USERS) {
    if (!u.clinicalRole) continue;
    await db('user_clinical_roles').insert({
      user_id: userMap[u.key],
      clinica_id: clinic.id,
      role: u.clinicalRole,
      granted_by_user_id: clinic.ownerId,
    });
  }

  // ── Clinic professionals ──────────────────────────────────────────────────
  const profIds: string[] = [];
  for (const p of DEMO_PROFESSIONALS) {
    const [row] = await db('clinic_professionals')
      .insert({ clinica_id: clinic.id, name: p.name, specialty_label: p.specialty_label })
      .returning('id');
    profIds.push(row.id as string);
  }

  // ── Services ─────────────────────────────────────────────────────────────
  const serviceIds: string[] = [];
  for (const s of DEMO_SERVICES) {
    const [row] = await db('clinic_services')
      .insert({ clinica_id: clinic.id, name: s.name, category: s.category, duration_minutes: s.duration_minutes, price_cents: s.price_cents, active: true })
      .returning('id');
    serviceIds.push(row.id as string);
  }

  await db('professional_services').insert([
    { professional_id: profIds[0], service_id: serviceIds[0], clinica_id: clinic.id, active: true },
    { professional_id: profIds[0], service_id: serviceIds[1], clinica_id: clinic.id, active: true },
    { professional_id: profIds[0], service_id: serviceIds[5], clinica_id: clinic.id, active: true },
    { professional_id: profIds[1], service_id: serviceIds[2], clinica_id: clinic.id, active: true },
    { professional_id: profIds[2], service_id: serviceIds[3], clinica_id: clinic.id, active: true },
    { professional_id: profIds[2], service_id: serviceIds[4], clinica_id: clinic.id, active: true },
  ]);

  // ── Patients ──────────────────────────────────────────────────────────────
  const patientIds: string[] = [];
  for (const pt of DEMO_PATIENTS) {
    const [row] = await db('patients')
      .insert({
        clinica_id: clinic.id,
        nome: pt.nome,
        telefone: pt.telefone,
        email: pt.email,
        cpf: null,
        data_nascimento: pt.data_nascimento,
        status: pt.status,
        origem: DEMO_MARKER,
      })
      .returning('id');
    patientIds.push(row.id as string);
  }

  // ── Insurance providers / plans / service prices / patient insurances ─────
  const [prov1] = await db('insurance_providers')
    .insert({ clinica_id: clinic.id, name: 'Plano Vida Demo', notes: 'Operadora fictícia para demonstração. DADO SINTÉTICO.', active: true })
    .returning('id');
  const [prov2] = await db('insurance_providers')
    .insert({ clinica_id: clinic.id, name: 'Saúde Aurora Demo', notes: 'Operadora fictícia para demonstração. DADO SINTÉTICO.', active: true })
    .returning('id');

  const [plan1] = await db('insurance_plans')
    .insert({ clinica_id: clinic.id, provider_id: (prov1.id as string), name: 'Essencial Demo', active: true })
    .returning('id');
  const [plan2] = await db('insurance_plans')
    .insert({ clinica_id: clinic.id, provider_id: (prov1.id as string), name: 'Plus Demo', active: true })
    .returning('id');
  const [plan3] = await db('insurance_plans')
    .insert({ clinica_id: clinic.id, provider_id: (prov2.id as string), name: 'Aurora Flex Demo', active: true })
    .returning('id');

  await db('service_insurance_prices').insert([
    { clinica_id: clinic.id, service_id: serviceIds[0], provider_id: (prov1.id as string), plan_id: (plan2.id as string), reference_price_cents: 20000, active: true },
    { clinica_id: clinic.id, service_id: serviceIds[2], provider_id: (prov1.id as string), plan_id: (plan1.id as string), reference_price_cents: 14000, active: true },
    { clinica_id: clinic.id, service_id: serviceIds[0], provider_id: (prov2.id as string), plan_id: (plan3.id as string), reference_price_cents: 22000, active: true },
  ]);

  await db('patient_insurances').insert([
    { clinica_id: clinic.id, patient_id: patientIds[1],  provider_id: (prov1.id as string), plan_id: (plan2.id as string), member_number: 'VIDA-00001-DEMO', holder_name: 'Fernando Costa Braga (fictício)', active: true },
    { clinica_id: clinic.id, patient_id: patientIds[3],  provider_id: (prov1.id as string), plan_id: (plan1.id as string), member_number: 'VIDA-00002-DEMO', holder_name: 'Ricardo Pinto Lemos (fictício)',  active: true },
    { clinica_id: clinic.id, patient_id: patientIds[14], provider_id: (prov2.id as string), plan_id: (plan3.id as string), member_number: 'AURO-00001-DEMO', holder_name: 'Isabela Torres Campos (fictício)', active: true },
  ]);

  // ── Appointments ─────────────────────────────────────────────────────────
  const apptIds: string[] = [];
  for (const a of DEMO_APPOINTMENTS) {
    const starts = atUTC(a.dayOffset, a.hour, a.min);
    const ends   = new Date(starts.getTime() + 30 * 60 * 1000);
    const [row] = await db('appointments')
      .insert({
        clinica_id: clinic.id,
        patient_id: patientIds[a.patient],
        professional_id: profIds[a.prof],
        service_id: serviceIds[a.svc],
        starts_at: starts,
        ends_at: ends,
        status: a.status,
        administrative_notes: a.notes,
        created_by_user_id: clinic.ownerId,
      })
      .returning('id');
    apptIds.push(row.id);
  }

  // ── Financial charges ─────────────────────────────────────────────────────
  const today  = new Date(); today.setUTCHours(0, 0, 0, 0);
  const past10 = new Date(today); past10.setUTCDate(today.getUTCDate() - 10);
  const past5  = new Date(today); past5.setUTCDate(today.getUTCDate() - 5);
  const fut7   = new Date(today); fut7.setUTCDate(today.getUTCDate() + 7);
  const fut14  = new Date(today); fut14.setUTCDate(today.getUTCDate() + 14);
  const past30 = new Date(today); past30.setUTCDate(today.getUTCDate() - 30);

  // payment_method required when status='paid'; 'canceled' (not 'cancelled').
  const chargesData = [
    // Particular paga
    { patient: 0, appt: 6,    status: 'paid',    amount: 25000, payer_type: 'private',   payment_method: 'pix',           due: past10, description: 'Consulta médica — particular. DADO SINTÉTICO.' },
    // Particular pendente
    { patient: 4, appt: 9,    status: 'pending', amount: 25000, payer_type: 'private',   payment_method: null,            due: fut7,   description: 'Consulta médica — particular. DADO SINTÉTICO.' },
    // Convênio pendente
    { patient: 1, appt: 1,    status: 'pending', amount: 20000, payer_type: 'insurance', payment_method: null,            due: fut14,  description: 'Consulta médica — convênio. DADO SINTÉTICO.' },
    // Mista (copay + convênio) paga
    { patient: 3, appt: 7,    status: 'paid',    amount: 25000, payer_type: 'mixed',     payment_method: 'bank_transfer', due: past5,  description: 'Consulta médica — misto copay+convênio. DADO SINTÉTICO.' },
    // Psicologia paga
    { patient: 8, appt: 8,    status: 'paid',    amount: 18000, payer_type: 'private',   payment_method: 'pix',           due: past5,  description: 'Sessão de psicologia. DADO SINTÉTICO.' },
    // Psicologia pendente
    { patient: 9, appt: 4,    status: 'pending', amount: 18000, payer_type: 'private',   payment_method: null,            due: fut7,   description: 'Sessão de psicologia. DADO SINTÉTICO.' },
    // Odontologia pendente
    { patient: 14, appt: 5,   status: 'pending', amount: 30000, payer_type: 'private',   payment_method: null,            due: fut14,  description: 'Limpeza dental. DADO SINTÉTICO.' },
    // Cancelada ('canceled' = status correto no DB)
    { patient: 2, appt: null, status: 'canceled', amount: 25000, payer_type: 'private',  payment_method: null,            due: past5,  description: 'Consulta cancelada. DADO SINTÉTICO.' },
    // Vencida (due date no passado, ainda pending)
    { patient: 6, appt: null, status: 'pending', amount: 15000, payer_type: 'private',   payment_method: null,            due: past30, description: 'Consulta de rotina — vencida. DADO SINTÉTICO.' },
    // Retorno pago
    { patient: 2, appt: null, status: 'paid',    amount: 12000, payer_type: 'private',   payment_method: 'card',          due: past10, description: 'Retorno médico. DADO SINTÉTICO.' },
    // Convênio pago (paciente 3)
    { patient: 3, appt: null, status: 'paid',    amount: 20000, payer_type: 'insurance', payment_method: 'bank_transfer', due: past10, description: 'Consulta médica — convênio pago. DADO SINTÉTICO.' },
    // Psicologia convênio pendente
    { patient: 8, appt: 2,    status: 'pending', amount: 14000, payer_type: 'insurance', payment_method: null,            due: fut7,   description: 'Sessão de psicologia — convênio. DADO SINTÉTICO.' },
  ] as const;

  for (const c of chargesData) {
    const isMixed    = c.payer_type === 'mixed';
    const isInsurance = c.payer_type === 'insurance' || isMixed;
    const provId   = isInsurance ? prov1.id : null;
    const piResult = isInsurance
      ? await db('patient_insurances').where({ clinica_id: clinic.id, patient_id: patientIds[c.patient] }).first()
      : null;
    const piId = piResult?.id ?? null;

    await db('financial_charges').insert({
      clinica_id:            clinic.id,
      patient_id:            patientIds[c.patient],
      appointment_id:        c.appt !== null ? apptIds[c.appt] : null,
      created_by_user_id:    clinic.ownerId,
      description:           c.description,
      amount_cents:          c.amount,
      currency:              'BRL',
      due_date:              c.due.toISOString().slice(0, 10),
      status:                c.status,
      payer_type:            c.payer_type,
      insurance_provider_id: provId,
      patient_insurance_id:  piId,
      copay_amount_cents:    isMixed ? 5000 : null,
      insurance_amount_cents: isMixed ? 20000 : null,
      payment_method:        c.payment_method,
      paid_at:               c.status === 'paid' ? new Date() : null,
      paid_by_user_id:       c.status === 'paid' ? clinic.ownerId : null,
      canceled_at:           c.status === 'canceled' ? new Date() : null,
      canceled_by_user_id:   c.status === 'canceled' ? clinic.ownerId : null,
    });
  }

  // ── Inventory items + movements ───────────────────────────────────────────
  for (const item of DEMO_INVENTORY) {
    const [iRow] = await db('inventory_items')
      .insert({
        clinica_id: clinic.id,
        name: item.name,
        category: item.category,
        unit: item.unit,
        current_quantity: item.current,
        minimum_quantity: item.minimum,
        location: item.location,
        notes: 'Item de demonstração. DADO SINTÉTICO.',
        active: true,
      })
      .returning('id');

    // Initial entry movement
    await db('inventory_movements').insert({
      clinica_id: clinic.id,
      item_id: iRow.id,
      movement_type: 'entry',
      quantity_delta: item.current,
      created_by_user_id: clinic.ownerId,
      reason: 'Carga inicial do demo. DADO SINTÉTICO.',
    });

    // Add one exit movement to luvas and papel toalha to show history
    if (item.name === 'Luvas descartáveis M') {
      await db('inventory_movements').insert({
        clinica_id: clinic.id,
        item_id: iRow.id,
        movement_type: 'exit',
        quantity_delta: -2,
        created_by_user_id: clinic.ownerId,
        reason: 'Uso em atendimentos. DADO SINTÉTICO.',
      });
    }
    if (item.name === 'Papel toalha') {
      await db('inventory_movements').insert({
        clinica_id: clinic.id,
        item_id: iRow.id,
        movement_type: 'exit',
        quantity_delta: -1,
        created_by_user_id: clinic.ownerId,
        reason: 'Reposição recepção. DADO SINTÉTICO.',
      });
    }
  }

  console.log(
    `[seed:demo:full] ✅  Clínica Demo Aurora (${clinic.id})\n` +
    `  • Usuários demo:       ${DEMO_USERS.length} (+ clinic already counted)\n` +
    `  • Profissionais:       ${DEMO_PROFESSIONALS.length}\n` +
    `  • Serviços:            ${DEMO_SERVICES.length}\n` +
    `  • Pacientes:           ${DEMO_PATIENTS.length}\n` +
    `  • Agendamentos:        ${DEMO_APPOINTMENTS.length}\n` +
    `  • Cobranças:           ${chargesData.length}\n` +
    `  • Convênios:           2 operadoras · 3 planos · 3 preços ref · 3 carteirinhas\n` +
    `  • Estoque:             ${DEMO_INVENTORY.length} itens (2 com estoque baixo)\n` +
    `\n  Senha de todos os usuários demo: ${DEMO_PASSWORD}\n` +
    `  (dev/staging only — nunca usar em produção)`,
  );
}

// ── Clean ─────────────────────────────────────────────────────────────────────

async function clean(): Promise<void> {
  const clinic = await db('clinics').where({ nome: DEMO_CLINIC_NAME }).first();
  if (!clinic) {
    console.log('[seed:demo:full:clean] Demo clinic not found — nothing to clean.');
    return;
  }

  // financial_charges.patient_id has RESTRICT; must delete before patients/clinic cascade.
  const removedCharges = await db('financial_charges').where({ clinica_id: clinic.id }).del();
  console.log(`[seed:demo:full:clean] removed ${removedCharges} financial charges`);

  // users.clinica_id → clinics.id has no CASCADE; NULL it before deleting clinic.
  await db('users').where({ clinica_id: clinic.id }).update({ clinica_id: null });

  // Delete clinic — CASCADE handles: patients, appointments, services, professionals,
  // professional_services, insurance_*, inventory_*, user_clinical_roles, audit_logs.
  await db('clinics').where({ id: clinic.id }).del();

  // Delete demo users (clinica_id is now NULL so FK is clear).
  const removedUsers = await db('users')
    .whereIn('email', DEMO_USERS.map((u) => u.email))
    .del();

  console.log(
    `[seed:demo:full:clean] ✅  Demo clinic "${DEMO_CLINIC_NAME}" and all data removed.\n` +
    `  • Financial charges: ${removedCharges}\n` +
    `  • Users: ${removedUsers}`,
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Guard 1: never run in production
  if (env.NODE_ENV === 'production') {
    console.error('[seed:demo:full] ❌  Refusing: NODE_ENV=production. This script is dev/staging only.');
    process.exit(1);
  }

  // Guard 2: require explicit opt-in flag
  if (process.env.ALLOW_DEMO_SEED !== 'true') {
    console.error(
      '[seed:demo:full] ❌  Refusing: ALLOW_DEMO_SEED is not set to "true".\n' +
      '  Run with: ALLOW_DEMO_SEED=true pnpm --filter backend seed:demo:full',
    );
    process.exit(2);
  }

  const mode = (process.argv[2] ?? 'seed').toLowerCase();
  if (mode !== 'seed' && mode !== 'clean') {
    console.error(`[seed:demo:full] Unknown mode "${mode}". Use "seed" or "clean".`);
    process.exit(3);
  }

  console.log(
    `\n  ⚠️  DEMO SEED — SYNTHETIC DATA ONLY — dev/staging only\n` +
    `  Mode: ${mode} | Clinic: ${DEMO_CLINIC_NAME}\n`,
  );

  if (mode === 'clean') {
    await clean();
  } else {
    const clinic = await resolveOrCreateDemoClinic();
    await seed(clinic);
  }
}

main()
  .catch((err: unknown) => {
    console.error('[seed:demo:full] ❌  Failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => {
    void db.destroy();
  });
