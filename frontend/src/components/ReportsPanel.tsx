// ReportsPanel.tsx — Sprint 4.5C (polish 4.5D) — ADR 0014
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
//
// 4.5D POLISH:
// - "Resumo do período" hero strip (4 signals; deduped queryKeys — sem fetch extra).
// - Frases interpretativas por bloco (sem julgamento, só contexto operacional).
// - Financeiro: ordem dos cards privilegia Recebido/Em aberto/Vencido; "Cancelado" no fim.
// - Agenda × Financeiro: subtítulo interno "Pontos de atenção".
// - Pacientes: hint "últimos 90 dias" sem tom de abandono.
// - Card de acesso restrito com tom calmo (não de erro).

import { useMemo, useState } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  RefreshCw,
  CalendarDays,
  Wallet,
  Users,
  Activity,
  AlertCircle,
  ShieldOff,
  Clock,
  HelpCircle,
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

function formatDateBr(iso: string): string {
  // "2026-05-01" → "01/05/2026"
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
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
  if (preset === 'last30') {
    return { date_from: isoOffsetDays(-29), date_to: todayIso(), preset };
  }
  // currentMonth
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
      <ShieldOff size={18} className={styles.blockedIcon} aria-hidden="true" />
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

type ApptResult = UseQueryResult<AppointmentReportResponse, ApiError>;
type FinResult = UseQueryResult<FinancialReportResponse, ApiError>;
type PatResult = UseQueryResult<PatientsReportResponse, ApiError>;
type AgFinResult = UseQueryResult<AgendaFinancialReportResponse, ApiError>;

function AppointmentsSection({ query }: { query: ApptResult }): JSX.Element {
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

  const data = query.data?.data;
  const attention = query.data?.attention ?? [];
  if (!data) return <SectionError message="Sem dados para este período." />;

  // Frase interpretativa (sem julgamento, só contexto)
  let caption: string;
  if (data.total === 0) {
    caption = 'Sem consultas no período. A taxa de comparecimento só aparece quando houver pelo menos uma consulta confirmada ou realizada.';
  } else {
    const realizadas = data.completed;
    const naoRealizadas = data.cancelled + data.no_show;
    if (data.completed + data.confirmed === 0) {
      caption = `${formatInt(data.total)} consulta${data.total !== 1 ? 's' : ''} no período — nenhuma confirmada ou realizada ainda.`;
    } else if (naoRealizadas === 0) {
      caption = `${formatInt(data.total)} consulta${data.total !== 1 ? 's' : ''} no período, sem faltas ou cancelamentos.`;
    } else {
      caption = `${formatInt(data.total)} consulta${data.total !== 1 ? 's' : ''} no período. ${formatInt(realizadas)} realizada${realizadas !== 1 ? 's' : ''}, ${formatInt(naoRealizadas)} entre faltas e cancelamentos.`;
    }
  }

  return (
    <>
      <p className={styles.caption}>{caption}</p>

      <div className={styles.metricRow}>
        <MetricCard label="Total de consultas" value={formatInt(data.total)} tone="info" />
        <MetricCard label="Realizadas" value={formatInt(data.completed)} tone="success" />
        <MetricCard label="Confirmadas" value={formatInt(data.confirmed)} />
        <MetricCard label="Agendadas" value={formatInt(data.scheduled)} />
        <MetricCard label="Faltas" value={formatInt(data.no_show)} tone={data.no_show > 0 ? 'danger' : 'default'} />
        <MetricCard label="Canceladas" value={formatInt(data.cancelled)} />
        <MetricCard
          label="Taxa de comparecimento"
          value={data.total > 0 ? formatPercent(data.attendance_rate) : '—'}
          hint={
            data.total === 0
              ? 'sem consultas no período'
              : 'realizadas + confirmadas / total'
          }
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
            Marcadas como agendada ou confirmada, mas o horário já passou.
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
        <p className={styles.captionMuted}>Nenhuma consulta ativa em atraso neste período.</p>
      ) : null}
    </>
  );
}

// ── R-B: Financeiro ─────────────────────────────────────────────────────────

