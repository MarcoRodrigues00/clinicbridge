// ReportsPanel.tsx — Sprint 4.5C — ADR 0014
//
// Relatórios Gerenciais v0.1. Consome os 4 endpoints administrativos de
// /reports/* sem expor dados clínicos nem PII de paciente.
//
// SECURITY:
// - Nenhum payload em console.log / localStorage / sessionStorage / URL.
// - Token vai apenas via header Authorization (api.ts).
// - Sem dangerouslySetInnerHTML.
// - Sem export (CSV/PDF/XLSX) — fora do escopo v0.1.
// - R-B e R-D podem retornar 403 (profissional_clinico ou backend negando).
//   O painel TRATA por relatório: 403 vira card "Acesso restrito" sem
//   derrubar o painel inteiro.
// - Lista "Em atraso" (R-A) mostra APENAS contador + entradas com horário e
//   status traduzido. NUNCA renderiza o UUID do appointment.

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  RefreshCw,
  CalendarDays,
  Wallet,
  Users,
  Activity,
  AlertCircle,
  ShieldOff,
  Clock,
} from 'lucide-react';
import { useAuth } from '../services/AuthProvider';
import { getToken } from '../services/authStorage';
import { api, ApiError } from '../services/api';
import type {
  AppointmentReportResponse,
  FinancialReportResponse,
  PatientsReportResponse,
  AgendaFinancialReportResponse,
  FinancialPaymentMethod,
  ReportPeriodPreset,
} from '../services/api';
import styles from './ReportsPanel.module.css';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCents(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}

function formatInt(n: number): string {
  return new Intl.NumberFormat('pt-BR').format(n);
}

function formatPercent(rate: number): string {
  // backend retorna 0..1
  return `${Math.round(rate * 100)}%`;
}

function todayIso(): string {
  // UTC date stamp — alinha com o backend que usa Date.UTC.
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return d.toISOString().slice(0, 10);
}

function startOfMonthIso(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return d.toISOString().slice(0, 10);
}

