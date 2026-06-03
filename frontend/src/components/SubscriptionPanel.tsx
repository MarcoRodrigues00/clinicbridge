// SubscriptionPanel.tsx — Sprint 5.1C (ADR 0018)
//
// Painel de Plano e Assinatura — mostra o status comercial da clínica.
// CAMADA COMERCIAL: ClinicBridge cobrando a clínica pelo SaaS.
// NÃO confundir com financial_charges (ADR 0012), que é a clínica cobrando pacientes.
//
// SEGURANÇA:
// - Frontend apresenta dados; backend é a fonte da verdade de acesso.
// - Sem preço, sem cobrança real, sem checkout, sem gateway, sem PII.
// - Token apenas via header Authorization (getToken → api.ts).
// - Sem dangerouslySetInnerHTML.
// - 403 tratado como "Acesso restrito" — não tenta contornar.
// - Módulos clínicos exibem aviso: plano apenas restringe,
//   permissões clínicas (requireClinicalRole) continuam sendo a autoridade real.

import { useQuery } from '@tanstack/react-query';
import {
  Loader2,
  AlertCircle,
  ShieldOff,
  Info,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Package,
  BarChart2,
  Lock,
  LockOpen,
  Download,
  CreditCard,
  Gauge,
  HelpCircle,
} from 'lucide-react';
import { api, ApiError } from '../services/api';
import type { BillingStatus, PlanCode, SubscriptionStatus } from '../services/api';
import { getToken } from '../services/authStorage';
import styles from './SubscriptionPanel.module.css';

// ── Labels ──────────────────────────────────────────────────────────────────

const PLAN_LABELS: Record<PlanCode, string> = {
  essential: 'Essencial',
  professional: 'Profissional',
  assisted_pilot: 'Piloto assistido',
};

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  manual_pilot: 'Piloto assistido',
  trialing: 'Período de teste',
  active: 'Ativo',
  past_due: 'Pagamento pendente',
  suspended: 'Suspenso',
  canceled: 'Cancelado',
};

type StatusTone = 'success' | 'info' | 'warning' | 'danger';

const STATUS_TONE: Record<SubscriptionStatus, StatusTone> = {
  manual_pilot: 'info',
  trialing: 'info',
  active: 'success',
  past_due: 'warning',
  suspended: 'danger',
  canceled: 'danger',
};

const MODULE_LABELS: Record<string, string> = {
  'module.patients': 'Pacientes',
  'module.schedule': 'Agenda',
  'module.financial': 'Financeiro',
  'module.reports': 'Relatórios',
  'module.services': 'Serviços',
  'module.insurance': 'Convênios',
  'module.inventory': 'Estoque',
  'module.clinical_records': 'Prontuário clínico',
  'module.clinical_documents': 'Documentos médicos',
};

const CLINICAL_MODULE_KEYS = new Set([
  'module.clinical_records',
  'module.clinical_documents',
]);

const LIMIT_LABELS: Record<string, string> = {
  'limit.users': 'Usuários',
  'limit.professionals': 'Profissionais',
  'limit.imports_per_month': 'Importações/mês',
};

const MODULE_KEY_ORDER = [
  'module.patients',
  'module.schedule',
  'module.financial',
  'module.reports',
  'module.services',
  'module.insurance',
  'module.inventory',
  'module.clinical_records',
  'module.clinical_documents',
];