function FinancialSection({ query }: { query: FinResult }): JSX.Element {
  if (query.isLoading) return <p className={styles.loading}>Carregando financeiro…</p>;
  if (query.isError) {
    if (is403(query.error)) {
      return (
        <SectionBlocked
          title="Área financeira restrita"
          message="Seu acesso atual não permite visualizar indicadores financeiros. Os blocos Agenda e Pacientes continuam disponíveis."
        />
      );
    }
    return <SectionError message={safeErrorMessage(query.error)} />;
  }

  const data = query.data?.data;
  if (!data) return <SectionError message="Sem dados para este período." />;

  const hasPaidMethods = data.by_payment_method.length > 0;

  // Frase interpretativa: Recebido depende do período; Em aberto / Vencido são saldo atual.
  let caption: string;
  if (data.received_cents === 0 && data.pending_cents === 0 && data.overdue_cents === 0) {
    caption = 'Nenhuma cobrança recebida ou pendente. "Em aberto" e "Vencido" refletem o saldo atual da clínica.';
  } else if (data.overdue_cents > 0) {
    caption = `${formatCents(data.overdue_cents)} em cobranças vencidas. "Em aberto" e "Vencido" refletem o saldo atual da clínica — não dependem do período.`;
  } else {
    caption = '"Em aberto" e "Vencido" refletem o saldo atual da clínica — não dependem do período. "Recebido" e "Cancelado" são do período selecionado.';
  }

  return (
    <>
      <p className={styles.caption}>{caption}</p>

      {/* Ordem privilegia os 3 sinais de leitura rápida; counts depois; Cancelado por último. */}
      <div className={styles.metricRow}>
        <MetricCard label="Recebido" value={formatCents(data.received_cents)} tone="success" />
        <MetricCard label="Em aberto" value={formatCents(data.pending_cents)} tone="info" />
        <MetricCard
          label="Vencido"
          value={formatCents(data.overdue_cents)}
          tone={data.overdue_cents > 0 ? 'danger' : 'default'}
        />
        <MetricCard
          label="Cobranças pagas"
          value={formatInt(data.count_paid)}
          hint="no período"
        />
        <MetricCard
          label="Cobranças pendentes"
          value={formatInt(data.count_pending)}
          hint={data.count_overdue > 0 ? `${formatInt(data.count_overdue)} vencidas` : 'saldo atual'}
        />
        <MetricCard label="Cancelado" value={formatCents(data.canceled_cents)} hint="no período" />
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
          <p className={styles.captionMuted}>Sem cobranças recebidas no período.</p>
        )}
      </div>
    </>
  );
}

// ── R-C: Pacientes ──────────────────────────────────────────────────────────

function PatientsSection({ query }: { query: PatResult }): JSX.Element {
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

  const data = query.data?.data;
  const noApptDays = query.data?.no_appt_days ?? 90;
  if (!data) return <SectionError message="Sem dados para este período." />;

  const caption =
    data.new_in_period === 0
      ? `Nenhum paciente novo no período. Base ativa: ${formatInt(data.total_active)}.`
      : `${formatInt(data.new_in_period)} paciente${data.new_in_period !== 1 ? 's novos' : ' novo'} no período. Base ativa: ${formatInt(data.total_active)}.`;

  return (
    <>
      <p className={styles.caption}>{caption}</p>

      <div className={styles.metricRow}>
        <MetricCard label="Pacientes ativos" value={formatInt(data.total_active)} tone="info" />
        <MetricCard label="Novos no período" value={formatInt(data.new_in_period)} tone="success" />
        <MetricCard
          label="Com agendamento no período"
          value={formatInt(data.with_appointment_in_period)}
        />
        <MetricCard
          label={`Sem agendamento há mais de ${formatInt(noApptDays)} dias`}
          value={formatInt(data.without_recent_appointment)}
          tone={data.without_recent_appointment > 0 ? 'warning' : 'default'}
        />
        <MetricCard label="Arquivados" value={formatInt(data.total_archived)} />
      </div>
    </>
  );
}

// ── R-D: Agenda × Financeiro ────────────────────────────────────────────────

