// FinancialPanel.tsx — Sprint 4.4C (corr. 4.4C-fix) — ADR 0012
//
// Módulo Financeiro v0.1. Cobranças e recebimentos da clínica.
//
// SECURITY:
// - Nenhum dado financeiro em console.log, localStorage, sessionStorage ou URL.
// - notes e cancel_reason só aparecem na tela de detalhe (nunca na listagem).
// - staleTime: 0 em queries de detalhe (dados sensíveis, incluindo notes).
// - Botões destrutivos (cancelar/marcar pago) exigem confirmação em modal.
// - Observações: aviso explícito proibindo conteúdo clínico (ADR 0012 §10).
// - Sem dangerouslySetInnerHTML.
// - appointment_id omitido do formulário (Sprint 4.4E — API de agendamentos
//   por paciente não disponível no frontend ainda).
//
// BUG FIXES (Sprint 4.4C-fix):
// - limit: 100 (era 500; backend limita a max 100 por request → 400)
// - status: 'all' na query do map de lookup (eram excluídos pacientes
//   arquivados; cobranças podem referenciar pacientes arquivados/merged)
// - NewChargeForm filtra somente pacientes ativos no select

import { useState, useMemo, useEffect } from 'react';
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import {
  Plus,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Pencil,
  Receipt,
  AlertCircle,
  AlertTriangle,
  Clock,
  HelpCircle,
} from 'lucide-react';
import { useAuth } from '../services/AuthProvider';
import { getToken } from '../services/authStorage';
import { api, ApiError } from '../services/api';
import type {
  ClinicService,
  FinancialChargeStatus,
  FinancialPayerType,
  FinancialPaymentMethod,
  FinancialChargeListItem,
  FinancialChargeDetail,
  FinancialSummary,
  PublicPatient,
  PatientInsuranceListItem,
  InsuranceProvider,
} from '../services/api';
import styles from './FinancialPanel.module.css';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCents(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ISO date `days` ago (negative offset). Used to seed the default 30-day
// financial window so the "Recebido no período" summary stays populated even
// in the first days of a month (the backend summary otherwise defaults to the
// current month, which on day 1–3 looks empty for non-technical staff).
function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function isOverdue(charge: FinancialChargeListItem): boolean {
  return (
    charge.status === 'pending' &&
    charge.due_date !== null &&
    charge.due_date < todayIso()
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function safeErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return 'Erro inesperado. Tente novamente.';
}

function is403(err: unknown): boolean {
  return err instanceof ApiError && err.status === 403;
}

const PAYMENT_METHOD_LABELS: Record<FinancialPaymentMethod, string> = {
  cash: 'Dinheiro (espécie)',
  pix: 'Pix',
  card: 'Cartão (crédito/débito)',
  bank_transfer: 'Transferência bancária',
  other: 'Outro',
};

const STATUS_LABELS: Record<FinancialChargeStatus, string> = {
  pending: 'Pendente',
  paid: 'Pago',
  canceled: 'Cancelado',
};

// ── Status Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ charge }: { charge: FinancialChargeListItem }): JSX.Element {
  if (charge.status === 'paid') {
    return (
      <span className={`${styles.badge} ${styles.badgePaid}`}>
        <CheckCircle2 size={11} aria-hidden="true" />
        Pago
      </span>
    );
  }
  if (charge.status === 'canceled') {
    return (
      <span className={`${styles.badge} ${styles.badgeCanceled}`}>
        <XCircle size={11} aria-hidden="true" />
        Cancelado
      </span>
    );
  }
  if (isOverdue(charge)) {
    return (
      <span className={`${styles.badge} ${styles.badgeOverdue}`}>
        <AlertCircle size={11} aria-hidden="true" />
        Vencido
      </span>
    );
  }
  return (
    <span className={`${styles.badge} ${styles.badgePending}`}>
      <Clock size={11} aria-hidden="true" />
      Pendente
    </span>
  );
}

// ── Payer Badge ───────────────────────────────────────────────────────────────

const PAYER_LABELS: Record<string, string> = {
  private: 'Particular',
  insurance: 'Convênio',
  mixed: 'Misto',
};

function PayerBadge({ payer_type }: { payer_type: string | null }): JSX.Element {
  if (!payer_type) return <span className={styles.payerNull}>—</span>;
  const label = PAYER_LABELS[payer_type] ?? payer_type;
  const cls =
    payer_type === 'insurance'
      ? styles.payerInsurance
      : payer_type === 'mixed'
        ? styles.payerMixed
        : styles.payerPrivate;
  return <span className={`${styles.payerBadge} ${cls}`}>{label}</span>;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type PanelView = 'list' | 'new' | 'detail' | 'edit';

// ── View: List ────────────────────────────────────────────────────────────────

interface ListViewProps {
  token: string;
  patientById: Map<string, PublicPatient>;
  onSelectCharge: (id: string) => void;
  onNew: () => void;
  onAccessBlocked: () => void;
  onAuriTour?: () => void;
}

function ChargeListView({
  token,
  patientById,
  onSelectCharge,
  onNew,
  onAccessBlocked,
  onAuriTour,
}: ListViewProps): JSX.Element {
  const [filterStatus, setFilterStatus] = useState<FinancialChargeStatus | ''>('');
  // Default to a rolling 30-day window so the summary (esp. "Recebido no
  // período") and the list open populated instead of showing the near-empty
  // current-month default on the first days of a month.
  const [filterDateFrom, setFilterDateFrom] = useState(isoDaysAgo(29));
  const [filterDateTo, setFilterDateTo] = useState(todayIso());

  const hasActiveFilters = filterStatus !== '' || filterDateFrom !== '' || filterDateTo !== '';

  const filters = useMemo(
    () => ({
      status: filterStatus || undefined,
      date_from: filterDateFrom || undefined,
      date_to: filterDateTo || undefined,
      limit: 50,
    }),
    [filterStatus, filterDateFrom, filterDateTo],
  );

  // Summary (totalizadores)
  const summaryQuery = useQuery({
    queryKey: ['financial', 'summary', filterDateFrom, filterDateTo],
    queryFn: () =>
      api.getFinancialSummary(token, {
        date_from: filterDateFrom || undefined,
        date_to: filterDateTo || undefined,
      }),
    staleTime: 30_000,
    retry: false,
  });

  // Charges list
  const listQuery = useQuery({
    queryKey: ['financial', 'charges', filterStatus, filterDateFrom, filterDateTo],
    queryFn: () => api.listFinancialCharges(token, filters),
    staleTime: 15_000,
    retry: false,
  });

  // Detect 403 → bubble up to parent to show access blocked screen
  useEffect(() => {
    if (is403(summaryQuery.error) || is403(listQuery.error)) {
      onAccessBlocked();
    }
  }, [summaryQuery.error, listQuery.error, onAccessBlocked]);

  const summary: FinancialSummary | undefined = summaryQuery.data?.summary;
  const charges: FinancialChargeListItem[] = listQuery.data?.charges ?? [];

  function patientName(id: string): string {
    const p = patientById.get(id);
    if (p) return p.nome;
    return '(Paciente não encontrado)';
  }

  function clearFilters(): void {
    setFilterStatus('');
    setFilterDateFrom('');
    setFilterDateTo('');
  }

  return (
    <>
      {/* Summary cards */}
      <div className={styles.summaryRow} data-tour-id="financial-summary">
        <div className={styles.summaryCard}>
          <div className={styles.summaryCardIcon}>
            <Receipt size={18} aria-hidden="true" />
          </div>
          <div className={styles.summaryCardBody}>
            <span className={styles.summaryLabel}>Em aberto</span>
            <span className={styles.summaryAmount}>
              {summary ? formatCents(summary.pending_amount_cents) : '—'}
            </span>
            <span className={styles.summaryCount}>
              {summary
                ? `${summary.pending_count} cobrança${summary.pending_count !== 1 ? 's' : ''}`
                : 'carregando…'}
            </span>
          </div>
        </div>

        <div className={`${styles.summaryCard} ${styles.overdueCard}`}>
          <div className={`${styles.summaryCardIcon} ${styles.overdueIcon}`}>
            <AlertCircle size={18} aria-hidden="true" />
          </div>
          <div className={styles.summaryCardBody}>
            <span className={styles.summaryLabel}>Vencidas</span>
            <span className={`${styles.summaryAmount} ${styles.overdueAmount}`}>
              {summary ? formatCents(summary.overdue_amount_cents) : '—'}
            </span>
            <span className={styles.summaryCount}>
              {summary
                ? `${summary.overdue_count} cobrança${summary.overdue_count !== 1 ? 's' : ''}`
                : ''}
            </span>
          </div>
        </div>

        <div className={`${styles.summaryCard} ${styles.paidCard}`}>
          <div className={`${styles.summaryCardIcon} ${styles.paidIcon}`}>
            <CheckCircle2 size={18} aria-hidden="true" />
          </div>
          <div className={styles.summaryCardBody}>
            <span className={styles.summaryLabel}>Recebido no período</span>
            <span className={`${styles.summaryAmount} ${styles.paidAmount}`}>
              {summary ? formatCents(summary.paid_amount_cents) : '—'}
            </span>
            <span className={styles.summaryCount}>
              {summary
                ? `${summary.paid_count} cobrança${summary.paid_count !== 1 ? 's' : ''}`
                : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel} htmlFor="fin-filter-status">
            Status
          </label>
          <select
            id="fin-filter-status"
            className={styles.filterSelect}
            value={filterStatus}
            onChange={(e) =>
              setFilterStatus(e.target.value as FinancialChargeStatus | '')
            }
          >
            <option value="">Todos os status</option>
            <option value="pending">Pendentes / vencidas</option>
            <option value="paid">Pagas</option>
            <option value="canceled">Canceladas</option>
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.filterLabel} htmlFor="fin-filter-from">
            Vencimento de
          </label>
          <input
            id="fin-filter-from"
            type="date"
            className={styles.filterInput}
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
          />
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.filterLabel} htmlFor="fin-filter-to">
            até
          </label>
          <input
            id="fin-filter-to"
            type="date"
            className={styles.filterInput}
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
          />
        </div>

        {hasActiveFilters && (
          <div className={styles.filterGroup} style={{ justifyContent: 'flex-end' }}>
            <span className={styles.filterLabel} style={{ visibility: 'hidden' }}>.</span>
            <button
              type="button"
              className={styles.btnGhost}
              onClick={clearFilters}
            >
              Limpar filtros
            </button>
          </div>
        )}

        <div className={styles.toolbarSpacer} />

        <div className={styles.filterGroupActions}>
          {onAuriTour && (
            <button type="button" className={styles.btnGhost} onClick={onAuriTour} title="Auri explica este módulo">
              <HelpCircle size={15} aria-hidden="true" />
              Auri explica
            </button>
          )}
          <button type="button" className={styles.btnPrimary} onClick={onNew}>
            <Plus size={15} aria-hidden="true" />
            Nova cobrança
          </button>
        </div>
      </div>

      {/* Non-403 errors */}
      {listQuery.isError && !is403(listQuery.error) && (
        <p className={styles.errorBanner}>{safeErrorMessage(listQuery.error)}</p>
      )}

      {/* Table */}
      {!listQuery.isError && (
        <div className={styles.tableWrap} data-tour-id="financial-table">
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Paciente</th>
                <th>Descrição</th>
                <th className={styles.colAmount}>Valor</th>
                <th>Vencimento</th>
                <th>Pagador</th>
                <th>Situação</th>
                <th className={styles.colActions}></th>
              </tr>
            </thead>
            <tbody>
              {listQuery.isLoading && (
                <tr>
                  <td colSpan={7} className={styles.empty}>
                    Carregando cobranças…
                  </td>
                </tr>
              )}
              {!listQuery.isLoading && charges.length === 0 && (
                <tr>
                  <td colSpan={7} className={styles.empty}>
                    {hasActiveFilters
                      ? 'Nenhuma cobrança encontrada com os filtros selecionados.'
                      : 'Nenhuma cobrança registrada ainda. Clique em "Nova cobrança" para começar.'}
                  </td>
                </tr>
              )}
              {charges.map((c, i) => (
                <tr
                  key={c.id}
                  className={styles.tableRow}
                  onClick={() => onSelectCharge(c.id)}
                  title="Ver detalhes"
                >
                  <td className={styles.tdPatient}>{patientName(c.patient_id)}</td>
                  <td className={styles.tdDescription}>{c.description}</td>
                  <td className={`${styles.tdAmount} ${isOverdue(c) ? styles.tdAmountOverdue : ''}`}>
                    {formatCents(c.amount_cents)}
                  </td>
                  <td className={styles.tdDate}>{formatDate(c.due_date)}</td>
                  <td className={styles.tdPayer} data-tour-id={i === 0 ? 'financial-payer' : undefined}>
                    <PayerBadge payer_type={c.payer_type} />
                  </td>
                  <td>
                    <StatusBadge charge={c} />
                  </td>
                  <td className={styles.tdActionsCol}>
                    <button
                      type="button"
                      className={styles.btnDetails}
                      data-tour-id={i === 0 ? 'financial-details' : undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectCharge(c.id);
                      }}
                    >
                      Detalhes
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ── View: New Charge Form ─────────────────────────────────────────────────────

interface NewChargeFormProps {
  token: string;
  patientById: Map<string, PublicPatient>;
  onBack: () => void;
  onCreated: (id: string) => void;
}

function NewChargeForm({
  token,
  patientById,
  onBack,
  onCreated,
}: NewChargeFormProps): JSX.Element {
  const queryClient = useQueryClient();
  const [patientId, setPatientId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [description, setDescription] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');
  // Convênios v0.1 (Sprint 4.7C)
  const [payerType, setPayerType] = useState<FinancialPayerType | ''>('');
  const [patientInsuranceId, setPatientInsuranceId] = useState('');
  const [copayStr, setCopayStr] = useState('');
  const [insuranceAmtStr, setInsuranceAmtStr] = useState('');

  // BUG FIX: only show ACTIVE patients in the create dropdown
  // (backend will reject archived/merged patients anyway; this improves UX)
  const patients = useMemo(
    () =>
      Array.from(patientById.values())
        .filter((p) => p.status === 'active')
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [patientById],
  );

  const servicesQuery = useQuery({
    queryKey: ['clinic-services', 'active'],
    staleTime: 60_000,
    queryFn: async () => {
      const res = await api.listClinicServices(token, { active: true, limit: 100 });
      return res.services;
    },
  });
  const services: ClinicService[] = servicesQuery.data ?? [];
  const selectedService = services.find((s) => s.id === serviceId) ?? null;

  const needsInsurance = payerType === 'insurance' || payerType === 'mixed';

  const patientInsurancesQuery = useQuery({
    queryKey: ['patients', patientId, 'insurances', 'active'],
    enabled: !!token && !!patientId && needsInsurance,
    queryFn: async () => {
      const res = await api.listPatientInsurances(token, patientId, { active: true });
      return res.insurances;
    },
  });
  const patientInsurances: PatientInsuranceListItem[] = patientInsurancesQuery.data ?? [];

  const providersQuery = useQuery({
    queryKey: ['insurance', 'providers', 'for-financial'],
    enabled: !!token && needsInsurance,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await api.listInsuranceProviders(token, { active: true, limit: 100 });
      return res.providers;
    },
  });
  const providers: InsuranceProvider[] = providersQuery.data ?? [];

  function providerName(providerId: string | null): string {
    if (!providerId) return '(Operadora)';
    return providers.find((p) => p.id === providerId)?.name ?? providerId.slice(0, 8);
  }

  function buildInsuranceFields(): {
    payer_type?: FinancialPayerType | null;
    patient_insurance_id?: string | null;
    copay_amount_cents?: number | null;
    insurance_amount_cents?: number | null;
  } {
    if (!payerType) return {};
    if (payerType === 'private') return { payer_type: 'private' };
    const insId = patientInsuranceId || null;
    if (payerType === 'insurance') {
      return { payer_type: 'insurance', patient_insurance_id: insId };
    }
    // mixed
    const copay = copayStr.trim() ? Math.round(parseFloat(copayStr.replace(',', '.')) * 100) : null;
    const insAmt = insuranceAmtStr.trim() ? Math.round(parseFloat(insuranceAmtStr.replace(',', '.')) * 100) : null;
    return {
      payer_type: 'mixed',
      patient_insurance_id: insId,
      copay_amount_cents: copay,
      insurance_amount_cents: insAmt,
    };
  }

  const createMutation = useMutation({
    mutationFn: () => {
      const amountCents = Math.round(
        parseFloat(amountStr.replace(',', '.')) * 100,
      );
      if (!patientId)
        throw new ApiError(400, {
          code: 'validation',
          message: 'Selecione o paciente para criar a cobrança.',
        });
      if (!description.trim())
        throw new ApiError(400, {
          code: 'validation',
          message: 'A descrição da cobrança é obrigatória.',
        });
      if (isNaN(amountCents) || amountCents <= 0) {
        throw new ApiError(400, {
          code: 'validation',
          message: 'Informe um valor válido, maior que zero.',
        });
      }
      // Visual validation for mixed: copay + insurance should equal total
      if (payerType === 'mixed' && copayStr.trim() && insuranceAmtStr.trim()) {
        const copay = Math.round(parseFloat(copayStr.replace(',', '.')) * 100);
        const insAmt = Math.round(parseFloat(insuranceAmtStr.replace(',', '.')) * 100);
        if (!isNaN(copay) && !isNaN(insAmt) && copay + insAmt !== amountCents) {
          throw new ApiError(400, {
            code: 'validation',
            message: `Particular + convênio (${formatCents(copay + insAmt)}) deve ser igual ao valor total (${formatCents(amountCents)}).`,
          });
        }
      }
      return api.createFinancialCharge(token, {
        patient_id: patientId,
        service_id: serviceId || null,
        description: description.trim(),
        amount_cents: amountCents,
        due_date: dueDate || null,
        notes: notes.trim() || null,
        ...buildInsuranceFields(),
      });
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['financial'] });
      onCreated(data.charge.id);
    },
    onError: (err) => {
      setFormError(safeErrorMessage(err));
    },
  });

  return (
    <>
      <div className={styles.backRow}>
        <button type="button" className={styles.btnBack} onClick={onBack}>
          <ArrowLeft size={15} aria-hidden="true" />
          Voltar para a lista
        </button>
      </div>

      <div className={styles.formCard}>
        <div className={styles.formHeader}>
          <Receipt size={20} className={styles.formHeaderIcon} aria-hidden="true" />
          <h3 className={styles.formTitle}>Nova cobrança</h3>
        </div>

        {formError && (
          <div className={styles.errorBanner}>
            <AlertCircle size={15} aria-hidden="true" />
            {formError}
          </div>
        )}

        <div className={styles.formGrid}>
          <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
            <label className={styles.fieldLabel} htmlFor="fin-new-patient">
              Paciente<span className={styles.fieldRequired}>*</span>
            </label>
            <select
              id="fin-new-patient"
              className={styles.fieldSelect}
              value={patientId}
              onChange={(e) => {
                setPatientId(e.target.value);
                setPatientInsuranceId('');
              }}
              disabled={createMutation.isPending}
            >
              <option value="">Selecione o paciente…</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
            {patients.length === 0 && (
              <span className={styles.fieldHint}>
                Nenhum paciente ativo encontrado. Cadastre pacientes na aba{' '}
                <strong>Pacientes</strong> primeiro.
              </span>
            )}
          </div>

          <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
            <label className={styles.fieldLabel} htmlFor="fin-new-service">
              Serviço (opcional)
            </label>
            <select
              id="fin-new-service"
              className={styles.fieldSelect}
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              disabled={createMutation.isPending}
            >
              <option value="">Sem serviço vinculado</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.category ? ` — ${s.category}` : ''}
                  {s.price_cents !== null
                    ? ` (tabela: ${formatCents(s.price_cents)})`
                    : ''}
                </option>
              ))}
            </select>
          </div>

          {/* ── Pagador (Convênios v0.1 — Sprint 4.7C) ── */}
          <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
            <label className={styles.fieldLabel} htmlFor="fin-new-payer">
              Pagador (opcional)
            </label>
            <select
              id="fin-new-payer"
              className={styles.fieldSelect}
              value={payerType}
              onChange={(e) => {
                setPayerType(e.target.value as FinancialPayerType | '');
                setPatientInsuranceId('');
                setCopayStr('');
                setInsuranceAmtStr('');
              }}
              disabled={createMutation.isPending}
            >
              <option value="">Não informado</option>
              <option value="private">Particular</option>
              <option value="insurance">Convênio</option>
              <option value="mixed">Particular + convênio</option>
            </select>
          </div>

          {needsInsurance && (
            <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
              <label className={styles.fieldLabel} htmlFor="fin-new-ins">
                Carteirinha do paciente
              </label>
              {patientInsurancesQuery.isLoading && (
                <span className={styles.fieldHint}>Carregando convênios…</span>
              )}
              {!patientInsurancesQuery.isLoading && patientInsurances.length === 0 && patientId && (
                <span className={styles.fieldHint}>
                  Este paciente ainda não tem convênio cadastrado. Cadastre em{' '}
                  <strong>Convênios</strong>.
                </span>
              )}
              {patientInsurances.length > 0 && (
                <select
                  id="fin-new-ins"
                  className={styles.fieldSelect}
                  value={patientInsuranceId}
                  onChange={(e) => setPatientInsuranceId(e.target.value)}
                  disabled={createMutation.isPending}
                >
                  <option value="">Selecione a carteirinha…</option>
                  {patientInsurances.map((ins) => (
                    <option key={ins.id} value={ins.id}>
                      {providerName(ins.provider_id)}
                      {ins.member_number_masked ? ` — ${ins.member_number_masked}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {payerType === 'mixed' && (
            <>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel} htmlFor="fin-new-copay">
                  Parte particular (R$)
                </label>
                <div className={styles.inputPrefix}>
                  <span className={styles.inputPrefixText}>R$</span>
                  <input
                    id="fin-new-copay"
                    type="text"
                    inputMode="decimal"
                    className={styles.fieldInputWithPrefix}
                    value={copayStr}
                    onChange={(e) => setCopayStr(e.target.value)}
                    disabled={createMutation.isPending}
                    placeholder="0,00"
                  />
                </div>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel} htmlFor="fin-new-insamt">
                  Parte convênio (R$)
                </label>
                <div className={styles.inputPrefix}>
                  <span className={styles.inputPrefixText}>R$</span>
                  <input
                    id="fin-new-insamt"
                    type="text"
                    inputMode="decimal"
                    className={styles.fieldInputWithPrefix}
                    value={insuranceAmtStr}
                    onChange={(e) => setInsuranceAmtStr(e.target.value)}
                    disabled={createMutation.isPending}
                    placeholder="0,00"
                  />
                </div>
                <span className={styles.fieldHint}>
                  Particular + convênio deve ser igual ao valor total.
                </span>
              </div>
            </>
          )}

          <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
            <label className={styles.fieldLabel} htmlFor="fin-new-desc">
              Descrição da cobrança<span className={styles.fieldRequired}>*</span>
            </label>
            <input
              id="fin-new-desc"
              type="text"
              className={styles.fieldInput}
              value={description}
              maxLength={255}
              onChange={(e) => setDescription(e.target.value)}
              disabled={createMutation.isPending}
              placeholder="Ex.: Consulta, Retorno, Procedimento estético…"
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel} htmlFor="fin-new-amount">
              Valor<span className={styles.fieldRequired}>*</span>
            </label>
            <div className={styles.inputPrefix}>
              <span className={styles.inputPrefixText}>R$</span>
              <input
                id="fin-new-amount"
                type="text"
                inputMode="decimal"
                className={styles.fieldInputWithPrefix}
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                disabled={createMutation.isPending}
                placeholder="0,00"
              />
            </div>
            {selectedService?.price_cents !== null && selectedService !== null && (
              <button
                type="button"
                className={styles.btnUseTablePrice}
                onClick={() =>
                  setAmountStr(
                    ((selectedService.price_cents as number) / 100)
                      .toFixed(2)
                      .replace('.', ','),
                  )
                }
                disabled={createMutation.isPending}
              >
                Usar preço de tabela ({formatCents(selectedService.price_cents)})
              </button>
            )}
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel} htmlFor="fin-new-due">
              Data de vencimento
            </label>
            <input
              id="fin-new-due"
              type="date"
              className={styles.fieldInput}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={createMutation.isPending}
            />
            <span className={styles.fieldHint}>
              Opcional. Deixe em branco para cobrança sem vencimento definido.
            </span>
          </div>

          <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
            <label className={styles.fieldLabel} htmlFor="fin-new-notes">
              Observações administrativas
            </label>
            <textarea
              id="fin-new-notes"
              className={styles.fieldTextarea}
              value={notes}
              maxLength={1000}
              onChange={(e) => setNotes(e.target.value)}
              disabled={createMutation.isPending}
              placeholder="Observações internas sobre esta cobrança. Não inclua dados de saúde."
            />
            <p className={styles.notesWarning}>
              <AlertTriangle
                size={12}
                aria-hidden="true"
                style={{ verticalAlign: '-2px', marginRight: '0.35rem' }}
              />
              Não inclua diagnóstico, queixa clínica, prescrição ou
              informações de saúde do paciente nestas observações financeiras.
            </p>
          </div>
        </div>

        <div className={styles.formActions}>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => {
              setFormError('');
              createMutation.mutate();
            }}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? 'Salvando…' : 'Criar cobrança'}
          </button>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={onBack}
            disabled={createMutation.isPending}
          >
            Cancelar
          </button>
        </div>
      </div>
    </>
  );
}

// ── View: Edit Charge Form ────────────────────────────────────────────────────

interface EditChargeFormProps {
  token: string;
  charge: FinancialChargeDetail;
  patientById: Map<string, PublicPatient>;
  onBack: () => void;
  onSaved: () => void;
}

function EditChargeForm({
  token,
  charge,
  patientById,
  onBack,
  onSaved,
}: EditChargeFormProps): JSX.Element {
  const queryClient = useQueryClient();
  const [description, setDescription] = useState(charge.description);
  const [amountStr, setAmountStr] = useState(
    (charge.amount_cents / 100).toFixed(2).replace('.', ','),
  );
  const [dueDate, setDueDate] = useState(charge.due_date ?? '');
  const [notes, setNotes] = useState(charge.notes ?? '');
  const [serviceId, setServiceId] = useState(charge.service_id ?? '');
  const [formError, setFormError] = useState('');
  // Convênios v0.1 (Sprint 4.7C)
  const [payerType, setPayerType] = useState<FinancialPayerType | ''>(charge.payer_type ?? '');
  const [patientInsuranceId, setPatientInsuranceId] = useState(charge.patient_insurance_id ?? '');
  const [copayStr, setCopayStr] = useState(
    charge.copay_amount_cents !== null ? (charge.copay_amount_cents / 100).toFixed(2).replace('.', ',') : '',
  );
  const [insuranceAmtStr, setInsuranceAmtStr] = useState(
    charge.insurance_amount_cents !== null ? (charge.insurance_amount_cents / 100).toFixed(2).replace('.', ',') : '',
  );

  const patientName =
    patientById.get(charge.patient_id)?.nome ?? '(Paciente não encontrado)';

  const servicesQuery = useQuery({
    queryKey: ['clinic-services', 'active'],
    staleTime: 60_000,
    queryFn: async () => {
      const res = await api.listClinicServices(token, { active: true, limit: 100 });
      return res.services;
    },
  });
  const services: ClinicService[] = servicesQuery.data ?? [];
  const selectedService = services.find((s) => s.id === serviceId) ?? null;

  const needsInsurance = payerType === 'insurance' || payerType === 'mixed';

  const patientInsurancesQuery = useQuery({
    queryKey: ['patients', charge.patient_id, 'insurances', 'active'],
    enabled: !!token && needsInsurance,
    queryFn: async () => {
      const res = await api.listPatientInsurances(token, charge.patient_id, { active: true });
      return res.insurances;
    },
  });
  const patientInsurances: PatientInsuranceListItem[] = patientInsurancesQuery.data ?? [];

  const providersQuery = useQuery({
    queryKey: ['insurance', 'providers', 'for-financial-edit'],
    enabled: !!token && needsInsurance,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await api.listInsuranceProviders(token, { active: true, limit: 100 });
      return res.providers;
    },
  });
  const providers: InsuranceProvider[] = providersQuery.data ?? [];

  function providerName(providerId: string | null): string {
    if (!providerId) return '(Operadora)';
    return providers.find((p) => p.id === providerId)?.name ?? providerId.slice(0, 8);
  }

  function buildInsuranceFields(): {
    payer_type?: FinancialPayerType | null;
    patient_insurance_id?: string | null;
    copay_amount_cents?: number | null;
    insurance_amount_cents?: number | null;
  } {
    if (!payerType) return { payer_type: null, patient_insurance_id: null, copay_amount_cents: null, insurance_amount_cents: null };
    if (payerType === 'private') return { payer_type: 'private', patient_insurance_id: null, copay_amount_cents: null, insurance_amount_cents: null };
    const insId = patientInsuranceId || null;
    if (payerType === 'insurance') {
      return { payer_type: 'insurance', patient_insurance_id: insId, copay_amount_cents: null, insurance_amount_cents: null };
    }
    const copay = copayStr.trim() ? Math.round(parseFloat(copayStr.replace(',', '.')) * 100) : null;
    const insAmt = insuranceAmtStr.trim() ? Math.round(parseFloat(insuranceAmtStr.replace(',', '.')) * 100) : null;
    return {
      payer_type: 'mixed',
      patient_insurance_id: insId,
      copay_amount_cents: copay,
      insurance_amount_cents: insAmt,
    };
  }

  const updateMutation = useMutation({
    mutationFn: () => {
      const amountCents = Math.round(
        parseFloat(amountStr.replace(',', '.')) * 100,
      );
      if (!description.trim())
        throw new ApiError(400, {
          code: 'validation',
          message: 'A descrição da cobrança é obrigatória.',
        });
      if (isNaN(amountCents) || amountCents <= 0) {
        throw new ApiError(400, {
          code: 'validation',
          message: 'Informe um valor válido, maior que zero.',
        });
      }
      if (payerType === 'mixed' && copayStr.trim() && insuranceAmtStr.trim()) {
        const copay = Math.round(parseFloat(copayStr.replace(',', '.')) * 100);
        const insAmt = Math.round(parseFloat(insuranceAmtStr.replace(',', '.')) * 100);
        if (!isNaN(copay) && !isNaN(insAmt) && copay + insAmt !== amountCents) {
          throw new ApiError(400, {
            code: 'validation',
            message: `Particular + convênio (${formatCents(copay + insAmt)}) deve ser igual ao valor total (${formatCents(amountCents)}).`,
          });
        }
      }
      return api.updateFinancialCharge(token, charge.id, {
        description: description.trim(),
        amount_cents: amountCents,
        due_date: dueDate || null,
        notes: notes.trim() || null,
        service_id: serviceId || null,
        ...buildInsuranceFields(),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['financial'] });
      onSaved();
    },
    onError: (err) => {
      setFormError(safeErrorMessage(err));
    },
  });

  return (
    <>
      <div className={styles.backRow}>
        <button type="button" className={styles.btnBack} onClick={onBack}>
          <ArrowLeft size={15} aria-hidden="true" />
          Voltar para detalhes
        </button>
      </div>

      <div className={styles.formCard}>
        <div className={styles.formHeader}>
          <Pencil size={18} className={styles.formHeaderIcon} aria-hidden="true" />
          <h3 className={styles.formTitle}>Editar cobrança</h3>
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Paciente</label>
          <input
            type="text"
            className={styles.fieldInput}
            value={patientName}
            disabled
          />
        </div>

        {formError && (
          <div className={styles.errorBanner}>
            <AlertCircle size={15} aria-hidden="true" />
            {formError}
          </div>
        )}

        <div className={styles.formGrid}>
          <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
            <label className={styles.fieldLabel} htmlFor="fin-edit-service">
              Serviço (opcional)
            </label>
            <select
              id="fin-edit-service"
              className={styles.fieldSelect}
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              disabled={updateMutation.isPending}
            >
              <option value="">Sem serviço vinculado</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.category ? ` — ${s.category}` : ''}
                  {s.price_cents !== null
                    ? ` (tabela: ${formatCents(s.price_cents)})`
                    : ''}
                </option>
              ))}
            </select>
          </div>

          {/* ── Pagador (Convênios v0.1 — Sprint 4.7C) ── */}
          <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
            <label className={styles.fieldLabel} htmlFor="fin-edit-payer">
              Pagador
            </label>
            <select
              id="fin-edit-payer"
              className={styles.fieldSelect}
              value={payerType}
              onChange={(e) => {
                setPayerType(e.target.value as FinancialPayerType | '');
                setPatientInsuranceId('');
                setCopayStr('');
                setInsuranceAmtStr('');
              }}
              disabled={updateMutation.isPending}
            >
              <option value="">Não informado</option>
              <option value="private">Particular</option>
              <option value="insurance">Convênio</option>
              <option value="mixed">Particular + convênio</option>
            </select>
          </div>

          {needsInsurance && (
            <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
              <label className={styles.fieldLabel} htmlFor="fin-edit-ins">
                Carteirinha do paciente
              </label>
              {patientInsurancesQuery.isLoading && (
                <span className={styles.fieldHint}>Carregando convênios…</span>
              )}
              {!patientInsurancesQuery.isLoading && patientInsurances.length === 0 && (
                <span className={styles.fieldHint}>
                  Este paciente ainda não tem convênio cadastrado. Cadastre em{' '}
                  <strong>Convênios</strong>.
                </span>
              )}
              {patientInsurances.length > 0 && (
                <select
                  id="fin-edit-ins"
                  className={styles.fieldSelect}
                  value={patientInsuranceId}
                  onChange={(e) => setPatientInsuranceId(e.target.value)}
                  disabled={updateMutation.isPending}
                >
                  <option value="">Selecione a carteirinha…</option>
                  {patientInsurances.map((ins) => (
                    <option key={ins.id} value={ins.id}>
                      {providerName(ins.provider_id)}
                      {ins.member_number_masked ? ` — ${ins.member_number_masked}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {payerType === 'mixed' && (
            <>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel} htmlFor="fin-edit-copay">
                  Parte particular (R$)
                </label>
                <div className={styles.inputPrefix}>
                  <span className={styles.inputPrefixText}>R$</span>
                  <input
                    id="fin-edit-copay"
                    type="text"
                    inputMode="decimal"
                    className={styles.fieldInputWithPrefix}
                    value={copayStr}
                    onChange={(e) => setCopayStr(e.target.value)}
                    disabled={updateMutation.isPending}
                    placeholder="0,00"
                  />
                </div>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel} htmlFor="fin-edit-insamt">
                  Parte convênio (R$)
                </label>
                <div className={styles.inputPrefix}>
                  <span className={styles.inputPrefixText}>R$</span>
                  <input
                    id="fin-edit-insamt"
                    type="text"
                    inputMode="decimal"
                    className={styles.fieldInputWithPrefix}
                    value={insuranceAmtStr}
                    onChange={(e) => setInsuranceAmtStr(e.target.value)}
                    disabled={updateMutation.isPending}
                    placeholder="0,00"
                  />
                </div>
                <span className={styles.fieldHint}>
                  Particular + convênio deve ser igual ao valor total.
                </span>
              </div>
            </>
          )}

          <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
            <label className={styles.fieldLabel} htmlFor="fin-edit-desc">
              Descrição da cobrança<span className={styles.fieldRequired}>*</span>
            </label>
            <input
              id="fin-edit-desc"
              type="text"
              className={styles.fieldInput}
              value={description}
              maxLength={255}
              onChange={(e) => setDescription(e.target.value)}
              disabled={updateMutation.isPending}
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel} htmlFor="fin-edit-amount">
              Valor<span className={styles.fieldRequired}>*</span>
            </label>
            <div className={styles.inputPrefix}>
              <span className={styles.inputPrefixText}>R$</span>
              <input
                id="fin-edit-amount"
                type="text"
                inputMode="decimal"
                className={styles.fieldInputWithPrefix}
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                disabled={updateMutation.isPending}
              />
            </div>
            {selectedService?.price_cents !== null && selectedService !== null && (
              <button
                type="button"
                className={styles.btnUseTablePrice}
                onClick={() =>
                  setAmountStr(
                    ((selectedService.price_cents as number) / 100)
                      .toFixed(2)
                      .replace('.', ','),
                  )
                }
                disabled={updateMutation.isPending}
              >
                Usar preço de tabela ({formatCents(selectedService.price_cents)})
              </button>
            )}
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel} htmlFor="fin-edit-due">
              Data de vencimento
            </label>
            <input
              id="fin-edit-due"
              type="date"
              className={styles.fieldInput}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={updateMutation.isPending}
            />
          </div>

          <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
            <label className={styles.fieldLabel} htmlFor="fin-edit-notes">
              Observações administrativas
            </label>
            <textarea
              id="fin-edit-notes"
              className={styles.fieldTextarea}
              value={notes}
              maxLength={1000}
              onChange={(e) => setNotes(e.target.value)}
              disabled={updateMutation.isPending}
            />
            <p className={styles.notesWarning}>
              <AlertTriangle
                size={12}
                aria-hidden="true"
                style={{ verticalAlign: '-2px', marginRight: '0.35rem' }}
              />
              Não inclua diagnóstico, queixa clínica, prescrição ou
              informações de saúde do paciente nestas observações financeiras.
            </p>
          </div>
        </div>

        <div className={styles.formActions}>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => {
              setFormError('');
              updateMutation.mutate();
            }}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? 'Salvando…' : 'Salvar alterações'}
          </button>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={onBack}
            disabled={updateMutation.isPending}
          >
            Cancelar
          </button>
        </div>
      </div>
    </>
  );
}

// ── Modal: Mark Paid ──────────────────────────────────────────────────────────

interface MarkPaidModalProps {
  token: string;
  chargeId: string;
  amount: number;
  payerType: string | null;
  copayAmountCents: number | null;
  insuranceAmountCents: number | null;
  onClose: () => void;
  onPaid: () => void;
}

function MarkPaidModal({
  token,
  chargeId,
  amount,
  payerType,
  copayAmountCents,
  insuranceAmountCents,
  onClose,
  onPaid,
}: MarkPaidModalProps): JSX.Element {
  const queryClient = useQueryClient();
  const isInsurance = payerType === 'insurance';
  const isMixed = payerType === 'mixed';
  const defaultMethod: FinancialPaymentMethod = isInsurance ? 'bank_transfer' : 'pix';
  const [method, setMethod] = useState<FinancialPaymentMethod>(defaultMethod);
  const [paidAt, setPaidAt] = useState('');
  const [modalError, setModalError] = useState('');

  const modalTitle = isInsurance
    ? 'Registrar recebimento do convênio'
    : isMixed
      ? 'Confirmar recebimento misto'
      : 'Confirmar recebimento';

  const markPaidMutation = useMutation({
    mutationFn: () =>
      api.markFinancialChargePaid(token, chargeId, {
        payment_method: method,
        paid_at: paidAt || null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['financial'] });
      onPaid();
    },
    onError: (err) => {
      setModalError(safeErrorMessage(err));
    },
  });

  return (
    <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <CheckCircle2 size={22} className={styles.modalHeaderIconSuccess} aria-hidden="true" />
          <h3 className={styles.modalTitle}>{modalTitle}</h3>
        </div>

        <p className={styles.modalDesc}>
          Confirme o recebimento de{' '}
          <strong className={styles.modalAmount}>{formatCents(amount)}</strong>.
        </p>

        {isInsurance && (
          <div className={styles.modalPayerNote}>
            <strong>Pagador: Convênio.</strong> Use este registro quando o valor tiver sido
            recebido ou repassado pelo convênio.
          </div>
        )}

        {isMixed && (
          <div className={`${styles.modalPayerNote} ${styles.modalPayerNoteMixed}`}>
            <strong>Pagador: Particular + convênio.</strong>
            {(copayAmountCents !== null || insuranceAmountCents !== null) && (
              <div className={styles.modalPayerBreakdown}>
                {copayAmountCents !== null && (
                  <div className={styles.modalPayerRow}>
                    <span className={styles.modalPayerLabel}>Parte particular:</span>
                    <span>{formatCents(copayAmountCents)}</span>
                  </div>
                )}
                {insuranceAmountCents !== null && (
                  <div className={styles.modalPayerRow}>
                    <span className={styles.modalPayerLabel}>Parte convênio:</span>
                    <span>{formatCents(insuranceAmountCents)}</span>
                  </div>
                )}
                <div className={styles.modalPayerRow}>
                  <span className={styles.modalPayerLabel}>Total:</span>
                  <span>{formatCents(amount)}</span>
                </div>
              </div>
            )}
            <div style={{ marginTop: '0.4rem', fontSize: '0.78rem', opacity: 0.85 }}>
              O Financeiro v0.1 marca a cobrança inteira como recebida.
              Controle de recebimento parcial fica para sprint futura.
            </div>
          </div>
        )}

        {modalError && (
          <div className={styles.errorBanner}>
            <AlertCircle size={15} aria-hidden="true" />
            {modalError}
          </div>
        )}

        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel} htmlFor="fin-paid-method">
            Forma de pagamento<span className={styles.fieldRequired}>*</span>
          </label>
          <select
            id="fin-paid-method"
            className={styles.fieldSelect}
            value={method}
            onChange={(e) => setMethod(e.target.value as FinancialPaymentMethod)}
            disabled={markPaidMutation.isPending}
          >
            {(
              Object.entries(PAYMENT_METHOD_LABELS) as [
                FinancialPaymentMethod,
                string,
              ][]
            ).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          {isInsurance && (
            <span className={styles.fieldHint}>
              Para convênios, use Transferência bancária ou Outro conforme o repasse recebido.
            </span>
          )}
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel} htmlFor="fin-paid-at">
            Data do pagamento
          </label>
          <input
            id="fin-paid-at"
            type="date"
            className={styles.fieldInput}
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
            disabled={markPaidMutation.isPending}
          />
          <span className={styles.fieldHint}>
            Deixe em branco para registrar como pago hoje.
          </span>
        </div>

        <div className={styles.modalActions}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={onClose}
            disabled={markPaidMutation.isPending}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={styles.btnSuccess}
            onClick={() => {
              setModalError('');
              markPaidMutation.mutate();
            }}
            disabled={markPaidMutation.isPending}
          >
            <CheckCircle2 size={15} aria-hidden="true" />
            {markPaidMutation.isPending ? 'Registrando…' : modalTitle}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal: Cancel Charge ──────────────────────────────────────────────────────

interface CancelChargeModalProps {
  token: string;
  chargeId: string;
  onClose: () => void;
  onCanceled: () => void;
}

function CancelChargeModal({
  token,
  chargeId,
  onClose,
  onCanceled,
}: CancelChargeModalProps): JSX.Element {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [modalError, setModalError] = useState('');

  const cancelMutation = useMutation({
    mutationFn: () =>
      api.cancelFinancialCharge(token, chargeId, {
        cancel_reason: reason.trim() || null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['financial'] });
      onCanceled();
    },
    onError: (err) => {
      setModalError(safeErrorMessage(err));
    },
  });

  return (
    <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <XCircle size={22} className={styles.modalHeaderIconDanger} aria-hidden="true" />
          <h3 className={styles.modalTitle}>Cancelar cobrança</h3>
        </div>

        <p className={styles.modalDesc}>
          Esta ação é <strong>irreversível</strong>. A cobrança passará para o
          status Cancelado e não poderá ser reativada.
        </p>

        {modalError && (
          <div className={styles.errorBanner}>
            <AlertCircle size={15} aria-hidden="true" />
            {modalError}
          </div>
        )}

        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel} htmlFor="fin-cancel-reason">
            Motivo do cancelamento{' '}
            <span className={styles.fieldOptional}>(opcional)</span>
          </label>
          <textarea
            id="fin-cancel-reason"
            className={styles.fieldTextarea}
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            disabled={cancelMutation.isPending}
            placeholder="Ex.: Cobrança duplicada, paciente desistiu, erro de cadastro…"
          />
        </div>

        <div className={styles.modalActions}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={onClose}
            disabled={cancelMutation.isPending}
          >
            Voltar
          </button>
          <button
            type="button"
            className={styles.btnDanger}
            onClick={() => {
              setModalError('');
              cancelMutation.mutate();
            }}
            disabled={cancelMutation.isPending}
          >
            <XCircle size={15} aria-hidden="true" />
            {cancelMutation.isPending ? 'Cancelando…' : 'Confirmar cancelamento'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── View: Charge Detail ───────────────────────────────────────────────────────

interface ChargeDetailViewProps {
  token: string;
  chargeId: string;
  patientById: Map<string, PublicPatient>;
  onBack: () => void;
  onEdit: () => void;
  onMarkPaid: () => void;
  onCancel: () => void;
}

function ChargeDetailView({
  token,
  chargeId,
  patientById,
  onBack,
  onEdit,
  onMarkPaid,
  onCancel,
}: ChargeDetailViewProps): JSX.Element {
  // staleTime: 0 — notes are sensitive (ADR 0012 §10)
  const detailQuery = useQuery({
    queryKey: ['financial', 'charge', chargeId],
    queryFn: () => api.getFinancialCharge(token, chargeId),
    staleTime: 0,
  });

  const charge: FinancialChargeDetail | undefined = detailQuery.data?.charge;

  if (detailQuery.isLoading) {
    return <div className={styles.loadingState}>Carregando cobrança…</div>;
  }

  if (detailQuery.isError || !charge) {
    return (
      <>
        <div className={styles.backRow}>
          <button type="button" className={styles.btnBack} onClick={onBack}>
            <ArrowLeft size={15} aria-hidden="true" />
            Voltar para a lista
          </button>
        </div>
        <div className={styles.errorBanner}>
          <AlertCircle size={15} aria-hidden="true" />
          {detailQuery.isError
            ? safeErrorMessage(detailQuery.error)
            : 'Cobrança não encontrada.'}
        </div>
      </>
    );
  }

  const patientName =
    patientById.get(charge.patient_id)?.nome ?? '(Paciente não encontrado)';

  return (
    <>
      <div className={styles.backRow}>
        <button type="button" className={styles.btnBack} onClick={onBack}>
          <ArrowLeft size={15} aria-hidden="true" />
          Voltar para a lista
        </button>
      </div>

      <div className={styles.detailCard}>
        {/* Header with status */}
        <div className={styles.detailCardHeader}>
          <div className={styles.detailTitleRow}>
            <h3 className={styles.detailTitle}>{charge.description}</h3>
            <StatusBadge charge={charge} />
          </div>
          <div className={styles.detailAmountRow}>
            <span className={styles.detailAmount}>{formatCents(charge.amount_cents)}</span>
            <span className={styles.detailAmountLabel}>cobrança</span>
          </div>
        </div>

        {/* Meta grid */}
        <div className={styles.detailMeta}>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Paciente</span>
            <span className={styles.metaValue}>{patientName}</span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Vencimento</span>
            <span
              className={`${styles.metaValue} ${
                isOverdue(charge) ? styles.metaValueDanger : ''
              }`}
            >
              {formatDate(charge.due_date)}
              {isOverdue(charge) && (
                <span className={styles.overdueTag}> (vencida)</span>
              )}
            </span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Situação</span>
            <span className={styles.metaValue}>{STATUS_LABELS[charge.status]}</span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Criado em</span>
            <span className={styles.metaValue}>{formatDate(charge.created_at)}</span>
          </div>

          {charge.payer_type && (
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Pagador</span>
              <span className={styles.metaValue}>
                <PayerBadge payer_type={charge.payer_type} />
                {charge.payer_type === 'mixed' && charge.copay_amount_cents !== null && charge.insurance_amount_cents !== null && (
                  <span style={{ marginLeft: '0.4rem', fontSize: '0.82rem', color: 'var(--text-2)' }}>
                    ({formatCents(charge.copay_amount_cents)} particular + {formatCents(charge.insurance_amount_cents)} convênio)
                  </span>
                )}
              </span>
            </div>
          )}

          {charge.status === 'paid' && (
            <>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Pago em</span>
                <span className={styles.metaValue}>{formatDate(charge.paid_at)}</span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Forma de pagamento</span>
                <span className={styles.metaValue}>
                  {charge.payment_method
                    ? PAYMENT_METHOD_LABELS[charge.payment_method]
                    : '—'}
                </span>
              </div>
            </>
          )}

          {charge.status === 'canceled' && (
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Cancelado em</span>
              <span className={styles.metaValue}>{formatDate(charge.canceled_at)}</span>
            </div>
          )}
        </div>

        {/* Notes — detail only, never in list (security) */}
        {charge.notes !== null && charge.notes !== '' && (
          <div className={styles.notesSection}>
            <span className={styles.notesSectionLabel}>Observações administrativas</span>
            <div className={styles.notesBox}>{charge.notes}</div>
            <p className={styles.notesWarning}>
              <AlertTriangle
                size={12}
                aria-hidden="true"
                style={{ verticalAlign: '-2px', marginRight: '0.35rem' }}
              />
              Não inclua diagnóstico, queixa clínica, prescrição ou
              informações de saúde do paciente nestas observações financeiras.
            </p>
          </div>
        )}

        {/* Cancel reason — detail only */}
        {charge.status === 'canceled' && charge.cancel_reason && (
          <div className={styles.notesSection}>
            <span className={styles.notesSectionLabel}>Motivo do cancelamento</span>
            <div className={styles.notesBox}>{charge.cancel_reason}</div>
          </div>
        )}

        {/* Actions — only for pending charges */}
        {charge.status === 'pending' && (
          <div className={styles.detailActions}>
            <button
              type="button"
              className={styles.btnSuccess}
              onClick={onMarkPaid}
            >
              <CheckCircle2 size={16} aria-hidden="true" />
              Marcar como pago
            </button>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={onEdit}
            >
              <Pencil size={14} aria-hidden="true" />
              Editar cobrança
            </button>
            <button
              type="button"
              className={styles.btnDanger}
              onClick={onCancel}
            >
              <XCircle size={14} aria-hidden="true" />
              Cancelar cobrança
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ── Loader: Edit (fetches detail before mounting form) ────────────────────────

interface EditLoaderProps {
  token: string;
  chargeId: string;
  patientById: Map<string, PublicPatient>;
  onBack: () => void;
  onSaved: () => void;
}

function EditChargeDetailLoader({
  token,
  chargeId,
  patientById,
  onBack,
  onSaved,
}: EditLoaderProps): JSX.Element {
  const detailQuery = useQuery({
    queryKey: ['financial', 'charge', chargeId],
    queryFn: () => api.getFinancialCharge(token, chargeId),
    staleTime: 0,
  });

  if (detailQuery.isLoading) {
    return <div className={styles.loadingState}>Carregando…</div>;
  }

  if (detailQuery.isError || !detailQuery.data?.charge) {
    return (
      <>
        <div className={styles.backRow}>
          <button type="button" className={styles.btnBack} onClick={onBack}>
            <ArrowLeft size={15} aria-hidden="true" />
            Voltar
          </button>
        </div>
        <div className={styles.errorBanner}>
          <AlertCircle size={15} aria-hidden="true" />
          Não foi possível carregar a cobrança para edição.
        </div>
      </>
    );
  }

  const charge = detailQuery.data.charge;

  if (charge.status !== 'pending') {
    return (
      <>
        <div className={styles.backRow}>
          <button type="button" className={styles.btnBack} onClick={onBack}>
            <ArrowLeft size={15} aria-hidden="true" />
            Voltar
          </button>
        </div>
        <div className={styles.errorBanner}>
          <AlertCircle size={15} aria-hidden="true" />
          Somente cobranças pendentes podem ser editadas.
        </div>
      </>
    );
  }

  return (
    <EditChargeForm
      token={token}
      charge={charge}
      patientById={patientById}
      onBack={onBack}
      onSaved={onSaved}
    />
  );
}

// ── Loader: Mark Paid Modal ───────────────────────────────────────────────────

interface MarkPaidLoaderProps {
  token: string;
  chargeId: string;
  onClose: () => void;
  onPaid: () => void;
}

function MarkPaidModalLoader({
  token,
  chargeId,
  onClose,
  onPaid,
}: MarkPaidLoaderProps): JSX.Element {
  const detailQuery = useQuery({
    queryKey: ['financial', 'charge', chargeId],
    queryFn: () => api.getFinancialCharge(token, chargeId),
    staleTime: 0,
  });

  const charge = detailQuery.data?.charge;
  const amount = charge?.amount_cents ?? 0;

  return (
    <MarkPaidModal
      token={token}
      chargeId={chargeId}
      amount={amount}
      payerType={charge?.payer_type ?? null}
      copayAmountCents={charge?.copay_amount_cents ?? null}
      insuranceAmountCents={charge?.insurance_amount_cents ?? null}
      onClose={onClose}
      onPaid={onPaid}
    />
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export function FinancialPanel({ onAuriTour }: { onAuriTour?: () => void } = {}): JSX.Element {
  const { user } = useAuth();
  const token = getToken();

  const [view, setView] = useState<PanelView>('list');
  const [selectedChargeId, setSelectedChargeId] = useState<string | null>(null);
  const [markPaidFor, setMarkPaidFor] = useState<string | null>(null);
  const [cancelFor, setCancelFor] = useState<string | null>(null);
  const [accessBlocked, setAccessBlocked] = useState(false);

  // BUG FIX: use status='all' + limit=100 (was status:'active' + limit:500)
  // - limit=500 returned 400 (backend max=100)
  // - status='active' excluded archived patients referenced in existing charges
  // - status='all' lets us show correct names for charges on archived patients
  // The NewChargeForm separately filters to status==='active' for the dropdown
  const patientsQuery = useQuery({
    queryKey: ['patients', 'financial-picker'],
    queryFn: () =>
      api.listPatients(token ?? '', { status: 'all', limit: 100 }),
    enabled: !!token,
    staleTime: 60_000,
  });

  const patientById = useMemo<Map<string, PublicPatient>>(() => {
    const patients = patientsQuery.data?.patients ?? [];
    return new Map(patients.map((p) => [p.id, p]));
  }, [patientsQuery.data]);

  // Route-level gate: dono_clinica and secretaria (papel).
  // profissional_clinico has papel=secretaria + grant → will get 403 from service
  // → ChargeListView detects and calls onAccessBlocked.
  const isPapelAllowed =
    user?.papel === 'dono_clinica' || user?.papel === 'secretaria';

  if (!isPapelAllowed || accessBlocked) {
    return (
      <div className={styles.accessBlocked}>
        <XCircle size={28} className={styles.accessBlockedIcon} aria-hidden="true" />
        <strong className={styles.accessBlockedTitle}>Acesso não autorizado</strong>
        <p className={styles.accessBlockedDesc}>
          {accessBlocked
            ? 'Seu perfil não tem permissão para acessar o módulo financeiro. Entre em contato com o responsável pela clínica.'
            : 'Esta área é restrita a responsáveis e funcionários administrativos da clínica.'}
        </p>
      </div>
    );
  }

  if (!token) {
    return (
      <div className={styles.accessBlocked}>
        <AlertCircle size={28} className={styles.accessBlockedIcon} aria-hidden="true" />
        <strong className={styles.accessBlockedTitle}>Sessão expirada</strong>
        <p className={styles.accessBlockedDesc}>
          Faça login novamente para acessar o módulo financeiro.
        </p>
      </div>
    );
  }

  // ── handlers ──

  function handleSelectCharge(id: string): void {
    setSelectedChargeId(id);
    setView('detail');
  }

  function handleBack(): void {
    setView('list');
    setSelectedChargeId(null);
    setMarkPaidFor(null);
    setCancelFor(null);
  }

  function handleNew(): void {
    setView('new');
    setSelectedChargeId(null);
  }

  function handleCreated(id: string): void {
    setSelectedChargeId(id);
    setView('detail');
  }

  function handleSaved(): void {
    setView('detail');
  }

  function handleMarkPaidOpen(): void {
    if (selectedChargeId) setMarkPaidFor(selectedChargeId);
  }

  function handleCancelOpen(): void {
    if (selectedChargeId) setCancelFor(selectedChargeId);
  }

  function handleModalClose(): void {
    setMarkPaidFor(null);
    setCancelFor(null);
  }

  function handlePaid(): void {
    setMarkPaidFor(null);
    setView('detail');
  }

  function handleCanceled(): void {
    setCancelFor(null);
    setView('detail');
  }

  // ── render ──

  return (
    <div className={styles.panel}>
      {view === 'list' && (
        <ChargeListView
          token={token}
          patientById={patientById}
          onSelectCharge={handleSelectCharge}
          onNew={handleNew}
          onAccessBlocked={() => setAccessBlocked(true)}
          onAuriTour={onAuriTour}
        />
      )}

      {view === 'new' && (
        <NewChargeForm
          token={token}
          patientById={patientById}
          onBack={handleBack}
          onCreated={handleCreated}
        />
      )}

      {view === 'detail' && selectedChargeId && (
        <ChargeDetailView
          token={token}
          chargeId={selectedChargeId}
          patientById={patientById}
          onBack={handleBack}
          onEdit={() => setView('edit')}
          onMarkPaid={handleMarkPaidOpen}
          onCancel={handleCancelOpen}
        />
      )}

      {view === 'edit' && selectedChargeId && (
        <EditChargeDetailLoader
          token={token}
          chargeId={selectedChargeId}
          patientById={patientById}
          onBack={() => setView('detail')}
          onSaved={handleSaved}
        />
      )}

      {markPaidFor !== null && (
        <MarkPaidModalLoader
          token={token}
          chargeId={markPaidFor}
          onClose={handleModalClose}
          onPaid={handlePaid}
        />
      )}

      {cancelFor !== null && (
        <CancelChargeModal
          token={token}
          chargeId={cancelFor}
          onClose={handleModalClose}
          onCanceled={handleCanceled}
        />
      )}
    </div>
  );
}