function isoOffsetDays(days: number): string {
  const now = new Date();
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function formatTime(iso: string): string {
  // "2026-05-27T14:30:00.000Z" → "27/05 14:30"
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm} ${hh}:${mi}`;
}

function safeErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'report_invalid_filters') {
      return err.message; // mensagens vindas do backend já são amigáveis em PT
    }
    if (err.status === 403) {
      return 'Seu acesso atual não permite ver este relatório.';
    }
    if (err.status === 401) {
      return 'Sessão expirada. Faça login novamente.';
    }
    return 'Não foi possível carregar este relatório agora.';
  }
  return 'Não foi possível carregar este relatório agora.';
}

function is403(err: unknown): boolean {
  return err instanceof ApiError && err.status === 403;
}

const APPT_STATUS_LABELS: Record<string, string> = {
  scheduled: 'Agendada',
  confirmed: 'Confirmada',
  completed: 'Realizada',
  cancelled: 'Cancelada',
  rescheduled: 'Remarcada',
  no_show: 'Falta',
};

const PAYMENT_METHOD_LABELS: Record<FinancialPaymentMethod, string> = {
  cash: 'Dinheiro',
  pix: 'Pix',
  card: 'Cartão',
  bank_transfer: 'Transferência',
  other: 'Outro',
};

// ── Period preset → {date_from, date_to} ────────────────────────────────────

interface PeriodValue {
  date_from: string;
  date_to: string;
  preset: ReportPeriodPreset;
}

function resolvePreset(preset: ReportPeriodPreset): PeriodValue {
  if (preset === 'today') {
    const t = todayIso();
    return { date_from: t, date_to: t, preset };
  }
  if (preset === 'last7') {
    return { date_from: isoOffsetDays(-6), date_to: todayIso(), preset };
  }
  // currentMonth (default)
  return { date_from: startOfMonthIso(), date_to: todayIso(), preset };
}

// ── Generic small card ──────────────────────────────────────────────────────

interface MetricCardProps {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}

function MetricCard({ label, value, hint, tone = 'default' }: MetricCardProps): JSX.Element {
  return (
    <div className={`${styles.metric} ${tone !== 'default' ? styles[`metric_${tone}`] : ''}`}>
      <span className={styles.metricLabel}>{label}</span>
      <span className={`${styles.metricValue} ${tone !== 'default' ? styles[`metricValue_${tone}`] : ''}`}>
        {value}
      </span>
      {hint && <span className={styles.metricHint}>{hint}</span>}
    </div>
  );
}

interface SectionBlockedCardProps {
  title: string;
  message: string;
}

function SectionBlocked({ title, message }: SectionBlockedCardProps): JSX.Element {
  return (
    <div className={styles.blocked}>
      <ShieldOff size={20} className={styles.blockedIcon} aria-hidden="true" />
      <div>
        <strong className={styles.blockedTitle}>{title}</strong>
        <p className={styles.blockedDesc}>{message}</p>
      </div>
    </div>
  );
}

interface SectionErrorProps {
  message: string;
}

function SectionError({ message }: SectionErrorProps): JSX.Element {
  return (
    <div className={styles.errorBox}>
      <AlertCircle size={18} aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

// ── R-A: Agenda / Operação ──────────────────────────────────────────────────

interface ReportSectionProps {
  token: string;
  period: PeriodValue;
  refreshKey: number;
}

function AppointmentsSection({ token, period, refreshKey }: ReportSectionProps): JSX.Element {
  const query = useQuery({
    queryKey: ['reports', 'appointments', period.date_from, period.date_to, refreshKey, token],
    queryFn: () =>
      api.getAppointmentReport(token, {
        date_from: period.date_from,
        date_to: period.date_to,
      }),
    staleTime: 30_000,
    retry: false,
  });

  if (query.isLoading) return <p className={styles.loading}>Carregando agenda…</p>;
  if (query.isError) {
    if (is403(query.error)) {
      return (
        <SectionBlocked
          title="Acesso restrito"
          message="Seu acesso atual não permite visualizar o relatório de agenda."
        />
      );
    }
    return <SectionError message={safeErrorMessage(query.error)} />;
  }

  const data: AppointmentReportResponse['data'] | undefined = query.data?.data;
  const attention = query.data?.attention ?? [];
  if (!data) return <SectionError message="Sem dados para este período." />;

  return (
    <>
      <div className={styles.metricRow}>
        <MetricCard label="Total de consultas" value={formatInt(data.total)} tone="info" />
        <MetricCard label="Agendadas" value={formatInt(data.scheduled)} />
        <MetricCard label="Confirmadas" value={formatInt(data.confirmed)} />
        <MetricCard label="Realizadas" value={formatInt(data.completed)} tone="success" />
        <MetricCard label="Canceladas" value={formatInt(data.cancelled)} tone="warning" />
        <MetricCard label="Faltas" value={formatInt(data.no_show)} tone="danger" />
        <MetricCard
          label="Taxa de comparecimento"
          value={data.total > 0 ? formatPercent(data.attendance_rate) : '—'}
          hint={data.total === 0 ? 'Sem consultas no período' : undefined}
          tone={data.total === 0 ? 'default' : 'success'}
        />
      </div>

      {attention.length > 0 ? (
        <div className={styles.attention}>
          <div className={styles.attentionHeader}>
            <AlertCircle size={16} aria-hidden="true" />
            <strong>
              {attention.length === 1
                ? '1 consulta ativa em atraso'
                : `${formatInt(attention.length)} consultas ativas em atraso`}
            </strong>
          </div>
          <p className={styles.attentionDesc}>
            Consultas marcadas como "agendada" ou "confirmada" cujo horário já passou.
            Atualize o status na aba <strong>Agenda</strong>.
          </p>
          <ul className={styles.attentionList}>
            {attention.slice(0, 8).map((row) => (
              // Renderiza só horário + status — NUNCA appointment_id como destaque.
              // Chave React usa o id, mas ele não aparece visualmente.
              <li key={row.appointment_id} className={styles.attentionItem}>
                <Clock size={13} aria-hidden="true" />
                <span className={styles.attentionWhen}>{formatTime(row.starts_at)}</span>
                <span className={styles.attentionStatus}>
                  {APPT_STATUS_LABELS[row.status] ?? 'Em aberto'}
                </span>
              </li>
            ))}
            {attention.length > 8 && (
              <li className={styles.attentionMore}>
                + {attention.length - 8} consulta{attention.length - 8 !== 1 ? 's' : ''} adicional(is).
              </li>
            )}
          </ul>
        </div>
      ) : data.total > 0 ? (
        <p className={styles.empty}>Nenhuma consulta ativa em atraso neste período.</p>
      ) : (
        <p className={styles.empty}>Sem dados para este período.</p>
      )}
    </>
  );
}

// ── R-B: Financeiro ─────────────────────────────────────────────────────────

function FinancialSection({ token, period, refreshKey }: ReportSectionProps): JSX.Element {
  const query = useQuery({
    queryKey: ['reports', 'financial', period.date_from, period.date_to, refreshKey, token],
    queryFn: () =>
      api.getFinancialReport(token, {
        date_from: period.date_from,
        date_to: period.date_to,
      }),
    staleTime: 30_000,
    retry: false,
  });

  if (query.isLoading) return <p className={styles.loading}>Carregando financeiro…</p>;
  if (query.isError) {
    if (is403(query.error)) {
      return (
        <SectionBlocked
          title="Área financeira restrita"
          message="Seu acesso atual não permite visualizar relatórios financeiros."
        />
      );
    }
    return <SectionError message={safeErrorMessage(query.error)} />;
  }

  const data: FinancialReportResponse['data'] | undefined = query.data?.data;
  if (!data) return <SectionError message="Sem dados para este período." />;

  const hasPaidMethods = data.by_payment_method.length > 0;

  return (
    <>
      <div className={styles.metricRow}>
        <MetricCard label="Recebido" value={formatCents(data.received_cents)} tone="success" />
        <MetricCard label="Em aberto" value={formatCents(data.pending_cents)} tone="info" />
        <MetricCard label="Vencido" value={formatCents(data.overdue_cents)} tone="danger" />
        <MetricCard label="Cancelado" value={formatCents(data.canceled_cents)} />
        <MetricCard
          label="Cobranças pagas"
          value={formatInt(data.count_paid)}
          hint="no período"
        />
        <MetricCard
          label="Cobranças pendentes"
          value={formatInt(data.count_pending)}
          hint={data.count_overdue > 0 ? `${formatInt(data.count_overdue)} vencidas` : 'saldo aberto'}
        />
      </div>

      <div className={styles.subBlock}>
        <h4 className={styles.subTitle}>Recebido por método</h4>
        {hasPaidMethods ? (
          <ul className={styles.methodList}>
            {data.by_payment_method.map((row) => (
              <li key={row.method} className={styles.methodItem}>
                <span className={styles.methodLabel}>
                  {PAYMENT_METHOD_LABELS[row.method] ?? row.method}
                </span>
                <span className={styles.methodTotal}>{formatCents(row.total_cents)}</span>
                <span className={styles.methodCount}>
                  {formatInt(row.count)} cobrança{row.count !== 1 ? 's' : ''}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>Sem cobranças recebidas no período.</p>
        )}
      </div>
    </>
  );
}

// ── R-C: Pacientes ──────────────────────────────────────────────────────────

function PatientsSection({ token, period, refreshKey }: ReportSectionProps): JSX.Element {
  // no_appt_days fixo em 90 dias no v0.1 (sem controle dedicado na UI).
  const query = useQuery({
    queryKey: ['reports', 'patients', period.date_from, period.date_to, refreshKey, token],
    queryFn: () =>
      api.getPatientsReport(token, {
        date_from: period.date_from,
        date_to: period.date_to,
        no_appt_days: 90,
      }),
    staleTime: 30_000,
    retry: false,
  });

  if (query.isLoading) return <p className={styles.loading}>Carregando pacientes…</p>;
  if (query.isError) {
    if (is403(query.error)) {
      return (
        <SectionBlocked
          title="Acesso restrito"
          message="Seu acesso atual não permite visualizar o relatório de pacientes."
        />
      );
    }
    return <SectionError message={safeErrorMessage(query.error)} />;
  }

  const data: PatientsReportResponse['data'] | undefined = query.data?.data;
  const noApptDays = query.data?.no_appt_days ?? 90;
  if (!data) return <SectionError message="Sem dados para este período." />;

  return (
    <div className={styles.metricRow}>
      <MetricCard label="Pacientes ativos" value={formatInt(data.total_active)} tone="info" />
      <MetricCard label="Novos no período" value={formatInt(data.new_in_period)} tone="success" />
      <MetricCard
        label="Com agendamento no período"
        value={formatInt(data.with_appointment_in_period)}
      />
      <MetricCard
        label="Sem agendamento recente"
        value={formatInt(data.without_recent_appointment)}
        hint={`últimos ${formatInt(noApptDays)} dias`}
        tone={data.without_recent_appointment > 0 ? 'warning' : 'default'}
      />
      <MetricCard label="Arquivados" value={formatInt(data.total_archived)} />
    </div>
  );
}

// ── R-D: Agenda × Financeiro ────────────────────────────────────────────────

function AgendaFinancialSection({ token, period, refreshKey }: ReportSectionProps): JSX.Element {
  const query = useQuery({
    queryKey: ['reports', 'agenda-financial', period.date_from, period.date_to, refreshKey, token],
    queryFn: () =>
      api.getAgendaFinancialReport(token, {
        date_from: period.date_from,
        date_to: period.date_to,
      }),
    staleTime: 30_000,
    retry: false,
  });

  if (query.isLoading) return <p className={styles.loading}>Carregando agenda × financeiro…</p>;
  if (query.isError) {
    if (is403(query.error)) {
      return (
        <SectionBlocked
          title="Área financeira restrita"
          message="Seu acesso atual não permite cruzar agenda e cobranças."
        />
      );
    }
    return <SectionError message={safeErrorMessage(query.error)} />;
  }

  const data: AgendaFinancialReportResponse['data'] | undefined = query.data?.data;
  if (!data) return <SectionError message="Sem dados para este período." />;

  return (
    <>
      <div className={styles.metricRow}>
        <MetricCard label="Consultas no período" value={formatInt(data.appointments_total)} tone="info" />
        <MetricCard label="Sem cobrança" value={formatInt(data.without_charge)} tone="warning" />
        <MetricCard label="Pagamento pendente" value={formatInt(data.with_pending_charge)} />
        <MetricCard label="Pagamento pago" value={formatInt(data.with_paid_charge)} tone="success" />
        <MetricCard label="Pagamento vencido" value={formatInt(data.with_overdue_charge)} tone="danger" />
        <MetricCard label="Cobrança cancelada" value={formatInt(data.with_canceled_charge)} />
      </div>
      <ul className={styles.flagsList}>
        <li className={styles.flagItem}>
          <strong>Consulta cancelada com cobrança pendente:</strong>{' '}
          <span>{formatInt(data.cancelled_with_pending)}</span>
        </li>
        <li className={styles.flagItem}>
          <strong>Cobrança cancelada com consulta ativa:</strong>{' '}
          <span>{formatInt(data.charge_canceled_appt_active)}</span>
        </li>
      </ul>
    </>
  );
}

// ── Root ────────────────────────────────────────────────────────────────────

export function ReportsPanel(): JSX.Element {
  const { user } = useAuth();
  const token = getToken();

  // Backend gateia em requireRole(['dono_clinica','secretaria']) → todos os
  // usuários reais que chegam aqui têm um desses papéis (admin_sistema sai no
  // requireClinic com no_clinic_context).
  const isPapelAllowed =
    user?.papel === 'dono_clinica' || user?.papel === 'secretaria';

  const [preset, setPreset] = useState<ReportPeriodPreset>('currentMonth');
  const [customFrom, setCustomFrom] = useState<string>(startOfMonthIso());
  const [customTo, setCustomTo] = useState<string>(todayIso());
  const [refreshKey, setRefreshKey] = useState(0);
  const [customError, setCustomError] = useState<string | null>(null);

  const period: PeriodValue = useMemo(() => {
    if (preset === 'custom') {
      return { date_from: customFrom, date_to: customTo, preset };
    }
    return resolvePreset(preset);
  }, [preset, customFrom, customTo]);

  function handleRefresh(): void {
    if (preset === 'custom') {
      if (!customFrom || !customTo) {
        setCustomError('Informe início e fim do período.');
        return;
      }
      if (customTo < customFrom) {
        setCustomError('A data final deve ser maior ou igual à data inicial.');
        return;
      }
    }
    setCustomError(null);
    setRefreshKey((n) => n + 1);
  }

  if (!token) {
    return (
      <div className={styles.accessBlocked}>
        <AlertCircle size={28} className={styles.accessBlockedIcon} aria-hidden="true" />
        <strong className={styles.accessBlockedTitle}>Sessão expirada</strong>
        <p className={styles.accessBlockedDesc}>
          Faça login novamente para acessar os relatórios.
        </p>
      </div>
    );
  }

  if (!isPapelAllowed) {
    return (
      <div className={styles.accessBlocked}>
        <ShieldOff size={28} className={styles.accessBlockedIcon} aria-hidden="true" />
        <strong className={styles.accessBlockedTitle}>Acesso restrito</strong>
        <p className={styles.accessBlockedDesc}>
          Esta área é restrita a responsáveis e funcionários administrativos da clínica.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>Relatórios</h2>
          <p className={styles.subtitle}>
            Acompanhe agenda, financeiro e pacientes sem expor dados clínicos.
          </p>
        </div>
        <div className={styles.notice}>
          Relatórios v0.1 usam apenas dados administrativos e financeiros.
          Nenhum dado clínico é exibido aqui.
        </div>
      </header>

      <section className={styles.filtersBar} aria-label="Filtros de período">
        <div className={styles.presetGroup} role="tablist">
          {(
            [
              { key: 'today', label: 'Hoje' },
              { key: 'last7', label: 'Últimos 7 dias' },
              { key: 'currentMonth', label: 'Mês atual' },
              { key: 'custom', label: 'Personalizado' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.key}
              type="button"
              role="tab"
              aria-selected={preset === opt.key}
              className={`${styles.presetBtn} ${preset === opt.key ? styles.presetBtnActive : ''}`}
              onClick={() => setPreset(opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {preset === 'custom' && (
          <div className={styles.customRange}>
            <label className={styles.rangeField}>
              <span>De</span>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </label>
            <label className={styles.rangeField}>
              <span>Até</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </label>
          </div>
        )}

        <button
          type="button"
          className={styles.refreshBtn}
          onClick={handleRefresh}
          title="Atualizar relatórios"
        >
          <RefreshCw size={15} aria-hidden="true" />
          Atualizar
        </button>
      </section>

      {customError && (
        <p className={styles.filterError} role="alert">{customError}</p>
      )}

      <p className={styles.periodLine}>
        Período: <strong>{period.date_from}</strong> a <strong>{period.date_to}</strong>
      </p>

      <section className={styles.reportBlock} aria-labelledby="rep-appointments">
        <h3 id="rep-appointments" className={styles.blockTitle}>
          <CalendarDays size={16} aria-hidden="true" />
          Agenda
        </h3>
        <AppointmentsSection token={token} period={period} refreshKey={refreshKey} />
      </section>

      <section className={styles.reportBlock} aria-labelledby="rep-financial">
        <h3 id="rep-financial" className={styles.blockTitle}>
          <Wallet size={16} aria-hidden="true" />
          Financeiro
        </h3>
        <FinancialSection token={token} period={period} refreshKey={refreshKey} />
      </section>

      <section className={styles.reportBlock} aria-labelledby="rep-patients">
        <h3 id="rep-patients" className={styles.blockTitle}>
          <Users size={16} aria-hidden="true" />
          Pacientes
        </h3>
        <PatientsSection token={token} period={period} refreshKey={refreshKey} />
      </section>

      <section className={styles.reportBlock} aria-labelledby="rep-agenda-fin">
        <h3 id="rep-agenda-fin" className={styles.blockTitle}>
          <Activity size={16} aria-hidden="true" />
          Agenda × Financeiro
        </h3>
        <AgendaFinancialSection token={token} period={period} refreshKey={refreshKey} />
      </section>

      <p className={styles.disclaimer}>
        Resumo do período. Relatórios on-demand; não substituem contabilidade ou
        emissão fiscal. Sem export ou impressão no momento.
      </p>
    </div>
  );
}
