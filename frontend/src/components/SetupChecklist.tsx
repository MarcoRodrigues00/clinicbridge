// SetupChecklist.tsx — Sprint 6.0E
//
// "Configure sua clínica" — a lightweight setup checklist for the real clinic.
// Uses existing read-only API calls (limit=1 where supported) to infer whether
// each resource has been configured. No seed, no backend changes, no demo data.
//
// SECURITY / LGPD:
// - Only existence checks (count > 0) — no patient names, CPF, clinical data.
// - 403s handled gracefully per item (shown as "Restrito", no error screen).
// - Token goes via Authorization header; never in URL or localStorage beyond
//   the existing authStorage pattern.
// - queryKey entries are stable string literals (no mutable objects).
//
// LIMITATIONS (documented):
// - Appointments: backend accepts `from`/`limit` (added to ListAppointmentsParams
//   in 6.0E); we query from 2020-01-01 limit=1 to detect any appointment.
// - Professionals: no backend limit param; full list is returned. Acceptable for
//   a small clinic — payload is tiny.

import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  Circle,
  Loader2,
  ArrowRight,
  Briefcase,
  Users,
  User,
  CalendarDays,
  Wallet,
  HeartHandshake,
  Boxes,
  Lock,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api, ApiError } from '../services/api';
import { getToken } from '../services/authStorage';
import styles from './SetupChecklist.module.css';

interface Props {
  isOwner: boolean;
  onNavigate: (tab: string) => void;
}

type ItemStatus = 'loading' | 'done' | 'pending' | 'optional-done' | 'optional-pending' | 'restricted';

const STALE_MS = 60_000;
// All-time range: the backend accepts ISO strings for `from`.
const APPT_FROM = '2020-01-01';

function is403(err: unknown): boolean {
  return err instanceof ApiError && err.status === 403;
}

function resolveStatus(
  isLoading: boolean,
  isError: boolean,
  error: unknown,
  data: boolean | undefined,
  optional: boolean,
): ItemStatus {
  if (isLoading) return 'loading';
  if (isError) return is403(error) ? 'restricted' : (optional ? 'optional-pending' : 'pending');
  return data ? (optional ? 'optional-done' : 'done') : (optional ? 'optional-pending' : 'pending');
}

interface ChecklistItem {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  tab: string;
  status: ItemStatus;
  optional: boolean;
  ownerOnly: boolean;
}