const LIMIT_KEY_ORDER = [
  'limit.users',
  'limit.professionals',
  'limit.imports_per_month',
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusBadgeClass(tone: StatusTone): string {
  if (tone === 'success') return styles.statusBadgeSuccess;
  if (tone === 'info') return styles.statusBadgeInfo;
  if (tone === 'warning') return styles.statusBadgeWarning;
  return styles.statusBadgeDanger;
}

function isLocked(status: SubscriptionStatus): boolean {
  return status === 'suspended' || status === 'canceled';
}

function isAlertStatus(status: SubscriptionStatus): boolean {
  return status === 'past_due' || status === 'suspended' || status === 'canceled';
}

function alertTone(status: SubscriptionStatus): 'warning' | 'danger' {
  return status === 'past_due' ? 'warning' : 'danger';
}

function alertMessage(status: SubscriptionStatus): string {
  if (status === 'past_due') {
    return 'Há um pagamento pendente. O acesso completo continua enquanto a tolerância estiver ativa.';
  }
  if (status === 'suspended') {
    return 'Assinatura suspensa. A criação de novos registros está bloqueada. Leitura e exportação dos dados continuam disponíveis.';
  }
  return 'Assinatura encerrada. Leitura e exportação dos dados continuam disponíveis durante a janela de retenção.';
}

function lockReasonLabel(reason: string | null): string {
  if (!reason) return '';
  const map: Record<string, string> = {
    subscription_suspended: 'Assinatura suspensa',
    subscription_canceled: 'Assinatura encerrada',
    payment_pending: 'Pagamento pendente',
    grace_period_expired: 'Período de tolerância encerrado',
    subscription_inactive: 'Assinatura inativa',
  };
  return map[reason] ?? reason;
}

// Mock/manual providers signal no real gateway is connected.
function isMockOrManual(billing: BillingStatus): boolean {
  return (
    !billing.provisioned ||
    billing.provider === null ||
    billing.provider === 'mock' ||
    billing.provider === 'manual'
  );
}

// ── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: SubscriptionStatus }): JSX.Element {
  const tone = STATUS_TONE[status];
  return (
    <span className={`${styles.statusBadge} ${statusBadgeClass(tone)}`}>
      {tone === 'success' && <CheckCircle2 size={13} aria-hidden="true" />}
      {tone === 'info' && <Info size={13} aria-hidden="true" />}
      {tone === 'warning' && <AlertTriangle size={13} aria-hidden="true" />}
      {tone === 'danger' && <XCircle size={13} aria-hidden="true" />}
      {STATUS_LABELS[status]}
    </span>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

function BillingContent({ billing, onAuriTour }: { billing: BillingStatus; onAuriTour?: () => void }): JSX.Element {
  const planLabel = PLAN_LABELS[billing.plan_code] ?? billing.plan_code;
  const showAlert = isAlertStatus(billing.status);
  const locked = isLocked(billing.status);
  const showMockNotice = isMockOrManual(billing);

  const moduleFeatures = MODULE_KEY_ORDER
    .map((key) => billing.entitlements.features.find((f) => f.feature_key === key))
    .filter((f): f is NonNullable<typeof f> => f !== undefined);

  const limitFeatures = LIMIT_KEY_ORDER
    .map((key) => billing.entitlements.features.find((f) => f.feature_key === key))
    .filter((f): f is NonNullable<typeof f> => f !== undefined);

  return (
    <>
      {showMockNotice && (
        <div className={styles.mockNotice} role="note">
          <Info size={16} className={styles.mockNoticeIcon} aria-hidden="true" />
          <span>
            <strong>Pagamento online em preparação.</strong>{' '}
            A cobrança real ainda não está conectada nesta fase.
            Todos os módulos e limites abaixo refletem o plano configurado no sistema.
          </span>
        </div>
      )}

      {showAlert && (
        <div
          className={`${styles.alertBanner} ${alertTone(billing.status) === 'warning' ? styles.alertBannerWarning : styles.alertBannerDanger}`}
          role="alert"
        >
          <AlertTriangle size={16} className={styles.alertBannerIcon} aria-hidden="true" />
          <span>{alertMessage(billing.status)}</span>
        </div>
      )}

      {/* Plan + status header */}
      <div className={styles.planCard} data-tour-id="subscription-plan">
        <div className={styles.planLeft}>
          <span className={styles.planLabel}>Plano atual</span>
          <span className={styles.planName}>{planLabel}</span>
          {!billing.provisioned && (
            <span className={styles.planProvisioned}>
              Configuração padrão — sem assinatura provisionada
            </span>
          )}
        </div>
        <div className={styles.planRight}>
          <StatusBadge status={billing.status} />
          {onAuriTour && (
            <button type="button" className={styles.auriBtn} onClick={onAuriTour} title="Auri explica este módulo">
              <HelpCircle size={14} aria-hidden="true" />
              Auri explica
            </button>
          )}
        </div>
      </div>

      {/* Modules */}
      <div className={styles.sectionCard} data-tour-id="subscription-modules">
        <h3 className={styles.sectionTitle}>
          <Package size={17} className={styles.sectionIcon} aria-hidden="true" />
          Recursos incluídos no plano
        </h3>
        <div className={styles.moduleGrid}>
          {moduleFeatures.map((feat) => (
            <div
              key={feat.feature_key}
              className={`${styles.moduleItem} ${feat.enabled ? styles.moduleItemEnabled : styles.moduleItemDisabled}`}
            >
              <span className={styles.moduleStatusIcon}>
                {feat.enabled ? (
                  <CheckCircle2
                    size={16}
                    className={styles.moduleStatusIconEnabled}
                    aria-label="Incluído"
                  />
                ) : (
                  <XCircle
                    size={16}
                    className={styles.moduleStatusIconDisabled}
                    aria-label="Não incluído"
                  />
                )}
              </span>
              <span>
                <span className={styles.moduleName}>
                  {MODULE_LABELS[feat.feature_key] ?? feat.feature_key}
                </span>
                {CLINICAL_MODULE_KEYS.has(feat.feature_key) && (
                  <span className={styles.moduleNote}>
                    Requer também permissão clínica
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Limits */}
      {limitFeatures.length > 0 && (
        <div className={styles.sectionCard} data-tour-id="subscription-limits">
          <h3 className={styles.sectionTitle}>
            <Gauge size={17} className={styles.sectionIcon} aria-hidden="true" />
            Limites do plano
          </h3>
          <div className={styles.limitsGrid}>
            {limitFeatures.map((feat) => (
              <div key={feat.feature_key} className={styles.limitItem}>
                <span className={styles.limitLabel}>
                  {LIMIT_LABELS[feat.feature_key] ?? feat.feature_key}
                </span>
                {feat.limit_value === null ? (
                  <span className={`${styles.limitValue} ${styles.limitValueUnlimited}`}>
                    Ilimitado
                  </span>
                ) : (
                  <span className={styles.limitValue}>{feat.limit_value}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Soft-lock state */}
      <div className={styles.sectionCard}>
        <h3 className={styles.sectionTitle}>
          <BarChart2 size={17} className={styles.sectionIcon} aria-hidden="true" />
          Estado da conta
        </h3>
        <div className={styles.lockSection}>
          <div className={styles.lockRow}>
            {billing.soft_lock.can_create_new_records ? (
              <LockOpen size={15} className={`${styles.lockIcon} ${styles.lockIconOk}`} aria-hidden="true" />
            ) : (
              <Lock size={15} className={`${styles.lockIcon} ${styles.lockIconBlocked}`} aria-hidden="true" />
            )}
            <span>
              {billing.soft_lock.can_create_new_records
                ? 'Criação de novos registros: permitida'
                : 'Criação de novos registros: bloqueada'}
            </span>
          </div>
          <div className={styles.lockRow}>
            {!billing.soft_lock.read_only_mode ? (
              <LockOpen size={15} className={`${styles.lockIcon} ${styles.lockIconOk}`} aria-hidden="true" />
            ) : (
              <Lock size={15} className={`${styles.lockIcon} ${styles.lockIconBlocked}`} aria-hidden="true" />
            )}
            <span>
              {billing.soft_lock.read_only_mode
                ? 'Modo leitura: ativado (alterações bloqueadas)'
                : 'Modo leitura: desativado (escrita normal)'}
            </span>
          </div>
          <div className={styles.lockRow}>
            <Download size={15} className={`${styles.lockIcon} ${styles.lockIconOk}`} aria-hidden="true" />
            <span>Exportação de dados: sempre permitida</span>
          </div>
          {billing.soft_lock.lock_reason && (
            <div className={styles.lockReason}>
              {lockReasonLabel(billing.soft_lock.lock_reason)}
            </div>
          )}
          {locked && (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-2)', marginTop: '0.5rem' }}>
              Seus dados estão seguros e podem ser exportados a qualquer momento.
              Entre em contato com o suporte para regularizar a assinatura.
            </p>
          )}
        </div>
      </div>

      {/* Future CTA */}
      <div className={styles.ctaCard}>
        <div className={styles.ctaLeft}>
          <span className={styles.ctaTitle}>Gerenciar assinatura</span>
          <span className={styles.ctaDesc}>
            O portal de pagamento online estará disponível em uma fase futura.
            Para alterações no plano, entre em contato com o suporte.
          </span>
        </div>
        <button
          type="button"
          className={styles.ctaButton}
          disabled
          aria-disabled="true"
          title="Disponível em fase futura"
        >
          <CreditCard size={16} aria-hidden="true" />
          Gerenciar assinatura
        </button>
      </div>
    </>
  );
}

// ── Exported panel ─────────────────────────────────────────────────────────────

export function SubscriptionPanel({ onAuriTour }: { onAuriTour?: () => void } = {}): JSX.Element {
  const token = getToken();

  const { data, isLoading, error } = useQuery({
    queryKey: ['billing', 'status'] as const,
    enabled: !!token,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await api.getBillingStatus(token as string);
      return res.billing;
    },
  });

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <Loader2 size={20} className={styles.spinnerIcon} aria-hidden="true" />
        <span>Carregando informações do plano…</span>
      </div>
    );
  }

  if (error) {
    if (error instanceof ApiError && error.status === 403) {
      return (
        <div className={styles.restrictedCard} role="alert">
          <ShieldOff size={20} className={styles.restrictedIcon} aria-hidden="true" />
          <div>
            <p className={styles.restrictedTitle}>Acesso restrito</p>
            <p className={styles.restrictedMsg}>
              Seu perfil atual não tem acesso às informações de plano e assinatura.
              Fale com o(a) dono(a) da clínica se precisar dessas informações.
            </p>
          </div>
        </div>
      );
    }
    const msg =
      error instanceof ApiError
        ? error.message
        : 'Não foi possível carregar as informações da assinatura.';
    return (
      <div className={styles.errorCard} role="alert">
        <AlertCircle size={20} className={styles.errorIcon} aria-hidden="true" />
        <div>
          <p className={styles.errorTitle}>Erro ao carregar</p>
          <p className={styles.errorMsg}>{msg}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={styles.restrictedCard}>
        <Info size={20} className={styles.restrictedIcon} aria-hidden="true" />
        <div>
          <p className={styles.restrictedTitle}>Sem dados</p>
          <p className={styles.restrictedMsg}>
            Nenhuma informação de assinatura disponível no momento.
          </p>
        </div>
      </div>
    );
  }

  return <BillingContent billing={data} onAuriTour={onAuriTour} />;
}
