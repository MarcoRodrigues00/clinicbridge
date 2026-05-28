import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  Loader2,
  RefreshCw,
  Plus,
  Clock,
  User,
  Stethoscope,
  CheckCircle2,
  XCircle,
  CalendarClock,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CalendarCheck,
  Copy,
  MessageCircle,
  Pencil,
  Receipt,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import {
  api,
  ApiError,
  type AppointmentStatus,
  type ClinicService,
  type PublicAppointment,
  type PublicClinicProfessional,
  type PublicPatient,
  type FinancialChargeListItem,
} from '../services/api';
import { getToken } from '../services/authStorage';
import { useAuth } from '../services/AuthProvider';
import {
  buildReminderMessage,
  buildWhatsappUrl,
  formatReminderDate,
  formatReminderTime,
} from '../utils/reminders';
import styles from './AdministrativeSchedulePanel.module.css';

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: 'Agendado',
  confirmed: 'Confirmado',
  cancelled: 'Cancelado',
  rescheduled: 'Remarcado',
  no_show: 'Faltou',
  completed: 'Concluído',
};

const STATUS_ACTIONS: { status: AppointmentStatus; label: string }[] = [
  { status: 'confirmed', label: 'Confirmar' },
  { status: 'completed', label: 'Concluir' },
  { status: 'no_show', label: 'Faltou' },
  { status: 'cancelled', label: 'Cancelar' },
];

const TERMINAL: AppointmentStatus[] = ['cancelled', 'completed'];
const REMINDER_STATUSES: AppointmentStatus[] = ['scheduled', 'confirmed', 'rescheduled'];
const PROFESSIONALS_KEY = ['clinic-professionals'] as const;
const APPOINTMENTS_KEY = ['appointments'] as const;
const FINANCIAL_BADGE_KEY = ['financial', 'charges', 'agenda-badge'] as const;
const SERVICES_KEY = ['clinic-services'] as const;

// ── Financial badge helpers (ADR 0013) ────────────────────────────────────────

type FinancialBadgeState = 'none' | 'pending' | 'overdue' | 'paid' | 'charge_canceled';

const FINANCIAL_BADGE_LABELS: Record<FinancialBadgeState, string> = {
  none: 'Sem cobrança',
  pending: 'Pagamento pendente',
  overdue: 'Vencido',
  paid: 'Pago',
  charge_canceled: 'Cobrança cancelada',
};

function appointmentFinancialState(
  appointmentId: string,
  chargeMap: Map<string, FinancialChargeListItem>,
  today: string,
): FinancialBadgeState {
  const charge = chargeMap.get(appointmentId);
  if (!charge) return 'none';
  if (charge.status === 'paid') return 'paid';
  if (charge.status === 'canceled') return 'charge_canceled';
  if (charge.due_date && charge.due_date < today) return 'overdue';
  return 'pending';
}