function AgendaFinancialSection({ query }: { query: AgFinResult }): JSX.Element {
  if (query.isLoading) return <p className={styles.loading}>Carregando agenda × financeiro…</p>;
  if (query.isError) {
    if (is403(query.error)) {
      return (
        <SectionBlocked
          title="Área financeira restrita"
          message="Seu acesso atual não permite cruzar agenda e cobranças. Os blocos Agenda e Pacientes continuam disponíveis."
        />
      );
    }
    return <SectionError message={safeErrorMessage(query.error)} />;
  }

  const data = query.data?.data;
  if (!data) return <SectionError message="Sem dados para este período." />;

  const attentionCount =
    data.without_charge + data.cancelled_with_pending + data.charge_canceled_appt_active;

  // Frase interpretativa
  let caption: string;
  if (data.appointments_total === 0) {
    caption = 'Sem consultas no período para cruzar com cobranças.';
  } else if (attentionCount === 0) {
    caption = `${formatInt(data.appointments_total)} consulta${data.appointments_total !== 1 ? 's' : ''} no período sem pontos de atenção operacional.`;
  } else {
    caption = `${formatInt(data.appointments_total)} consulta${data.appointments_total !== 1 ? 's' : ''} no período · ${formatInt(attentionCount)} ponto${attentionCount !== 1 ? 's' : ''} de atenção operacional a revisar.`;
  }

  return (
    <>
      <p className={styles.caption}>{caption}</p>

      <div className={styles.metricRow}>
        <MetricCard label="Consultas no período" value={formatInt(data.appointments_total)} tone="info" />
        <MetricCard
          label="Sem cobrança"
          value={formatInt(data.without_charge)}
          tone={data.without_charge > 0 ? 'warning' : 'default'}
        />
        <MetricCard label="Pagamento pendente" value={formatInt(data.with_pending_charge)} />
        <MetricCard label="Pagamento pago" value={formatInt(data.with_paid_charge)} tone="success" />
        <MetricCard
          label="Pagamento vencido"
          value={formatInt(data.with_overdue_charge)}
          tone={data.with_overdue_charge > 0 ? 'danger' : 'default'}
        />
        <MetricCard label="Cobrança cancelada" value={formatInt(data.with_canceled_charge)} />
      </div>

      <div className={styles.subBlock}>
        <h4 className={styles.subTitle}>Pontos de atenção</h4>
        <ul className={styles.flagsList}>
          <li className={styles.flagItem}>
            <span>Consulta cancelada com cobrança ainda pendente</span>
            <strong className={data.cancelled_with_pending > 0 ? styles.flagValueWarn : ''}>
              {formatInt(data.cancelled_with_pending)}
            </strong>
          </li>
          <li className={styles.flagItem}>
            <span>Cobrança cancelada com consulta ainda ativa</span>
            <strong className={data.charge_canceled_appt_active > 0 ? styles.flagValueWarn : ''}>
              {formatInt(data.charge_canceled_appt_active)}
            </strong>
          </li>
        </ul>
      </div>
    </>
  );
}

// ── Hero strip ──────────────────────────────────────────────────────────────

interface HeroProps {
  appt: ApptResult;
  fin: FinResult;
  pat: PatResult;
}