export function SetupChecklist({ isOwner, onNavigate }: Props): JSX.Element {
  const token = getToken();
  const enabled = !!token;

  // ── Queries (existence checks only) ──────────────────────────────────────

  const servicesQ = useQuery({
    queryKey: ['setup', 'services'] as const,
    enabled,
    staleTime: STALE_MS,
    retry: false,
    queryFn: async () => {
      const r = await api.listClinicServices(token!, { active: true, limit: 1 });
      return r.services.length > 0;
    },
  });

  // Professionals: no limit param in backend — small payload for a clinic.
  const professionalsQ = useQuery({
    queryKey: ['setup', 'professionals'] as const,
    enabled,
    staleTime: STALE_MS,
    retry: false,
    queryFn: async () => {
      const r = await api.listClinicProfessionals(token!, { active: true });
      return r.professionals.length > 0;
    },
  });

  const patientsQ = useQuery({
    queryKey: ['setup', 'patients'] as const,
    enabled,
    staleTime: STALE_MS,
    retry: false,
    queryFn: async () => {
      const r = await api.listPatients(token!, { limit: 1 });
      return r.patients.length > 0;
    },
  });

  // Appointments: uses `from` + `limit` added to ListAppointmentsParams in 6.0E.
  const appointmentsQ = useQuery({
    queryKey: ['setup', 'appointments'] as const,
    enabled,
    staleTime: STALE_MS,
    retry: false,
    queryFn: async () => {
      const r = await api.listAppointments(token!, { from: APPT_FROM, limit: 1 });
      return r.appointments.length > 0;
    },
  });

  const chargesQ = useQuery({
    queryKey: ['setup', 'charges'] as const,
    enabled,
    staleTime: STALE_MS,
    retry: false,
    queryFn: async () => {
      const r = await api.listFinancialCharges(token!, { limit: 1 });
      return r.charges.length > 0;
    },
  });

  const insuranceQ = useQuery({
    queryKey: ['setup', 'insurance'] as const,
    enabled,
    staleTime: STALE_MS,
    retry: false,
    queryFn: async () => {
      const r = await api.listInsuranceProviders(token!, { active: true, limit: 1 });
      return r.providers.length > 0;
    },
  });

  const inventoryQ = useQuery({
    queryKey: ['setup', 'inventory'] as const,
    enabled,
    staleTime: STALE_MS,
    retry: false,
    queryFn: async () => {
      const r = await api.listInventoryItems(token!, { active: true, limit: 1 });
      return r.items.length > 0;
    },
  });

  // ── Checklist items ───────────────────────────────────────────────────────

  const allItems: ChecklistItem[] = [
    {
      id: 'services',
      icon: Briefcase,
      title: 'Serviços',
      description: 'Tipos de atendimento, preços e duração',
      tab: 'servicos',
      status: resolveStatus(servicesQ.isLoading, servicesQ.isError, servicesQ.error, servicesQ.data, false),
      optional: false,
      ownerOnly: false,
    },
    {
      id: 'professionals',
      icon: Users,
      title: 'Profissionais',
      description: 'Quem atende na agenda (Equipe → Profissionais da agenda)',
      tab: 'equipe',
      status: resolveStatus(professionalsQ.isLoading, professionalsQ.isError, professionalsQ.error, professionalsQ.data, false),
      optional: false,
      ownerOnly: true,
    },
    {
      id: 'patients',
      icon: User,
      title: 'Pacientes',
      description: 'Histórico administrativo dos pacientes',
      tab: 'pacientes',
      status: resolveStatus(patientsQ.isLoading, patientsQ.isError, patientsQ.error, patientsQ.data, false),
      optional: false,
      ownerOnly: false,
    },
    {
      id: 'appointments',
      icon: CalendarDays,
      title: 'Agendamento',
      description: 'Primeiro horário marcado na agenda',
      tab: 'agenda',
      status: resolveStatus(appointmentsQ.isLoading, appointmentsQ.isError, appointmentsQ.error, appointmentsQ.data, false),
      optional: false,
      ownerOnly: false,
    },
    {
      id: 'charges',
      icon: Wallet,
      title: 'Cobrança',
      description: 'Primeiro recebimento registrado',
      tab: 'financeiro',
      status: resolveStatus(chargesQ.isLoading, chargesQ.isError, chargesQ.error, chargesQ.data, false),
      optional: false,
      ownerOnly: false,
    },
    {
      id: 'insurance',
      icon: HeartHandshake,
      title: 'Convênios',
      description: 'Operadoras e planos aceitos pela clínica',
      tab: 'convenios',
      status: resolveStatus(insuranceQ.isLoading, insuranceQ.isError, insuranceQ.error, insuranceQ.data, true),
      optional: true,
      ownerOnly: false,
    },
    {
      id: 'inventory',
      icon: Boxes,
      title: 'Estoque',
      description: 'Materiais e insumos da clínica',
      tab: 'estoque',
      status: resolveStatus(inventoryQ.isLoading, inventoryQ.isError, inventoryQ.error, inventoryQ.data, true),
      optional: true,
      ownerOnly: false,
    },
  ];

  // Filter: hide ownerOnly items for non-owners.
  const items = allItems.filter((item) => !item.ownerOnly || isOwner);

  // Progress: count only non-optional items.
  const required = items.filter((item) => !item.optional);
  const doneCount = required.filter(
    (item) => item.status === 'done',
  ).length;
  const totalRequired = required.length;
  const progressPct = totalRequired > 0 ? Math.round((doneCount / totalRequired) * 100) : 0;
  const anyLoading = items.some((item) => item.status === 'loading');

  // Solo-practitioner nudge: the owner is often the main professional, but
  // nothing auto-registers them as a "Profissional da agenda" (no auto-seed,
  // no backend change). Surface a clear nudge only while no professional exists.
  const showSoloNudge =
    isOwner && !professionalsQ.isLoading && professionalsQ.data === false;

  return (
    <section className={styles.root} aria-labelledby="setup-title">
      <div className={styles.header}>
        <div>
          <h3 id="setup-title" className={styles.title}>Configure sua clínica</h3>
          <p className={styles.subtitle}>
            Siga estes passos para começar a usar o ClinicBridge com seus próprios dados.
          </p>
        </div>
        {!anyLoading && (
          <span className={styles.counter} aria-live="polite">
            {doneCount} de {totalRequired} concluídos
          </span>
        )}
      </div>

      {!anyLoading && (
        <div
          className={styles.progressBar}
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${doneCount} de ${totalRequired} itens concluídos`}
        >
          <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
        </div>
      )}

      {showSoloNudge && (
        <div className={styles.soloNudge} role="note">
          <User size={16} aria-hidden="true" />
          <div className={styles.soloNudgeBody}>
            <p className={styles.soloNudgeText}>
              <strong>Você atende na clínica?</strong> Cadastre você mesmo como
              profissional da agenda para marcar e organizar os atendimentos.
            </p>
            <button
              type="button"
              className={styles.soloNudgeBtn}
              onClick={() => onNavigate('equipe')}
            >
              Cadastrar profissional
              <ArrowRight size={12} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      <ul className={styles.list} aria-label="Passos de configuração">
        {items.map((item) => {
          const Icon = item.icon;
          const isDone = item.status === 'done' || item.status === 'optional-done';
          const isRestricted = item.status === 'restricted';
          const isLoading = item.status === 'loading';

          const badgeLabel =
            isRestricted ? 'Restrito'
            : isDone ? 'Concluído'
            : item.optional ? 'Opcional'
            : 'Pendente';

          return (
            <li
              key={item.id}
              className={[
                styles.item,
                isDone ? styles.itemDone : '',
                isRestricted ? styles.itemRestricted : '',
              ].filter(Boolean).join(' ')}
            >
              {/* Status icon */}
              <span className={styles.statusIcon}>
                {isLoading ? (
                  <Loader2 size={16} className={styles.spinner} aria-label="Verificando…" />
                ) : isRestricted ? (
                  <Lock size={16} className={styles.iconRestricted} aria-hidden="true" />
                ) : isDone ? (
                  <CheckCircle2 size={16} className={styles.iconDone} aria-hidden="true" />
                ) : (
                  <Circle size={16} className={styles.iconPending} aria-hidden="true" />
                )}
              </span>

              {/* Module icon */}
              <Icon size={15} className={styles.moduleIcon} aria-hidden="true" />

              {/* Info */}
              <div className={styles.info}>
                <span className={styles.itemTitle}>{item.title}</span>
                <span className={styles.itemDesc}>{item.description}</span>
              </div>

              {/* Badge */}
              <span
                className={[
                  styles.badge,
                  isDone ? styles.badgeDone
                  : isRestricted ? styles.badgeRestricted
                  : item.optional ? styles.badgeOptional
                  : styles.badgePending,
                ].join(' ')}
              >
                {badgeLabel}
              </span>

              {/* Action button — hidden when restricted */}
              {!isRestricted && (
                <button
                  type="button"
                  className={styles.openBtn}
                  onClick={() => onNavigate(item.tab)}
                  aria-label={`Abrir ${item.title}`}
                >
                  Abrir
                  <ArrowRight size={12} aria-hidden="true" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