// Returns informative alerts for A1–A4. Badge only uses status/due_date —
// never description, notes or amount_cents (ADR 0013 §3.8).
function getFinancialAlerts(
  appt: PublicAppointment,
  charge: FinancialChargeListItem | undefined,
  today: string,
): Array<{ id: string; message: string }> {
  if (!charge) return [];
  const alerts: Array<{ id: string; message: string }> = [];
  const active = appt.status === 'scheduled' || appt.status === 'confirmed';
  if (charge.status === 'paid' && active) {
    alerts.push({ id: 'A1', message: 'Pagamento recebido. Revise se a consulta deve ser confirmada.' });
  }
  if (charge.status === 'pending' && charge.due_date && charge.due_date < today && active) {
    alerts.push({ id: 'A2', message: 'Pagamento vencido. Revise antes da consulta.' });
  }
  if (appt.status === 'cancelled' && charge.status === 'pending') {
    alerts.push({ id: 'A3', message: 'Consulta cancelada. Revise a cobrança vinculada.' });
  }
  if (charge.status === 'canceled' && active) {
    alerts.push({ id: 'A4', message: 'Cobrança cancelada. Revise o agendamento.' });
  }
  return alerts;
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function errMsg(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function todayStr(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function dateAtNoon(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00`);
}

function shiftDate(dateStr: string, deltaDays: number): string {
  const d = dateAtNoon(dateStr);
  d.setDate(d.getDate() + deltaDays);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function longDate(dateStr: string): string {
  const d = dateAtNoon(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function shortDate(dateStr: string): string {
  const d = dateAtNoon(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
}

type DayKind = 'today' | 'tomorrow' | 'yesterday' | 'other';

function dayKind(dateStr: string): DayKind {
  const today = todayStr();
  if (dateStr === today) return 'today';
  if (dateStr === shiftDate(today, 1)) return 'tomorrow';
  if (dateStr === shiftDate(today, -1)) return 'yesterday';
  return 'other';
}

const DAY_KIND_LABELS: Record<DayKind, string> = {
  today: 'Hoje',
  tomorrow: 'Amanhã',
  yesterday: 'Ontem',
  other: 'Data selecionada',
};

function toIsoUtc(date: string, time: string): string {
  return `${date}T${time}:00.000Z`;
}

function timeFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface AdministrativeSchedulePanelProps {
  onGoToFinanceiro?: () => void;
}

export function AdministrativeSchedulePanel({ onGoToFinanceiro }: AdministrativeSchedulePanelProps): JSX.Element {
  const queryClient = useQueryClient();
  const { clinic, user } = useAuth();
  const token = getToken();

  const [date, setDate] = useState(todayStr());
  const [filterProfessional, setFilterProfessional] = useState('');
  const [filterStatus, setFilterStatus] = useState<'' | AppointmentStatus>('');

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [patientSearch, setPatientSearch] = useState('');
  const [appliedPatientSearch, setAppliedPatientSearch] = useState('');

  const [cPatientId, setCPatientId] = useState('');
  const [cProfessionalId, setCProfessionalId] = useState('');
  const [cServiceId, setCServiceId] = useState('');
  const [cStart, setCStart] = useState('09:00');
  const [cEnd, setCEnd] = useState('10:00');
  const [cNotes, setCNotes] = useState('');

  const [reschedId, setReschedId] = useState<string | null>(null);
  const [rDate, setRDate] = useState(todayStr());
  const [rStart, setRStart] = useState('09:00');
  const [rEnd, setREnd] = useState('10:00');

  const [reminderDrafts, setReminderDrafts] = useState<Record<string, string>>({});
  const [openReminderId, setOpenReminderId] = useState<string | null>(null);
  const REMINDER_MAX = 700;

  // ── Financial state (ADR 0013) ──────────────────────────────────────────────
  const [financialBlocked, setFinancialBlocked] = useState(false);
  const [openChargeFormId, setOpenChargeFormId] = useState<string | null>(null);
  const [chargeDescription, setChargeDescription] = useState('Consulta');
  const [chargeAmountStr, setChargeAmountStr] = useState('');
  const [chargeDueDate, setChargeDueDate] = useState('');
  const [chargeNotes, setChargeNotes] = useState('');
  const [chargeFormError, setChargeFormError] = useState<string | null>(null);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

  // ── Queries ─────────────────────────────────────────────────────────────────

  const professionalsQuery = useQuery({
    queryKey: [...PROFESSIONALS_KEY, 'active'],
    enabled: !!token,
    queryFn: async () => {
      const res = await api.listClinicProfessionals(token as string, { active: true });
      return res.professionals;
    },
  });

  const servicesQuery = useQuery({
    queryKey: [...SERVICES_KEY, 'active'],
    enabled: !!token,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await api.listClinicServices(token as string, { active: true, limit: 100 });
      return res.services;
    },
  });

  const professionalFilteredServicesQuery = useQuery({
    queryKey: [...SERVICES_KEY, 'active', 'prof', cProfessionalId],
    enabled: !!token && !!cProfessionalId,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await api.listClinicServices(token as string, {
        active: true,
        professional_id: cProfessionalId,
        limit: 100,
      });
      return res.services;
    },
  });

  const patientsQuery = useQuery({
    queryKey: ['patients', 'schedule-picker', appliedPatientSearch],
    enabled: !!token,
    queryFn: async () => {
      const res = await api.listPatients(token as string, {
        search: appliedPatientSearch || undefined,
        limit: 50,
        offset: 0,
      });
      return res.patients;
    },
  });

  const appointmentsQuery = useQuery({
    queryKey: [...APPOINTMENTS_KEY, { date, professional_id: filterProfessional, status: filterStatus }],
    enabled: !!token,
    queryFn: async () => {
      const res = await api.listAppointments(token as string, {
        date,
        professional_id: filterProfessional || undefined,
        status: filterStatus || undefined,
      });
      return res.appointments;
    },
  });

  // Financial charges for badge. Only for dono/secretaria (profissional → 403 → financialBlocked).
  // limit=100 per ADR 0013 §6.1. Notes NOT in list projection — safe to cache.
  const isPapelFinanceiro = user?.papel === 'dono_clinica' || user?.papel === 'secretaria';

  const financialChargesQuery = useQuery({
    queryKey: FINANCIAL_BADGE_KEY,
    enabled: !!token && isPapelFinanceiro,
    staleTime: 30_000,
    retry: false,
    queryFn: async () => {
      const res = await api.listFinancialCharges(token as string, { limit: 100 });
      return res.charges;
    },
  });

  useEffect(() => {
    if (financialChargesQuery.error instanceof ApiError && financialChargesQuery.error.status === 403) {
      setFinancialBlocked(true);
    }
  }, [financialChargesQuery.error]);

  // Map: appointment_id → most recent charge (list is ordered by created_at desc)
  const chargeMap = useMemo(() => {
    const map = new Map<string, FinancialChargeListItem>();
    for (const c of financialChargesQuery.data ?? []) {
      if (c.appointment_id && !map.has(c.appointment_id)) {
        map.set(c.appointment_id, c);
      }
    }
    return map;
  }, [financialChargesQuery.data]);

  const canSeeFinancial = isPapelFinanceiro && !financialBlocked;
  // "Criar cobrança" button visible for dono/secretaria. Gestor (papel=secretaria
  // + gestor_clinica grant) will get 403 on POST and see a clear error message.
  const canCreateCharge = canSeeFinancial;

  // ── Derived data ─────────────────────────────────────────────────────────────

  const professionals: PublicClinicProfessional[] = professionalsQuery.data ?? [];
  const patients: PublicPatient[] = patientsQuery.data ?? [];
  const services: ClinicService[] = servicesQuery.data ?? [];
  const availableServices: ClinicService[] = cProfessionalId
    ? (professionalFilteredServicesQuery.data ?? [])
    : services;

  const appointments: PublicAppointment[] = useMemo(() => {
    const list = appointmentsQuery.data ?? [];
    return [...list].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }, [appointmentsQuery.data]);

  const summary = useMemo(() => {
    const s = { total: appointments.length, agendados: 0, confirmados: 0, concluidos: 0, ausentes: 0 };
    for (const a of appointments) {
      if (a.status === 'scheduled' || a.status === 'rescheduled') s.agendados += 1;
      else if (a.status === 'confirmed') s.confirmados += 1;
      else if (a.status === 'completed') s.concluidos += 1;
      else if (a.status === 'no_show' || a.status === 'cancelled') s.ausentes += 1;
    }
    return s;
  }, [appointments]);

  const patientById = useMemo(() => {
    const map = new Map(patients.map((p) => [p.id, p]));
    return (id: string): PublicPatient | undefined => map.get(id);
  }, [patients]);

  const patientName = (id: string): string => patientById(id)?.nome ?? `Paciente ${id.slice(0, 8)}…`;

  const professionalName = useMemo(() => {
    const map = new Map(professionals.map((p) => [p.id, p.name]));
    return (id: string | null): string => (id ? (map.get(id) ?? '—') : '—');
  }, [professionals]);

  // ── Mutations & handlers ──────────────────────────────────────────────────────

  function invalidateAppointments(): void {
    void queryClient.invalidateQueries({ queryKey: APPOINTMENTS_KEY });
  }

  function invalidateFinancial(): void {
    void queryClient.invalidateQueries({ queryKey: ['financial'] });
  }

  const createMutation = useMutation({
    mutationFn: () =>
      api.createAppointment(token as string, {
        patient_id: cPatientId,
        professional_id: cProfessionalId || null,
        service_id: cServiceId || null,
        starts_at: toIsoUtc(date, cStart),
        ends_at: toIsoUtc(date, cEnd),
        administrative_notes: cNotes.trim() || null,
      }),
    onSuccess: () => {
      setNotice('Agendamento criado.');
      setCNotes('');
      setCServiceId('');
      setShowForm(false);
      invalidateAppointments();
    },
    onError: (err) => setError(errMsg(err, 'Não foi possível criar o agendamento.')),
  });

  const statusMutation = useMutation({
    mutationFn: (vars: { id: string; status: AppointmentStatus }) =>
      api.updateAppointmentStatus(token as string, vars.id, vars.status),
    onSuccess: () => {
      setNotice('Status atualizado.');
      invalidateAppointments();
    },
    onError: (err) => setError(errMsg(err, 'Não foi possível atualizar o status.')),
    onSettled: () => setBusyId(null),
  });

  const rescheduleMutation = useMutation({
    mutationFn: (vars: { id: string; starts_at: string; ends_at: string }) =>
      api.rescheduleAppointment(token as string, vars.id, {
        starts_at: vars.starts_at,
        ends_at: vars.ends_at,
      }),
    onSuccess: () => {
      setNotice('Agendamento remarcado.');
      setReschedId(null);
      invalidateAppointments();
    },
    onError: (err) => setError(errMsg(err, 'Não foi possível remarcar.')),
    onSettled: () => setBusyId(null),
  });

  // ── Financial charge mutation (ADR 0013 §5) ──────────────────────────────────

  function resetChargeForm(): void {
    setChargeDescription('Consulta');
    setChargeAmountStr('');
    setChargeDueDate('');
    setChargeNotes('');
    setChargeFormError(null);
  }

  function openChargeForm(appt: PublicAppointment): void {
    resetChargeForm();
    setOpenChargeFormId(appt.id);
  }

  function dismissAlert(appointmentId: string, alertId: string): void {
    setDismissedAlerts((prev) => new Set([...prev, `${appointmentId}-${alertId}`]));
  }

  const createChargeMutation = useMutation({
    mutationFn: ({ appointmentId, patientId }: { appointmentId: string; patientId: string }) => {
      const amountCents = Math.round(parseFloat(chargeAmountStr.replace(',', '.')) * 100);
      if (!chargeDescription.trim()) {
        throw new ApiError(400, { code: 'validation', message: 'A descrição é obrigatória.' });
      }
      if (isNaN(amountCents) || amountCents <= 0) {
        throw new ApiError(400, { code: 'validation', message: 'Informe um valor válido, maior que zero.' });
      }
      return api.createFinancialCharge(token as string, {
        patient_id: patientId,
        appointment_id: appointmentId,
        description: chargeDescription.trim(),
        amount_cents: amountCents,
        due_date: chargeDueDate || null,
        notes: chargeNotes.trim() || null,
      });
    },
    onSuccess: () => {
      setNotice('Cobrança criada.');
      setOpenChargeFormId(null);
      resetChargeForm();
      invalidateFinancial();
      invalidateAppointments();
    },
    onError: (err) => {
      setChargeFormError(errMsg(err, 'Não foi possível criar a cobrança.'));
    },
  });

  // ── Appointment form handlers ─────────────────────────────────────────────────

  function handleCreate(e: React.FormEvent): void {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!cPatientId) {
      setError('Selecione um paciente.');
      return;
    }
    createMutation.mutate();
  }

  function handleStatus(id: string, status: AppointmentStatus): void {
    setError(null);
    setNotice(null);
    setBusyId(id);
    statusMutation.mutate({ id, status });
  }

  function openReschedule(appt: PublicAppointment): void {
    setReschedId(appt.id);
    setRDate(appt.starts_at.slice(0, 10));
    setRStart(timeFromIso(appt.starts_at));
    setREnd(timeFromIso(appt.ends_at));
  }

  function handleReschedule(e: React.FormEvent, id: string): void {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusyId(id);
    rescheduleMutation.mutate({ id, starts_at: toIsoUtc(rDate, rStart), ends_at: toIsoUtc(rDate, rEnd) });
  }

  // ── Reminder helpers ──────────────────────────────────────────────────────────

  function defaultReminderText(appt: PublicAppointment): string {
    const p = patientById(appt.patient_id);
    return buildReminderMessage({
      nome: p?.nome ?? 'paciente',
      clinica: clinic?.nome ?? 'sua clínica',
      data: formatReminderDate(appt.starts_at.slice(0, 10)),
      hora: formatReminderTime(appt.starts_at),
    });
  }

  function effectiveReminderText(appt: PublicAppointment): string {
    return reminderDrafts[appt.id] ?? defaultReminderText(appt);
  }

  function openReminderEditor(appt: PublicAppointment): void {
    setError(null);
    setNotice(null);
    setReminderDrafts((d) => (d[appt.id] !== undefined ? d : { ...d, [appt.id]: defaultReminderText(appt) }));
    setOpenReminderId((cur) => (cur === appt.id ? cur : appt.id));
  }

  function updateReminderDraft(id: string, value: string): void {
    setReminderDrafts((d) => ({ ...d, [id]: value.slice(0, REMINDER_MAX) }));
  }

  function restoreReminderDefault(appt: PublicAppointment): void {
    setReminderDrafts((d) => ({ ...d, [appt.id]: defaultReminderText(appt) }));
  }

  async function handleCopyReminder(appt: PublicAppointment): Promise<void> {
    setError(null);
    setNotice(null);
    const message = effectiveReminderText(appt);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(message);
      setNotice('Mensagem copiada.');
    } catch {
      setError('Não foi possível copiar automaticamente. Use "Abrir WhatsApp" ou copie manualmente.');
    }
  }

  function handleOpenWhatsapp(appt: PublicAppointment): void {
    setError(null);
    setNotice(null);
    const p = patientById(appt.patient_id);
    const url = buildWhatsappUrl(p?.telefone, effectiveReminderText(appt));
    if (!url) {
      setError('Paciente sem telefone disponível.');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <section className={styles.panel}>
      <div className={styles.head}>
        <h2 className={styles.title}>
          <CalendarDays size={22} aria-hidden="true" />
          Agenda administrativa
        </h2>
        <button type="button" className={styles.secondaryBtn} onClick={() => void appointmentsQuery.refetch()}>
          <RefreshCw size={16} aria-hidden="true" />
          Atualizar
        </button>
      </div>
      <p className={styles.subtitle}>
        Agendamentos administrativos da clínica. Esta agenda não é prontuário e não
        guarda informação clínica.
      </p>

      <div className={styles.dateBar}>
        <div className={styles.dateNav}>
          <button type="button" className={styles.navIconBtn} aria-label="Dia anterior" onClick={() => setDate((d) => shiftDate(d, -1))}>
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`${styles.todayBtn} ${date === todayStr() ? styles.todayBtnActive : ''}`}
            onClick={() => setDate(todayStr())}
          >
            {date === todayStr() ? 'Hoje' : 'Ir para hoje'}
          </button>
          <button type="button" className={styles.navIconBtn} aria-label="Próximo dia" onClick={() => setDate((d) => shiftDate(d, 1))}>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
        <p className={styles.dateTitle}>Agenda de {longDate(date)}</p>
        <span className={`${styles.dateBadge} ${styles[`dk_${dayKind(date)}`] ?? ''}`}>
          {DAY_KIND_LABELS[dayKind(date)]}
        </span>
      </div>

      <div className={styles.summary}>
        <span className={styles.chip}>Total: <strong>{summary.total}</strong></span>
        <span className={`${styles.chip} ${styles.chipScheduled}`}>Agendados: <strong>{summary.agendados}</strong></span>
        <span className={`${styles.chip} ${styles.chipConfirmed}`}>Confirmados: <strong>{summary.confirmados}</strong></span>
        <span className={`${styles.chip} ${styles.chipCompleted}`}>Concluídos: <strong>{summary.concluidos}</strong></span>
        <span className={`${styles.chip} ${styles.chipAbsent}`}>Faltas/Cancelados: <strong>{summary.ausentes}</strong></span>
      </div>

      <div className={styles.filters}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Data</span>
          <input type="date" className={styles.input} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Profissional</span>
          <select className={styles.input} value={filterProfessional} onChange={(e) => setFilterProfessional(e.target.value)}>
            <option value="">Todos</option>
            {professionals.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Status</span>
          <select className={styles.input} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as '' | AppointmentStatus)}>
            <option value="">Todos</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      {!showForm ? (
        <button type="button" className={styles.addBtn} onClick={() => { setShowForm(true); setError(null); setNotice(null); }}>
          <Plus size={16} aria-hidden="true" /> Novo agendamento
        </button>
      ) : (
        <form className={styles.createForm} onSubmit={handleCreate}>
          <div className={styles.formHead}>
            <h3 className={styles.formTitle}>Novo agendamento</h3>
            <button type="button" className={styles.secondaryBtn} onClick={() => setShowForm(false)}>Fechar</button>
          </div>
          <div className={styles.patientPicker}>
            <input
              type="text"
              className={styles.input}
              placeholder="Buscar paciente (nome/e-mail/telefone)"
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
            />
            <button type="button" className={styles.secondaryBtn} onClick={() => setAppliedPatientSearch(patientSearch)}>
              Buscar
            </button>
          </div>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Paciente</span>
              <select className={styles.input} value={cPatientId} onChange={(e) => setCPatientId(e.target.value)}>
                <option value="">Selecione…</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}{p.cpf_masked ? ` · ${p.cpf_masked}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Profissional (opcional)</span>
              <select className={styles.input} value={cProfessionalId} onChange={(e) => { setCProfessionalId(e.target.value); setCServiceId(''); }}>
                <option value="">Sem profissional</option>
                {professionals.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Serviço (opcional)</span>
              <select
                className={styles.input}
                value={cServiceId}
                onChange={(e) => setCServiceId(e.target.value)}
                disabled={!!cProfessionalId && professionalFilteredServicesQuery.isLoading}
              >
                <option value="">Sem serviço</option>
                {availableServices.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.category ? ` — ${s.category}` : ''}
                  </option>
                ))}
              </select>
              {cProfessionalId &&
                !professionalFilteredServicesQuery.isLoading &&
                availableServices.length === 0 && (
                  <span className={styles.fieldHint}>
                    Nenhum serviço vinculado a este profissional. Acesse a aba Serviços para ajustar.
                  </span>
              )}
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Início</span>
              <input type="time" className={styles.input} value={cStart} onChange={(e) => setCStart(e.target.value)} />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Fim</span>
              <input type="time" className={styles.input} value={cEnd} onChange={(e) => setCEnd(e.target.value)} />
            </label>
          </div>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Observação administrativa (opcional)</span>
            <textarea
              className={styles.textarea}
              rows={2}
              maxLength={500}
              value={cNotes}
              onChange={(e) => setCNotes(e.target.value)}
              placeholder="Ex.: paciente pediu contato por telefone"
            />
          </label>
          <p className={styles.warning}>
            <AlertTriangle size={15} aria-hidden="true" />
            Campo administrativo. Não inclua diagnóstico, queixa, medicação, tratamento,
            exame, CID, prontuário ou informação clínica.
          </p>
          <button type="submit" className={styles.primaryBtn} disabled={createMutation.isPending}>
            {createMutation.isPending ? <Loader2 size={16} className={styles.spin} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
            Criar agendamento
          </button>
          <p className={styles.usesDate}>O agendamento usa a data selecionada acima ({date}).</p>
        </form>
      )}

      {notice && <p className={styles.notice}>{notice}</p>}
      {(error || appointmentsQuery.isError) && (
        <p className={styles.error}>{error ?? errMsg(appointmentsQuery.error, 'Não foi possível carregar a agenda.')}</p>
      )}

      {appointmentsQuery.isLoading ? (
        <p className={styles.muted}><Loader2 size={16} className={styles.spin} aria-hidden="true" /> Carregando agenda…</p>
      ) : appointments.length === 0 ? (
        <div className={styles.empty}>
          <CalendarCheck size={26} aria-hidden="true" />
          <p>Nenhum agendamento para {shortDate(date)}.</p>
          {!showForm && (
            <button type="button" className={styles.addBtn} onClick={() => setShowForm(true)}>
              <Plus size={16} aria-hidden="true" /> Novo agendamento
            </button>
          )}
        </div>
      ) : (
        <ul className={styles.timeline}>
          {appointments.map((a) => {
            const today = todayStr();
            const badgeState = canSeeFinancial
              ? appointmentFinancialState(a.id, chargeMap, today)
              : 'none';
            const charge = canSeeFinancial ? chargeMap.get(a.id) : undefined;
            const visibleAlerts = canSeeFinancial && charge
              ? getFinancialAlerts(a, charge, today).filter(
                  (al) => !dismissedAlerts.has(`${a.id}-${al.id}`),
                )
              : [];

            return (
              <li key={a.id} className={styles.slot}>
                <div className={styles.slotTime}>
                  <span className={styles.slotStart}>{timeFromIso(a.starts_at)}</span>
                  <span className={styles.slotEnd}>{timeFromIso(a.ends_at)}</span>
                </div>
                <div className={styles.card}>
                  <div className={styles.cardHead}>
                    <span className={styles.cardPatient}><User size={15} aria-hidden="true" /> {patientName(a.patient_id)}</span>
                    <div className={styles.cardBadges}>
                      <span className={`${styles.badge} ${styles[`st_${a.status}`] ?? ''}`}>{STATUS_LABELS[a.status]}</span>
                      {canSeeFinancial && badgeState !== 'none' && (
                        <span className={`${styles.financialBadge} ${styles[`fb_${badgeState}`] ?? ''}`}>
                          {FINANCIAL_BADGE_LABELS[badgeState]}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={styles.cardRow}><Stethoscope size={15} aria-hidden="true" /> {professionalName(a.professional_id)}</div>
                  <div className={styles.cardRow}><Clock size={15} aria-hidden="true" /> {timeFromIso(a.starts_at)}–{timeFromIso(a.ends_at)}</div>
                  {a.administrative_notes && <div className={styles.cardNotes}>{a.administrative_notes}</div>}

                  {/* Financial section — hidden for profissional/blocked users */}
                  {canSeeFinancial && (
                    <div className={styles.financialSection}>
                      <div className={styles.financialRow}>
                        <span className={styles.financialLabel}>
                          <Receipt size={12} aria-hidden="true" />
                          {badgeState === 'none' ? 'Sem cobrança vinculada' : FINANCIAL_BADGE_LABELS[badgeState]}
                        </span>
                        <div className={styles.financialBtns}>
                          {badgeState !== 'none' && (
                            <button
                              type="button"
                              className={styles.financialBtn}
                              onClick={() => onGoToFinanceiro?.()}
                            >
                              <ExternalLink size={12} aria-hidden="true" /> Ver cobrança
                            </button>
                          )}
                          {canCreateCharge && (badgeState === 'none' || badgeState === 'charge_canceled') && (
                            <button
                              type="button"
                              className={styles.financialBtnCreate}
                              onClick={() => openChargeForm(a)}
                            >
                              <Plus size={12} aria-hidden="true" />
                              {badgeState === 'charge_canceled' ? 'Criar nova cobrança' : 'Criar cobrança'}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Alertas A1–A4 */}
                      {visibleAlerts.map((alert) => (
                        <div key={`${a.id}-${alert.id}`} className={styles.financialAlert}>
                          <AlertCircle size={13} aria-hidden="true" className={styles.financialAlertIcon} />
                          <span>{alert.message}</span>
                          <button
                            type="button"
                            className={styles.financialAlertDismiss}
                            onClick={() => dismissAlert(a.id, alert.id)}
                            aria-label="Dispensar alerta"
                          >
                            ×
                          </button>
                        </div>
                      ))}

                      {/* Formulário criar cobrança (inline, collapsível) */}
                      {openChargeFormId === a.id && (
                        <form
                          className={styles.chargeForm}
                          onSubmit={(e) => {
                            e.preventDefault();
                            setChargeFormError(null);
                            createChargeMutation.mutate({ appointmentId: a.id, patientId: a.patient_id });
                          }}
                        >
                          <div className={styles.chargeFormHead}>
                            <span className={styles.chargeFormTitle}>
                              <Receipt size={14} aria-hidden="true" /> Criar cobrança
                            </span>
                            <button
                              type="button"
                              className={styles.secondaryBtn}
                              onClick={() => { setOpenChargeFormId(null); resetChargeForm(); }}
                            >
                              Fechar
                            </button>
                          </div>
                          <p className={styles.chargeFormPatient}>
                            <User size={13} aria-hidden="true" /> Paciente: {patientName(a.patient_id)}
                          </p>
                          <div className={styles.formGrid}>
                            <label className={styles.field}>
                              <span className={styles.fieldLabel}>Descrição <span className={styles.required}>*</span></span>
                              <input
                                type="text"
                                className={styles.input}
                                value={chargeDescription}
                                maxLength={255}
                                onChange={(e) => setChargeDescription(e.target.value)}
                                disabled={createChargeMutation.isPending}
                              />
                            </label>
                            <label className={styles.field}>
                              <span className={styles.fieldLabel}>Valor (R$) <span className={styles.required}>*</span></span>
                              <input
                                type="text"
                                inputMode="decimal"
                                className={styles.input}
                                value={chargeAmountStr}
                                placeholder="0,00"
                                onChange={(e) => setChargeAmountStr(e.target.value)}
                                disabled={createChargeMutation.isPending}
                              />
                            </label>
                            <label className={styles.field}>
                              <span className={styles.fieldLabel}>Vencimento (opcional)</span>
                              <input
                                type="date"
                                className={styles.input}
                                value={chargeDueDate}
                                onChange={(e) => setChargeDueDate(e.target.value)}
                                disabled={createChargeMutation.isPending}
                              />
                            </label>
                          </div>
                          <label className={styles.field}>
                            <span className={styles.fieldLabel}>Observações (opcional)</span>
                            <textarea
                              className={styles.textarea}
                              rows={2}
                              maxLength={500}
                              value={chargeNotes}
                              onChange={(e) => setChargeNotes(e.target.value)}
                              disabled={createChargeMutation.isPending}
                              placeholder="Observações administrativas. Não inclua dados de saúde."
                            />
                          </label>
                          <p className={styles.warning}>
                            <AlertTriangle size={14} aria-hidden="true" />
                            Não inclua diagnóstico, queixa clínica, prescrição ou informações
                            de saúde nas observações financeiras.
                          </p>
                          {chargeFormError && <p className={styles.error}>{chargeFormError}</p>}
                          <div className={styles.chargeFormActions}>
                            <button
                              type="submit"
                              className={styles.primaryBtn}
                              disabled={createChargeMutation.isPending}
                            >
                              {createChargeMutation.isPending
                                ? <Loader2 size={14} className={styles.spin} aria-hidden="true" />
                                : <Receipt size={14} aria-hidden="true" />}
                              {createChargeMutation.isPending ? 'Criando…' : 'Criar cobrança'}
                            </button>
                            <button
                              type="button"
                              className={styles.secondaryBtn}
                              disabled={createChargeMutation.isPending}
                              onClick={() => { setOpenChargeFormId(null); resetChargeForm(); }}
                            >
                              Cancelar
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  )}

                  {!TERMINAL.includes(a.status) && (
                    <div className={styles.actions}>
                      {STATUS_ACTIONS.map((act) => (
                        <button
                          key={act.status}
                          type="button"
                          className={styles.actionBtn}
                          disabled={busyId === a.id}
                          onClick={() => handleStatus(a.id, act.status)}
                        >
                          {act.status === 'confirmed' && <CheckCircle2 size={14} aria-hidden="true" />}
                          {act.status === 'cancelled' && <XCircle size={14} aria-hidden="true" />}
                          {act.label}
                        </button>
                      ))}
                      <button type="button" className={styles.actionBtn} disabled={busyId === a.id} onClick={() => openReschedule(a)}>
                        <CalendarClock size={14} aria-hidden="true" /> Remarcar
                      </button>
                    </div>
                  )}

                  {REMINDER_STATUSES.includes(a.status) && (
                    <div className={styles.reminder}>
                      <span className={styles.reminderLabel}>Lembrete administrativo</span>
                      <div className={styles.reminderActions}>
                        <button type="button" className={styles.reminderBtn} onClick={() => (openReminderId === a.id ? setOpenReminderId(null) : openReminderEditor(a))}>
                          <Pencil size={14} aria-hidden="true" /> {openReminderId === a.id ? 'Fechar mensagem' : 'Ver/editar mensagem'}
                        </button>
                        <button type="button" className={styles.reminderBtn} onClick={() => void handleCopyReminder(a)}>
                          <Copy size={14} aria-hidden="true" /> Copiar lembrete
                        </button>
                        <button type="button" className={styles.reminderBtn} onClick={() => handleOpenWhatsapp(a)}>
                          <MessageCircle size={14} aria-hidden="true" /> Abrir WhatsApp
                        </button>
                      </div>

                      {openReminderId === a.id && (
                        <div className={styles.reminderEditor}>
                          <textarea
                            className={styles.textarea}
                            rows={4}
                            maxLength={REMINDER_MAX}
                            value={effectiveReminderText(a)}
                            onChange={(e) => updateReminderDraft(a.id, e.target.value)}
                            aria-label="Mensagem do lembrete"
                          />
                          <div className={styles.reminderEditorFoot}>
                            <span className={styles.reminderCount}>{effectiveReminderText(a).length}/{REMINDER_MAX}</span>
                            <div className={styles.reminderActions}>
                              <button type="button" className={styles.reminderBtn} onClick={() => restoreReminderDefault(a)}>
                                Restaurar padrão
                              </button>
                              <button type="button" className={styles.reminderBtn} onClick={() => setOpenReminderId(null)}>
                                Fechar
                              </button>
                            </div>
                          </div>
                          <p className={styles.warning}>
                            <AlertTriangle size={15} aria-hidden="true" />
                            Mensagem administrativa. Não inclua diagnóstico, queixa, medicação,
                            tratamento, exame, CID, prontuário ou informação clínica.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {reschedId === a.id && (
                    <form className={styles.reschedule} onSubmit={(e) => handleReschedule(e, a.id)}>
                      <input type="date" className={styles.input} value={rDate} onChange={(e) => setRDate(e.target.value)} />
                      <input type="time" className={styles.input} value={rStart} onChange={(e) => setRStart(e.target.value)} />
                      <input type="time" className={styles.input} value={rEnd} onChange={(e) => setREnd(e.target.value)} />
                      <button type="submit" className={styles.primaryBtn} disabled={busyId === a.id}>Salvar</button>
                      <button type="button" className={styles.secondaryBtn} onClick={() => setReschedId(null)}>Cancelar</button>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