function HeroSummary({ appt, fin, pat }: HeroProps): JSX.Element {
  // Cada cell trata seu próprio estado: loading / 403 / erro / valor.
  function apptCell(): { value: string; hint?: string } {
    if (appt.isLoading) return { value: '—', hint: 'carregando' };
    if (appt.isError) return { value: '—', hint: 'sem dados' };
    return { value: formatInt(appt.data?.data.total ?? 0) };
  }

  function receivedCell(): { value: string; hint?: string; restricted?: boolean } {
    if (fin.isLoading) return { value: '—', hint: 'carregando' };
    if (is403(fin.error)) return { value: '—', hint: 'acesso restrito', restricted: true };
    if (fin.isError) return { value: '—', hint: 'sem dados' };
    return { value: formatCents(fin.data?.data.received_cents ?? 0) };
  }

  function openCell(): { value: string; hint?: string; restricted?: boolean; tone: 'info' | 'danger' | 'default' } {
    if (fin.isLoading) return { value: '—', hint: 'carregando', tone: 'default' };
    if (is403(fin.error)) return { value: '—', hint: 'acesso restrito', restricted: true, tone: 'default' };
    if (fin.isError) return { value: '—', hint: 'sem dados', tone: 'default' };
    const open = fin.data?.data.pending_cents ?? 0;
    const overdue = fin.data?.data.overdue_cents ?? 0;
    return {
      value: formatCents(open),
      hint: overdue > 0 ? `${formatCents(overdue)} vencido` : 'saldo atual',
      tone: overdue > 0 ? 'danger' : 'info',
    };
  }

  function newPatCell(): { value: string; hint?: string } {
    if (pat.isLoading) return { value: '—', hint: 'carregando' };
    if (pat.isError) return { value: '—', hint: 'sem dados' };
    return { value: formatInt(pat.data?.data.new_in_period ?? 0) };
  }

  const received = receivedCell();
  const open = openCell();

  return (
    <section className={styles.hero} aria-label="Resumo do período" data-tour-id="reports-summary">
      <h3 className={styles.heroTitle}>Resumo do período</h3>
      <div className={styles.heroGrid}>
        <div className={styles.heroCell}>
          <span className={styles.heroLabel}>Consultas no período</span>
          <span className={styles.heroValue}>{apptCell().value}</span>
        </div>

        <div className={`${styles.heroCell} ${received.restricted ? styles.heroCellMuted : ''}`}>
          <span className={styles.heroLabel}>Recebido</span>
          <span className={`${styles.heroValue} ${received.restricted ? '' : styles.heroValueSuccess}`}>
            {received.value}
          </span>
          {received.hint && <span className={styles.heroHint}>{received.hint}</span>}
        </div>

        <div className={`${styles.heroCell} ${open.restricted ? styles.heroCellMuted : ''}`}>
          <span className={styles.heroLabel}>Em aberto</span>
          <span
            className={`${styles.heroValue} ${
              open.tone === 'danger'
                ? styles.heroValueDanger
                : open.tone === 'info'
                  ? styles.heroValueInfo
                  : ''
            }`}
          >
            {open.value}
          </span>
          {open.hint && <span className={styles.heroHint}>{open.hint}</span>}
        </div>

        <div className={styles.heroCell}>
          <span className={styles.heroLabel}>Pacientes novos</span>
          <span className={styles.heroValue}>{newPatCell().value}</span>
        </div>
      </div>
    </section>
  );
}

// ── Root ────────────────────────────────────────────────────────────────────

export function ReportsPanel({ onAuriTour }: { onAuriTour?: () => void } = {}): JSX.Element {
  const { user } = useAuth();
  const token = getToken();

  // Backend gateia em requireRole(['dono_clinica','secretaria']) → todos os
  // usuários reais que chegam aqui têm um desses papéis (admin_sistema sai no
  // requireClinic com no_clinic_context).
  //
  // NOTA 4.5D: frontend NÃO consegue distinguir um secretaria puro de um
  // secretaria + profissional_clinico (o /me não devolve grants clínicos e o
  // /clinical/roles é owner-only). Por isso a aba "Relatórios" segue visível
  // para todo papel administrativo; profissional recebe blocos financeiros
  // restritos com tom calmo (decisão registrada na sprint 4.5D).
  const isPapelAllowed =
    user?.papel === 'dono_clinica' || user?.papel === 'secretaria';

  // Default to "last 30 days": on the first days of a month, "current month"
  // shows an almost-empty report; a rolling 30-day window keeps the summary
  // populated and legible for non-technical staff.
  const [preset, setPreset] = useState<ReportPeriodPreset>('last30');
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

  // ── 4 queries no root ────────────────────────────────────────────────────
  //
  // Levantar as queries para o root permite que o hero strip e as 4 seções
  // leiam o MESMO cache (queryKey idêntica em useQuery deduplica naturalmente —
  // mas centralizar evita re-subscription churn e mantém a árvore mais simples).
  // Cada `useQuery` é tipado pelo helper de api.ts e usa `ApiError` como TError.
  //
  // `enabled` desabilita o fetch quando o usuário não é admin (defensive — o
  // gate principal já bloqueia a tela inteira nesse caso).
  const enabled = !!token && isPapelAllowed;

  const apptQuery = useQuery<AppointmentReportResponse, ApiError>({
    queryKey: ['reports', 'appointments', period.date_from, period.date_to, refreshKey],
    queryFn: () =>
      api.getAppointmentReport(token ?? '', {
        date_from: period.date_from,
        date_to: period.date_to,
      }),
    staleTime: 30_000,
    retry: false,
    enabled,
  });

  const finQuery = useQuery<FinancialReportResponse, ApiError>({
    queryKey: ['reports', 'financial', period.date_from, period.date_to, refreshKey],
    queryFn: () =>
      api.getFinancialReport(token ?? '', {
        date_from: period.date_from,
        date_to: period.date_to,
      }),
    staleTime: 30_000,
    retry: false,
    enabled,
  });

  const patQuery = useQuery<PatientsReportResponse, ApiError>({
    queryKey: ['reports', 'patients', period.date_from, period.date_to, refreshKey],
    queryFn: () =>
      api.getPatientsReport(token ?? '', {
        date_from: period.date_from,
        date_to: period.date_to,
        no_appt_days: 90,
      }),
    staleTime: 30_000,
    retry: false,
    enabled,
  });

  const agFinQuery = useQuery<AgendaFinancialReportResponse, ApiError>({
    queryKey: ['reports', 'agenda-financial', period.date_from, period.date_to, refreshKey],
    queryFn: () =>
      api.getAgendaFinancialReport(token ?? '', {
        date_from: period.date_from,
        date_to: period.date_to,
      }),
    staleTime: 30_000,
    retry: false,
    enabled,
  });

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
            Agenda, financeiro e pacientes em um só lugar — sem dados clínicos.
          </p>
        </div>
        <div className={styles.notice}>
          Apenas dados administrativos e financeiros. Nenhum dado clínico é exibido.
        </div>
        {onAuriTour && (
          <button type="button" className={styles.auriBtn} onClick={onAuriTour} title="Auri explica este módulo">
            <HelpCircle size={15} aria-hidden="true" />
            Auri explica
          </button>
        )}
      </header>

      <section className={styles.filtersBar} aria-label="Filtros de período" data-tour-id="reports-filters">
        <div className={styles.presetGroup} role="tablist">
          {(
            [
              { key: 'today', label: 'Hoje' },
              { key: 'last7', label: 'Últimos 7 dias' },
              { key: 'last30', label: 'Últimos 30 dias' },
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
        Período: <strong>{formatDateBr(period.date_from)}</strong> a{' '}
        <strong>{formatDateBr(period.date_to)}</strong>
      </p>

      <HeroSummary appt={apptQuery} fin={finQuery} pat={patQuery} />

      <section className={styles.reportBlock} aria-labelledby="rep-appointments">
        <h3 id="rep-appointments" className={styles.blockTitle}>
          <CalendarDays size={16} aria-hidden="true" />
          Agenda
        </h3>
        <AppointmentsSection query={apptQuery} />
      </section>

      <section className={styles.reportBlock} aria-labelledby="rep-financial">
        <h3 id="rep-financial" className={styles.blockTitle}>
          <Wallet size={16} aria-hidden="true" />
          Financeiro
        </h3>
        <FinancialSection query={finQuery} />
      </section>

      <section className={styles.reportBlock} aria-labelledby="rep-patients">
        <h3 id="rep-patients" className={styles.blockTitle}>
          <Users size={16} aria-hidden="true" />
          Pacientes
        </h3>
        <PatientsSection query={patQuery} />
      </section>

      <section className={styles.reportBlock} aria-labelledby="rep-agenda-fin">
        <h3 id="rep-agenda-fin" className={styles.blockTitle}>
          <Activity size={16} aria-hidden="true" />
          Agenda × Financeiro
        </h3>
        <AgendaFinancialSection query={agFinQuery} />
      </section>

      <p className={styles.disclaimer}>
        Relatórios gerados na hora. Não substituem contabilidade nem emissão fiscal.
        A exportação e a impressão chegam em breve.
      </p>
    </div>
  );
}
