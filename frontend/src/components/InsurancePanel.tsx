// InsurancePanel.tsx — Sprint 4.7C (ADR 0016)
//
// Convênios v0.1 — painel administrativo/comercial.
//
// INVARIANTES DE SEGURANÇA:
// - member_number e holder_name são PII — nunca em console.log, localStorage,
//   sessionStorage ou URL. member_number raw só aparece no formulário de edição.
// - Listagem mostra somente member_number_masked ("****1234").
// - Escrita de operadoras/planos/preços: owner-only (backend é a defesa real).
// - Escrita de carteirinhas: owner + secretaria.
// - Profissional clínico recebe 403 do backend em todos os endpoints; UI exibe
//   card "Acesso restrito" genérico sem revelar a razão exata.
// - reference_price_cents: exibido como referência visual APENAS. Nunca
//   auto-popula amount_cents de cobranças.
// - Sem dangerouslySetInnerHTML. Erros genéricos ao usuário.
// - Ao cancelar edição ou fechar formulário: estado PII limpo imediatamente.

import { useState, useMemo, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  HeartHandshake,
  Loader2,
  Plus,
  Pencil,
  Power,
  Check,
  X,
  AlertCircle,
  ShieldOff,
} from 'lucide-react';
import {
  api,
  ApiError,
  type InsuranceProvider,
  type InsurancePlan,
  type PatientInsuranceListItem,
  type PatientInsurance,
  type ServiceInsurancePrice,
  type PublicPatient,
} from '../services/api';
import { getToken } from '../services/authStorage';
import { useAuth } from '../services/AuthProvider';
import styles from './InsurancePanel.module.css';

// ── Query keys ────────────────────────────────────────────────────────────────

const PROVIDERS_KEY = ['insurance', 'providers'] as const;
const PLANS_KEY = ['insurance', 'plans'] as const;
const PRICES_KEY = ['insurance', 'service-prices'] as const;

function patientInsurancesKey(patientId: string) {
  return ['patients', patientId, 'insurances'] as const;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCents(cents: number | null): string {
  if (cents === null) return '—';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function isExpired(valid_until: string | null): boolean {
  if (!valid_until) return false;
  return valid_until < new Date().toISOString().slice(0, 10);
}

function errMsg(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function is403(err: unknown): boolean {
  return err instanceof ApiError && err.status === 403;
}

// ── Providers Section ─────────────────────────────────────────────────────────

interface ProviderCardProps {
  provider: InsuranceProvider;
  token: string;
  isOwner: boolean;
  onMutated: () => void;
}

function ProviderCard({ provider, token, isOwner, onMutated }: ProviderCardProps): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(provider.name);
  const [editNotes, setEditNotes] = useState(provider.notes ?? '');
  const [cardError, setCardError] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: () =>
      api.updateInsuranceProvider(token, provider.id, {
        name: editName.trim(),
        notes: editNotes.trim() || null,
      }),
    onSuccess: () => {
      setEditing(false);
      setCardError(null);
      onMutated();
    },
    onError: (err) => setCardError(errMsg(err, 'Não foi possível salvar.')),
  });

  const statusMutation = useMutation({
    mutationFn: (active: boolean) =>
      api.updateInsuranceProviderStatus(token, provider.id, active),
    onSuccess: () => {
      setCardError(null);
      onMutated();
    },
    onError: (err) => setCardError(errMsg(err, 'Não foi possível alterar status.')),
  });

  function cancelEdit(): void {
    setEditing(false);
    setCardError(null);
    setEditName(provider.name);
    setEditNotes(provider.notes ?? '');
  }

  return (
    <li className={`${styles.card} ${!provider.active ? styles.cardInactive : ''}`}>
      {!editing ? (
        <>
          <div className={styles.cardTop}>
            <div className={styles.cardInfo}>
              <span className={styles.cardName}>{provider.name}</span>
              {!provider.active && <span className={styles.inactiveChip}>Inativo</span>}
            </div>
            {isOwner && (
              <div className={styles.cardActions}>
                <button
                  type="button"
                  className={styles.actionBtn}
                  title="Editar"
                  onClick={() => setEditing(true)}
                >
                  <Pencil size={12} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={styles.actionBtn}
                  title={provider.active ? 'Desativar' : 'Reativar'}
                  disabled={statusMutation.isPending}
                  onClick={() => statusMutation.mutate(!provider.active)}
                >
                  <Power size={12} aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
          {provider.notes && <p className={styles.cardNotes}>{provider.notes}</p>}
          {cardError && (
            <div className={styles.cardError}>
              <AlertCircle size={12} aria-hidden="true" />
              {cardError}
            </div>
          )}
        </>
      ) : (
        <div className={styles.editForm}>
          <div className={styles.editGrid}>
            <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
              <label className={styles.fieldLabel} htmlFor={`prov-name-${provider.id}`}>
                Nome<span className={styles.required}>*</span>
              </label>
              <input
                id={`prov-name-${provider.id}`}
                type="text"
                className={styles.input}
                value={editName}
                maxLength={200}
                onChange={(e) => setEditName(e.target.value)}
                disabled={updateMutation.isPending}
              />
            </div>
            <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
              <label className={styles.fieldLabel} htmlFor={`prov-notes-${provider.id}`}>
                Observações internas
              </label>
              <textarea
                id={`prov-notes-${provider.id}`}
                className={`${styles.input} ${styles.textarea}`}
                value={editNotes}
                maxLength={500}
                rows={2}
                onChange={(e) => setEditNotes(e.target.value)}
                disabled={updateMutation.isPending}
                placeholder="Observações administrativas. Não inclua dados clínicos."
              />
            </div>
          </div>
          {cardError && (
            <div className={styles.cardError}>
              <AlertCircle size={12} aria-hidden="true" />
              {cardError}
            </div>
          )}
          <div className={styles.editActions}>
            <button
              type="button"
              className={styles.primaryBtn}
              disabled={updateMutation.isPending || !editName.trim()}
              onClick={() => updateMutation.mutate()}
            >
              <Check size={13} aria-hidden="true" />
              Salvar
            </button>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={cancelEdit}
              disabled={updateMutation.isPending}
            >
              <X size={13} aria-hidden="true" />
              Cancelar
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function ProvidersSection({ token, isOwner }: { token: string; isOwner: boolean }): JSX.Element {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: [...PROVIDERS_KEY, 'all'],
    enabled: !!token,
    queryFn: async () => {
      const res = await api.listInsuranceProviders(token, { limit: 100 });
      return res.providers;
    },
  });

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: PROVIDERS_KEY });
  }

  const createMutation = useMutation({
    mutationFn: () =>
      api.createInsuranceProvider(token, {
        name: newName.trim(),
        notes: newNotes.trim() || null,
      }),
    onSuccess: () => {
      setNotice('Operadora criada.');
      setNewName('');
      setNewNotes('');
      setShowCreate(false);
      setCreateError(null);
      invalidate();
    },
    onError: (err) => setCreateError(errMsg(err, 'Não foi possível criar a operadora.')),
  });

  if (listQuery.isError && is403(listQuery.error)) {
    return (
      <div className={styles.restrictedCard}>
        <ShieldOff size={20} className={styles.restrictedIcon} aria-hidden="true" />
        <p className={styles.restrictedText}>
          Acesso restrito. Solicite permissão ao(à) dono(a) da clínica.
        </p>
      </div>
    );
  }

  const providers: InsuranceProvider[] = listQuery.data ?? [];

  return (
    <div className={styles.section}>
      <div className={styles.sectionHead}>
        <h3 className={styles.sectionTitle}>Operadoras</h3>
        <div className={styles.sectionActions}>
          {isOwner && !showCreate && (
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => { setShowCreate(true); setCreateError(null); }}
            >
              <Plus size={14} aria-hidden="true" />
              Nova operadora
            </button>
          )}
        </div>
      </div>
      <p className={styles.sectionHint}>
        Convênios e planos de saúde aceitos pela clínica.
      </p>

      {notice && <div className={styles.notice}>{notice}</div>}

      {listQuery.isError && !is403(listQuery.error) && (
        <div className={styles.fetchError}>
          <AlertCircle size={14} aria-hidden="true" />
          Não foi possível carregar operadoras.
          <button type="button" className={styles.refetchBtn} onClick={() => void listQuery.refetch()}>
            Tentar novamente
          </button>
        </div>
      )}

      {showCreate && (
        <div className={styles.createCard}>
          <div className={styles.createGrid}>
            <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
              <label className={styles.fieldLabel} htmlFor="prov-new-name">
                Nome<span className={styles.required}>*</span>
              </label>
              <input
                id="prov-new-name"
                type="text"
                className={styles.input}
                value={newName}
                maxLength={200}
                placeholder="Ex.: Unimed, Bradesco Saúde, Amil…"
                onChange={(e) => setNewName(e.target.value)}
                disabled={createMutation.isPending}
              />
            </div>
            <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
              <label className={styles.fieldLabel} htmlFor="prov-new-notes">
                Observações internas
              </label>
              <textarea
                id="prov-new-notes"
                className={`${styles.input} ${styles.textarea}`}
                value={newNotes}
                maxLength={500}
                rows={2}
                placeholder="Informações administrativas sobre esta operadora."
                onChange={(e) => setNewNotes(e.target.value)}
                disabled={createMutation.isPending}
              />
            </div>
          </div>
          <div className={styles.editNote}>
            Não inclua diagnóstico, CID, queixa ou informações clínicas.
          </div>
          {createError && (
            <div className={styles.createError}>
              <AlertCircle size={13} aria-hidden="true" />
              {createError}
            </div>
          )}
          <div className={styles.createActions}>
            <button
              type="button"
              className={styles.primaryBtn}
              disabled={createMutation.isPending || !newName.trim()}
              onClick={() => createMutation.mutate()}
            >
              <Check size={13} aria-hidden="true" />
              Criar operadora
            </button>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => { setShowCreate(false); setCreateError(null); }}
              disabled={createMutation.isPending}
            >
              <X size={13} aria-hidden="true" />
              Cancelar
            </button>
          </div>
        </div>
      )}

      {listQuery.isLoading && (
        <div className={styles.loading}>
          <Loader2 size={14} className={styles.spin} aria-hidden="true" />
          Carregando operadoras…
        </div>
      )}

      {!listQuery.isLoading && !listQuery.isError && providers.length === 0 && (
        <div className={styles.empty}>
          Nenhuma operadora cadastrada.
          {isOwner && ' Clique em "Nova operadora" para começar.'}
        </div>
      )}

      {providers.length > 0 && (
        <ul className={styles.list}>
          {providers.map((prov) => (
            <ProviderCard
              key={prov.id}
              provider={prov}
              token={token}
              isOwner={isOwner}
              onMutated={invalidate}
            />
          ))}
        </ul>
      )}

      {!isOwner && (
        <p className={styles.roleNote}>
          Apenas o(a) dono(a) da clínica pode criar ou editar operadoras.
        </p>
      )}
    </div>
  );
}

// ── Plans Section ─────────────────────────────────────────────────────────────

interface PlanCardProps {
  plan: InsurancePlan;
  token: string;
  isOwner: boolean;
  onMutated: () => void;
}

function PlanCard({ plan, token, isOwner, onMutated }: PlanCardProps): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(plan.name);
  const [editNotes, setEditNotes] = useState(plan.notes ?? '');
  const [cardError, setCardError] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: () =>
      api.updateInsurancePlan(token, plan.id, {
        name: editName.trim(),
        notes: editNotes.trim() || null,
      }),
    onSuccess: () => {
      setEditing(false);
      setCardError(null);
      onMutated();
    },
    onError: (err) => setCardError(errMsg(err, 'Não foi possível salvar.')),
  });

  const statusMutation = useMutation({
    mutationFn: (active: boolean) =>
      api.updateInsurancePlanStatus(token, plan.id, active),
    onSuccess: () => { setCardError(null); onMutated(); },
    onError: (err) => setCardError(errMsg(err, 'Não foi possível alterar status.')),
  });

  function cancelEdit(): void {
    setEditing(false);
    setCardError(null);
    setEditName(plan.name);
    setEditNotes(plan.notes ?? '');
  }

  return (
    <li className={`${styles.card} ${!plan.active ? styles.cardInactive : ''}`}>
      {!editing ? (
        <>
          <div className={styles.cardTop}>
            <div className={styles.cardInfo}>
              <span className={styles.cardName}>{plan.name}</span>
              {!plan.active && <span className={styles.inactiveChip}>Inativo</span>}
            </div>
            {isOwner && (
              <div className={styles.cardActions}>
                <button type="button" className={styles.actionBtn} title="Editar" onClick={() => setEditing(true)}>
                  <Pencil size={12} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={styles.actionBtn}
                  title={plan.active ? 'Desativar' : 'Reativar'}
                  disabled={statusMutation.isPending}
                  onClick={() => statusMutation.mutate(!plan.active)}
                >
                  <Power size={12} aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
          {plan.notes && <p className={styles.cardNotes}>{plan.notes}</p>}
          {cardError && (
            <div className={styles.cardError}>
              <AlertCircle size={12} aria-hidden="true" />
              {cardError}
            </div>
          )}
        </>
      ) : (
        <div className={styles.editForm}>
          <div className={styles.editGrid}>
            <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
              <label className={styles.fieldLabel} htmlFor={`plan-name-${plan.id}`}>
                Nome<span className={styles.required}>*</span>
              </label>
              <input
                id={`plan-name-${plan.id}`}
                type="text"
                className={styles.input}
                value={editName}
                maxLength={150}
                onChange={(e) => setEditName(e.target.value)}
                disabled={updateMutation.isPending}
              />
            </div>
            <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
              <label className={styles.fieldLabel} htmlFor={`plan-notes-${plan.id}`}>
                Observações
              </label>
              <textarea
                id={`plan-notes-${plan.id}`}
                className={`${styles.input} ${styles.textarea}`}
                value={editNotes}
                maxLength={500}
                rows={2}
                onChange={(e) => setEditNotes(e.target.value)}
                disabled={updateMutation.isPending}
              />
            </div>
          </div>
          {cardError && (
            <div className={styles.cardError}>
              <AlertCircle size={12} aria-hidden="true" />
              {cardError}
            </div>
          )}
          <div className={styles.editActions}>
            <button
              type="button"
              className={styles.primaryBtn}
              disabled={updateMutation.isPending || !editName.trim()}
              onClick={() => updateMutation.mutate()}
            >
              <Check size={13} aria-hidden="true" />
              Salvar
            </button>
            <button type="button" className={styles.secondaryBtn} onClick={cancelEdit} disabled={updateMutation.isPending}>
              <X size={13} aria-hidden="true" />
              Cancelar
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function PlansSection({
  token,
  isOwner,
  providers,
}: {
  token: string;
  isOwner: boolean;
  providers: InsuranceProvider[];
}): JSX.Element {
  const queryClient = useQueryClient();
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newProviderId, setNewProviderId] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const planKey = [...PLANS_KEY, selectedProviderId || 'all'] as const;

  const listQuery = useQuery({
    queryKey: planKey,
    enabled: !!token,
    queryFn: async () => {
      const res = await api.listInsurancePlans(token, {
        provider_id: selectedProviderId || undefined,
        limit: 100,
      });
      return res.plans;
    },
  });

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: PLANS_KEY });
  }

  const createMutation = useMutation({
    mutationFn: () => {
      if (!newProviderId) throw new ApiError(400, { code: 'validation', message: 'Selecione a operadora.' });
      return api.createInsurancePlan(token, {
        provider_id: newProviderId,
        name: newName.trim(),
        notes: newNotes.trim() || null,
      });
    },
    onSuccess: () => {
      setNotice('Plano criado.');
      setNewName('');
      setNewNotes('');
      setNewProviderId('');
      setShowCreate(false);
      setCreateError(null);
      invalidate();
    },
    onError: (err) => setCreateError(errMsg(err, 'Não foi possível criar o plano.')),
  });

  const activeProviders = providers.filter((p) => p.active);
  const plans: InsurancePlan[] = listQuery.data ?? [];

  return (
    <div className={styles.section}>
      <div className={styles.sectionHead}>
        <h3 className={styles.sectionTitle}>Planos</h3>
        <div className={styles.sectionActions}>
          <select
            className={styles.select}
            value={selectedProviderId}
            onChange={(e) => setSelectedProviderId(e.target.value)}
            style={{ padding: '0.38rem 0.6rem', fontSize: '0.88rem', minWidth: '10rem' }}
          >
            <option value="">Todas as operadoras</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {isOwner && !showCreate && (
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => { setShowCreate(true); setCreateError(null); }}
            >
              <Plus size={14} aria-hidden="true" />
              Novo plano
            </button>
          )}
        </div>
      </div>
      <p className={styles.sectionHint}>
        Planos de cada operadora. Opcional — clínicas sem distinção de plano podem deixar em branco ao registrar carteirinha.
      </p>

      {notice && <div className={styles.notice}>{notice}</div>}

      {listQuery.isError && (
        <div className={styles.fetchError}>
          <AlertCircle size={14} aria-hidden="true" />
          Não foi possível carregar planos.
          <button type="button" className={styles.refetchBtn} onClick={() => void listQuery.refetch()}>
            Tentar novamente
          </button>
        </div>
      )}

      {showCreate && (
        <div className={styles.createCard}>
          <div className={styles.createGrid}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="plan-new-provider">
                Operadora<span className={styles.required}>*</span>
              </label>
              <select
                id="plan-new-provider"
                className={styles.select}
                value={newProviderId}
                onChange={(e) => setNewProviderId(e.target.value)}
                disabled={createMutation.isPending}
              >
                <option value="">Selecione…</option>
                {activeProviders.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="plan-new-name">
                Nome do plano<span className={styles.required}>*</span>
              </label>
              <input
                id="plan-new-name"
                type="text"
                className={styles.input}
                value={newName}
                maxLength={150}
                placeholder="Ex.: Enfermaria, Apartamento, Nacional…"
                onChange={(e) => setNewName(e.target.value)}
                disabled={createMutation.isPending}
              />
            </div>
            <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
              <label className={styles.fieldLabel} htmlFor="plan-new-notes">
                Observações
              </label>
              <textarea
                id="plan-new-notes"
                className={`${styles.input} ${styles.textarea}`}
                value={newNotes}
                maxLength={500}
                rows={2}
                placeholder="Informações administrativas sobre este plano."
                onChange={(e) => setNewNotes(e.target.value)}
                disabled={createMutation.isPending}
              />
            </div>
          </div>
          {createError && (
            <div className={styles.createError}>
              <AlertCircle size={13} aria-hidden="true" />
              {createError}
            </div>
          )}
          <div className={styles.createActions}>
            <button
              type="button"
              className={styles.primaryBtn}
              disabled={createMutation.isPending || !newName.trim() || !newProviderId}
              onClick={() => createMutation.mutate()}
            >
              <Check size={13} aria-hidden="true" />
              Criar plano
            </button>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => { setShowCreate(false); setCreateError(null); }}
              disabled={createMutation.isPending}
            >
              <X size={13} aria-hidden="true" />
              Cancelar
            </button>
          </div>
        </div>
      )}

      {listQuery.isLoading && (
        <div className={styles.loading}>
          <Loader2 size={14} className={styles.spin} aria-hidden="true" />
          Carregando planos…
        </div>
      )}

      {!listQuery.isLoading && !listQuery.isError && plans.length === 0 && (
        <div className={styles.empty}>
          Nenhum plano cadastrado
          {selectedProviderId ? ' para esta operadora' : ''}.
        </div>
      )}

      {plans.length > 0 && (
        <ul className={styles.list}>
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              token={token}
              isOwner={isOwner}
              onMutated={invalidate}
            />
          ))}
        </ul>
      )}

      {!isOwner && (
        <p className={styles.roleNote}>
          Apenas o(a) dono(a) da clínica pode criar ou editar planos.
        </p>
      )}
    </div>
  );
}

// ── Patient Insurances Section ────────────────────────────────────────────────

interface PatientInsCardProps {
  ins: PatientInsuranceListItem;
  token: string;
  patientId: string;
  providers: InsuranceProvider[];
  allPlans: InsurancePlan[];
  canWrite: boolean;
  onMutated: () => void;
}

function PatientInsCard({
  ins,
  token,
  patientId,
  providers,
  allPlans,
  canWrite,
  onMutated,
}: PatientInsCardProps): JSX.Element {
  const [editing, setEditing] = useState(false);
  // PII: member_number raw only loaded when editing. Cleared on cancel/close.
  const [rawMemberNumber, setRawMemberNumber] = useState('');
  const [editHolder, setEditHolder] = useState('');
  const [editValidUntil, setEditValidUntil] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editProviderId, setEditProviderId] = useState('');
  const [editPlanId, setEditPlanId] = useState('');
  const [cardError, setCardError] = useState<string | null>(null);

  const providerName = providers.find((p) => p.id === ins.provider_id)?.name ?? '(Operadora)';
  const planName = allPlans.find((p) => p.id === ins.plan_id)?.name ?? null;

  // Load detail (raw member_number) only when user opens edit mode
  const detailQuery = useQuery({
    queryKey: ['patients', patientId, 'insurances', ins.id, 'detail'],
    enabled: editing && !!token,
    staleTime: 0,
    queryFn: async () => {
      const res = await api.getPatientInsurance(token, patientId, ins.id);
      return res.insurance;
    },
  });

  // Populate form once detail loaded — clear PII when done
  useEffect(() => {
    if (detailQuery.data && editing) {
      const d: PatientInsurance = detailQuery.data;
      setRawMemberNumber(d.member_number ?? '');
      setEditHolder(d.holder_name ?? '');
      setEditValidUntil(d.valid_until ?? '');
      setEditNotes(d.notes ?? '');
      setEditProviderId(d.provider_id ?? '');
      setEditPlanId(d.plan_id ?? '');
    }
  }, [detailQuery.data, editing]);

  function cancelEdit(): void {
    setEditing(false);
    setCardError(null);
    // Clear PII state immediately
    setRawMemberNumber('');
    setEditHolder('');
    setEditValidUntil('');
    setEditNotes('');
    setEditProviderId('');
    setEditPlanId('');
  }

  const updateMutation = useMutation({
    mutationFn: () =>
      api.updatePatientInsurance(token, patientId, ins.id, {
        provider_id: editProviderId || undefined,
        plan_id: editPlanId || null,
        member_number: rawMemberNumber.trim() || null,
        holder_name: editHolder.trim() || null,
        valid_until: editValidUntil || null,
        notes: editNotes.trim() || null,
      }),
    onSuccess: () => {
      cancelEdit();
      onMutated();
    },
    onError: (err) => setCardError(errMsg(err, 'Não foi possível salvar.')),
  });

  const statusMutation = useMutation({
    mutationFn: (active: boolean) =>
      api.updatePatientInsuranceStatus(token, patientId, ins.id, active),
    onSuccess: () => { setCardError(null); onMutated(); },
    onError: (err) => setCardError(errMsg(err, 'Não foi possível alterar status.')),
  });

  const plansForProvider = allPlans.filter((p) => p.provider_id === editProviderId && p.active);
  const expired = isExpired(ins.valid_until);

  return (
    <li className={`${styles.card} ${!ins.active ? styles.cardInactive : ''}`}>
      {!editing ? (
        <>
          <div className={styles.cardTop}>
            <div className={styles.cardInfo}>
              <span className={styles.cardName}>{providerName}</span>
              {planName && <span className={styles.chip}>{planName}</span>}
              {!ins.active && <span className={styles.inactiveChip}>Inativo</span>}
              {expired && ins.active && <span className={styles.expiredChip}>Vencido</span>}
            </div>
            {canWrite && (
              <div className={styles.cardActions}>
                <button
                  type="button"
                  className={styles.actionBtn}
                  title="Editar"
                  onClick={() => setEditing(true)}
                >
                  <Pencil size={12} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={styles.actionBtn}
                  title={ins.active ? 'Desativar' : 'Reativar'}
                  disabled={statusMutation.isPending}
                  onClick={() => statusMutation.mutate(!ins.active)}
                >
                  <Power size={12} aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
          <div className={styles.cardMeta}>
            {ins.member_number_masked && (
              <span className={styles.maskedNum}>{ins.member_number_masked}</span>
            )}
            {ins.valid_until && (
              <span className={styles.validUntil}>Válido até: {formatDate(ins.valid_until)}</span>
            )}
          </div>
          {cardError && (
            <div className={styles.cardError}>
              <AlertCircle size={12} aria-hidden="true" />
              {cardError}
            </div>
          )}
        </>
      ) : (
        <div className={styles.editForm}>
          {detailQuery.isLoading && (
            <div className={styles.loading}>
              <Loader2 size={13} className={styles.spin} aria-hidden="true" />
              Carregando dados…
            </div>
          )}
          {!detailQuery.isLoading && (
            <div className={styles.editGrid}>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel} htmlFor={`pins-prov-${ins.id}`}>
                  Operadora<span className={styles.required}>*</span>
                </label>
                <select
                  id={`pins-prov-${ins.id}`}
                  className={styles.select}
                  value={editProviderId}
                  onChange={(e) => { setEditProviderId(e.target.value); setEditPlanId(''); }}
                  disabled={updateMutation.isPending}
                >
                  <option value="">Selecione…</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel} htmlFor={`pins-plan-${ins.id}`}>
                  Plano (opcional)
                </label>
                <select
                  id={`pins-plan-${ins.id}`}
                  className={styles.select}
                  value={editPlanId}
                  onChange={(e) => setEditPlanId(e.target.value)}
                  disabled={updateMutation.isPending || !editProviderId}
                >
                  <option value="">Sem plano específico</option>
                  {plansForProvider.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel} htmlFor={`pins-num-${ins.id}`}>
                  Número da carteirinha
                </label>
                <input
                  id={`pins-num-${ins.id}`}
                  type="text"
                  className={styles.input}
                  value={rawMemberNumber}
                  maxLength={100}
                  autoComplete="off"
                  onChange={(e) => setRawMemberNumber(e.target.value)}
                  disabled={updateMutation.isPending}
                  placeholder="Número completo da carteirinha"
                />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel} htmlFor={`pins-holder-${ins.id}`}>
                  Titular do plano
                </label>
                <input
                  id={`pins-holder-${ins.id}`}
                  type="text"
                  className={styles.input}
                  value={editHolder}
                  maxLength={200}
                  onChange={(e) => setEditHolder(e.target.value)}
                  disabled={updateMutation.isPending}
                  placeholder="Nome completo do titular (se diferente do paciente)"
                />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel} htmlFor={`pins-valid-${ins.id}`}>
                  Válido até
                </label>
                <input
                  id={`pins-valid-${ins.id}`}
                  type="date"
                  className={styles.input}
                  value={editValidUntil}
                  onChange={(e) => setEditValidUntil(e.target.value)}
                  disabled={updateMutation.isPending}
                />
              </div>
              <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
                <label className={styles.fieldLabel} htmlFor={`pins-notes-${ins.id}`}>
                  Observações administrativas
                </label>
                <textarea
                  id={`pins-notes-${ins.id}`}
                  className={`${styles.input} ${styles.textarea}`}
                  value={editNotes}
                  maxLength={500}
                  rows={2}
                  onChange={(e) => setEditNotes(e.target.value)}
                  disabled={updateMutation.isPending}
                  placeholder="Observações administrativas. Não inclua dados de saúde."
                />
              </div>
            </div>
          )}
          <div className={styles.editNote}>
            Não inclua diagnóstico, queixa clínica, prescrição ou dados de saúde.
          </div>
          {cardError && (
            <div className={styles.cardError}>
              <AlertCircle size={12} aria-hidden="true" />
              {cardError}
            </div>
          )}
          <div className={styles.editActions}>
            <button
              type="button"
              className={styles.primaryBtn}
              disabled={updateMutation.isPending || detailQuery.isLoading}
              onClick={() => updateMutation.mutate()}
            >
              <Check size={13} aria-hidden="true" />
              Salvar
            </button>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={cancelEdit}
              disabled={updateMutation.isPending}
            >
              <X size={13} aria-hidden="true" />
              Cancelar
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function PatientInsurancesSection({
  token,
  canWrite,
  providers,
  allPlans,
  patients,
}: {
  token: string;
  canWrite: boolean;
  providers: InsuranceProvider[];
  allPlans: InsurancePlan[];
  patients: PublicPatient[];
}): JSX.Element {
  const queryClient = useQueryClient();
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newProviderId, setNewProviderId] = useState('');
  const [newPlanId, setNewPlanId] = useState('');
  const [newMemberNumber, setNewMemberNumber] = useState('');
  const [newHolder, setNewHolder] = useState('');
  const [newValidUntil, setNewValidUntil] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const insKey = selectedPatientId ? patientInsurancesKey(selectedPatientId) : null;

  const listQuery = useQuery({
    queryKey: insKey ?? ['patients', '__none__', 'insurances'],
    enabled: !!token && !!selectedPatientId,
    queryFn: async () => {
      const res = await api.listPatientInsurances(token, selectedPatientId);
      return res.insurances;
    },
  });

  function invalidate(): void {
    if (selectedPatientId) {
      void queryClient.invalidateQueries({ queryKey: patientInsurancesKey(selectedPatientId) });
    }
  }

  function clearCreateForm(): void {
    // Clear PII fields
    setNewMemberNumber('');
    setNewHolder('');
    setNewProviderId('');
    setNewPlanId('');
    setNewValidUntil('');
    setNewNotes('');
    setCreateError(null);
  }

  const createMutation = useMutation({
    mutationFn: () => {
      if (!selectedPatientId)
        throw new ApiError(400, { code: 'validation', message: 'Selecione um paciente.' });
      if (!newProviderId)
        throw new ApiError(400, { code: 'validation', message: 'Selecione a operadora.' });
      return api.createPatientInsurance(token, selectedPatientId, {
        provider_id: newProviderId,
        plan_id: newPlanId || null,
        member_number: newMemberNumber.trim() || null,
        holder_name: newHolder.trim() || null,
        valid_until: newValidUntil || null,
        notes: newNotes.trim() || null,
      });
    },
    onSuccess: () => {
      setNotice('Carteirinha registrada.');
      setShowCreate(false);
      clearCreateForm();
      invalidate();
    },
    onError: (err) => setCreateError(errMsg(err, 'Não foi possível registrar a carteirinha.')),
  });

  const activePatients = useMemo(
    () => patients.filter((p) => p.status === 'active').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [patients],
  );
  const newPlansForProvider = allPlans.filter((p) => p.provider_id === newProviderId && p.active);
  const activeProviders = providers.filter((p) => p.active);
  const insurances: PatientInsuranceListItem[] = listQuery.data ?? [];

  return (
    <div className={styles.section}>
      <div className={styles.sectionHead}>
        <h3 className={styles.sectionTitle}>Carteirinhas de Pacientes</h3>
        <div className={styles.sectionActions}>
          {canWrite && selectedPatientId && !showCreate && (
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => { setShowCreate(true); setCreateError(null); }}
            >
              <Plus size={14} aria-hidden="true" />
              Registrar carteirinha
            </button>
          )}
        </div>
      </div>

      <div className={styles.patientSelectorRow}>
        <label className={styles.patientSelectorLabel} htmlFor="ins-patient-select">
          Paciente:
        </label>
        <select
          id="ins-patient-select"
          className={styles.patientSelect}
          value={selectedPatientId}
          onChange={(e) => {
            setSelectedPatientId(e.target.value);
            setShowCreate(false);
            clearCreateForm();
            setNotice(null);
          }}
        >
          <option value="">Selecione o paciente…</option>
          {activePatients.map((p) => (
            <option key={p.id} value={p.id}>{p.nome}</option>
          ))}
        </select>
      </div>

      {notice && <div className={styles.notice}>{notice}</div>}

      {!selectedPatientId && (
        <div className={styles.empty}>
          Selecione um paciente acima para ver ou registrar convênios.
        </div>
      )}

      {selectedPatientId && listQuery.isError && (
        <div className={styles.fetchError}>
          <AlertCircle size={14} aria-hidden="true" />
          Não foi possível carregar carteirinhas.
          <button type="button" className={styles.refetchBtn} onClick={() => void listQuery.refetch()}>
            Tentar novamente
          </button>
        </div>
      )}

      {selectedPatientId && showCreate && (
        <div className={styles.createCard}>
          <div className={styles.createGrid}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="pins-new-prov">
                Operadora<span className={styles.required}>*</span>
              </label>
              <select
                id="pins-new-prov"
                className={styles.select}
                value={newProviderId}
                onChange={(e) => { setNewProviderId(e.target.value); setNewPlanId(''); }}
                disabled={createMutation.isPending}
              >
                <option value="">Selecione…</option>
                {activeProviders.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {activeProviders.length === 0 && (
                <span className={styles.fieldHint}>
                  Cadastre operadoras na seção acima primeiro.
                </span>
              )}
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="pins-new-plan">
                Plano (opcional)
              </label>
              <select
                id="pins-new-plan"
                className={styles.select}
                value={newPlanId}
                onChange={(e) => setNewPlanId(e.target.value)}
                disabled={createMutation.isPending || !newProviderId}
              >
                <option value="">Sem plano específico</option>
                {newPlansForProvider.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="pins-new-num">
                Número da carteirinha
              </label>
              <input
                id="pins-new-num"
                type="text"
                className={styles.input}
                value={newMemberNumber}
                maxLength={100}
                autoComplete="off"
                placeholder="Número completo da carteirinha"
                onChange={(e) => setNewMemberNumber(e.target.value)}
                disabled={createMutation.isPending}
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="pins-new-holder">
                Titular do plano
              </label>
              <input
                id="pins-new-holder"
                type="text"
                className={styles.input}
                value={newHolder}
                maxLength={200}
                placeholder="Nome completo do titular (se diferente do paciente)"
                onChange={(e) => setNewHolder(e.target.value)}
                disabled={createMutation.isPending}
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="pins-new-valid">
                Válido até
              </label>
              <input
                id="pins-new-valid"
                type="date"
                className={styles.input}
                value={newValidUntil}
                onChange={(e) => setNewValidUntil(e.target.value)}
                disabled={createMutation.isPending}
              />
            </div>
            <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
              <label className={styles.fieldLabel} htmlFor="pins-new-notes">
                Observações administrativas
              </label>
              <textarea
                id="pins-new-notes"
                className={`${styles.input} ${styles.textarea}`}
                value={newNotes}
                maxLength={500}
                rows={2}
                placeholder="Observações administrativas. Não inclua dados de saúde."
                onChange={(e) => setNewNotes(e.target.value)}
                disabled={createMutation.isPending}
              />
            </div>
          </div>
          <div className={styles.editNote}>
            Não inclua diagnóstico, queixa clínica, prescrição ou dados de saúde.
          </div>
          {createError && (
            <div className={styles.createError}>
              <AlertCircle size={13} aria-hidden="true" />
              {createError}
            </div>
          )}
          <div className={styles.createActions}>
            <button
              type="button"
              className={styles.primaryBtn}
              disabled={createMutation.isPending || !newProviderId}
              onClick={() => createMutation.mutate()}
            >
              <Check size={13} aria-hidden="true" />
              Registrar
            </button>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => { setShowCreate(false); clearCreateForm(); }}
              disabled={createMutation.isPending}
            >
              <X size={13} aria-hidden="true" />
              Cancelar
            </button>
          </div>
        </div>
      )}

      {selectedPatientId && listQuery.isLoading && (
        <div className={styles.loading}>
          <Loader2 size={14} className={styles.spin} aria-hidden="true" />
          Carregando carteirinhas…
        </div>
      )}

      {selectedPatientId && !listQuery.isLoading && !listQuery.isError && insurances.length === 0 && !showCreate && (
        <div className={styles.empty}>
          Este paciente ainda não tem convênio cadastrado.
          {canWrite && ' Clique em "Registrar carteirinha" para adicionar.'}
        </div>
      )}

      {insurances.length > 0 && (
        <ul className={styles.list}>
          {insurances.map((ins) => (
            <PatientInsCard
              key={ins.id}
              ins={ins}
              token={token}
              patientId={selectedPatientId}
              providers={providers}
              allPlans={allPlans}
              canWrite={canWrite}
              onMutated={invalidate}
            />
          ))}
        </ul>
      )}

      {!canWrite && (
        <p className={styles.roleNote}>
          Você pode visualizar carteirinhas de pacientes. Apenas o(a) dono(a) da clínica e funcionário(a) com acesso administrativo podem registrar carteirinhas.
        </p>
      )}
    </div>
  );
}

// ── Service Prices Section ────────────────────────────────────────────────────

interface PriceCardProps {
  price: ServiceInsurancePrice;
  token: string;
  isOwner: boolean;
  providers: InsuranceProvider[];
  allPlans: InsurancePlan[];
  services: import('../services/api').ClinicService[];
  onMutated: () => void;
}

function PriceCard({ price, token, isOwner, providers, allPlans, services, onMutated }: PriceCardProps): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [editPrice, setEditPrice] = useState(
    price.reference_price_cents !== null
      ? (price.reference_price_cents / 100).toFixed(2).replace('.', ',')
      : '',
  );
  const [editNotes, setEditNotes] = useState(price.notes ?? '');
  const [cardError, setCardError] = useState<string | null>(null);

  const providerName = providers.find((p) => p.id === price.provider_id)?.name ?? '(Operadora)';
  const planName = allPlans.find((p) => p.id === price.plan_id)?.name ?? null;
  const serviceName = services.find((s) => s.id === price.service_id)?.name ?? '(Serviço)';

  const updateMutation = useMutation({
    mutationFn: () => {
      const raw = editPrice.trim().replace(',', '.');
      const cents = raw === '' ? null : Math.round(parseFloat(raw) * 100);
      return api.updateServiceInsurancePrice(token, price.id, {
        reference_price_cents: cents === null || isNaN(cents) ? null : cents,
        notes: editNotes.trim() || null,
      });
    },
    onSuccess: () => { setEditing(false); setCardError(null); onMutated(); },
    onError: (err) => setCardError(errMsg(err, 'Não foi possível salvar.')),
  });

  const statusMutation = useMutation({
    mutationFn: (active: boolean) =>
      api.updateServiceInsurancePriceStatus(token, price.id, active),
    onSuccess: () => { setCardError(null); onMutated(); },
    onError: (err) => setCardError(errMsg(err, 'Não foi possível alterar status.')),
  });

  return (
    <li className={`${styles.card} ${!price.active ? styles.cardInactive : ''}`}>
      {!editing ? (
        <>
          <div className={styles.cardTop}>
            <div className={styles.cardInfo}>
              <span className={styles.cardName}>{serviceName}</span>
              <span className={styles.chip}>{providerName}</span>
              {planName && <span className={styles.chip}>{planName}</span>}
              {!price.active && <span className={styles.inactiveChip}>Inativo</span>}
            </div>
            <div className={styles.cardMeta}>
              {price.reference_price_cents !== null && (
                <span style={{ fontWeight: 600, color: 'var(--cyan-soft)' }}>
                  {formatCents(price.reference_price_cents)}
                </span>
              )}
              {isOwner && (
                <div className={styles.cardActions}>
                  <button type="button" className={styles.actionBtn} title="Editar" onClick={() => setEditing(true)}>
                    <Pencil size={12} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={styles.actionBtn}
                    title={price.active ? 'Desativar' : 'Reativar'}
                    disabled={statusMutation.isPending}
                    onClick={() => statusMutation.mutate(!price.active)}
                  >
                    <Power size={12} aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          </div>
          {price.notes && <p className={styles.cardNotes}>{price.notes}</p>}
          {cardError && (
            <div className={styles.cardError}>
              <AlertCircle size={12} aria-hidden="true" />
              {cardError}
            </div>
          )}
        </>
      ) : (
        <div className={styles.editForm}>
          <div className={styles.editGrid}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor={`price-val-${price.id}`}>
                Preço de referência (R$)
              </label>
              <input
                id={`price-val-${price.id}`}
                type="text"
                inputMode="decimal"
                className={styles.input}
                value={editPrice}
                placeholder="0,00"
                onChange={(e) => setEditPrice(e.target.value)}
                disabled={updateMutation.isPending}
              />
              <span className={styles.fieldHint}>Referência. O valor da cobrança é confirmado manualmente.</span>
            </div>
            <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
              <label className={styles.fieldLabel} htmlFor={`price-notes-${price.id}`}>
                Observações
              </label>
              <textarea
                id={`price-notes-${price.id}`}
                className={`${styles.input} ${styles.textarea}`}
                value={editNotes}
                maxLength={500}
                rows={2}
                onChange={(e) => setEditNotes(e.target.value)}
                disabled={updateMutation.isPending}
              />
            </div>
          </div>
          {cardError && (
            <div className={styles.cardError}>
              <AlertCircle size={12} aria-hidden="true" />
              {cardError}
            </div>
          )}
          <div className={styles.editActions}>
            <button
              type="button"
              className={styles.primaryBtn}
              disabled={updateMutation.isPending}
              onClick={() => updateMutation.mutate()}
            >
              <Check size={13} aria-hidden="true" />
              Salvar
            </button>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => { setEditing(false); setCardError(null); setEditPrice(price.reference_price_cents !== null ? (price.reference_price_cents / 100).toFixed(2).replace('.', ',') : ''); setEditNotes(price.notes ?? ''); }}
              disabled={updateMutation.isPending}
            >
              <X size={13} aria-hidden="true" />
              Cancelar
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function ServicePricesSection({
  token,
  isOwner,
  providers,
  allPlans,
}: {
  token: string;
  isOwner: boolean;
  providers: InsuranceProvider[];
  allPlans: InsurancePlan[];
}): JSX.Element {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newServiceId, setNewServiceId] = useState('');
  const [newProviderId, setNewProviderId] = useState('');
  const [newPlanId, setNewPlanId] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const pricesKey = [...PRICES_KEY, 'all'] as const;

  const listQuery = useQuery({
    queryKey: pricesKey,
    enabled: !!token,
    queryFn: async () => {
      const res = await api.listServiceInsurancePrices(token, { active: undefined });
      return res.prices;
    },
  });

  const servicesQuery = useQuery({
    queryKey: ['clinic-services', 'active-for-prices'],
    enabled: !!token,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await api.listClinicServices(token, { active: true, limit: 100 });
      return res.services;
    },
  });

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: PRICES_KEY });
  }

  const createMutation = useMutation({
    mutationFn: () => {
      if (!newServiceId) throw new ApiError(400, { code: 'validation', message: 'Selecione o serviço.' });
      if (!newProviderId) throw new ApiError(400, { code: 'validation', message: 'Selecione a operadora.' });
      const raw = newPrice.trim().replace(',', '.');
      const cents = raw === '' ? null : Math.round(parseFloat(raw) * 100);
      return api.createServiceInsurancePrice(token, {
        service_id: newServiceId,
        provider_id: newProviderId,
        plan_id: newPlanId || null,
        reference_price_cents: cents === null || isNaN(cents as number) ? null : (cents as number),
        notes: newNotes.trim() || null,
      });
    },
    onSuccess: () => {
      setNotice('Preço de referência criado.');
      setNewServiceId('');
      setNewProviderId('');
      setNewPlanId('');
      setNewPrice('');
      setNewNotes('');
      setShowCreate(false);
      setCreateError(null);
      invalidate();
    },
    onError: (err) => setCreateError(errMsg(err, 'Não foi possível criar o preço.')),
  });

  const services = servicesQuery.data ?? [];
  const prices: ServiceInsurancePrice[] = listQuery.data ?? [];
  const activeProviders = providers.filter((p) => p.active);
  const newPlansForProvider = allPlans.filter((p) => p.provider_id === newProviderId && p.active);

  return (
    <div className={styles.section}>
      <div className={styles.sectionHead}>
        <h3 className={styles.sectionTitle}>Preços por serviço</h3>
        <div className={styles.sectionActions}>
          {isOwner && !showCreate && (
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => { setShowCreate(true); setCreateError(null); }}
            >
              <Plus size={14} aria-hidden="true" />
              Novo preço
            </button>
          )}
        </div>
      </div>
      <p className={styles.refNote}>
        Preço de referência por serviço × operadora. O valor da cobrança é sempre confirmado manualmente pelo operador.
      </p>

      {notice && <div className={styles.notice}>{notice}</div>}

      {listQuery.isError && (
        <div className={styles.fetchError}>
          <AlertCircle size={14} aria-hidden="true" />
          Não foi possível carregar preços.
          <button type="button" className={styles.refetchBtn} onClick={() => void listQuery.refetch()}>
            Tentar novamente
          </button>
        </div>
      )}

      {showCreate && (
        <div className={styles.createCard}>
          <div className={styles.createGrid}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="price-new-svc">
                Serviço<span className={styles.required}>*</span>
              </label>
              <select
                id="price-new-svc"
                className={styles.select}
                value={newServiceId}
                onChange={(e) => setNewServiceId(e.target.value)}
                disabled={createMutation.isPending}
              >
                <option value="">Selecione…</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="price-new-prov">
                Operadora<span className={styles.required}>*</span>
              </label>
              <select
                id="price-new-prov"
                className={styles.select}
                value={newProviderId}
                onChange={(e) => { setNewProviderId(e.target.value); setNewPlanId(''); }}
                disabled={createMutation.isPending}
              >
                <option value="">Selecione…</option>
                {activeProviders.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="price-new-plan">
                Plano (opcional)
              </label>
              <select
                id="price-new-plan"
                className={styles.select}
                value={newPlanId}
                onChange={(e) => setNewPlanId(e.target.value)}
                disabled={createMutation.isPending || !newProviderId}
              >
                <option value="">Sem plano específico</option>
                {newPlansForProvider.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="price-new-val">
                Preço de referência (R$)
              </label>
              <input
                id="price-new-val"
                type="text"
                inputMode="decimal"
                className={styles.input}
                value={newPrice}
                placeholder="0,00"
                onChange={(e) => setNewPrice(e.target.value)}
                disabled={createMutation.isPending}
              />
              <span className={styles.fieldHint}>Referência visual. Nunca aplicado automaticamente à cobrança.</span>
            </div>
            <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
              <label className={styles.fieldLabel} htmlFor="price-new-notes">
                Observações
              </label>
              <textarea
                id="price-new-notes"
                className={`${styles.input} ${styles.textarea}`}
                value={newNotes}
                maxLength={500}
                rows={2}
                onChange={(e) => setNewNotes(e.target.value)}
                disabled={createMutation.isPending}
              />
            </div>
          </div>
          {createError && (
            <div className={styles.createError}>
              <AlertCircle size={13} aria-hidden="true" />
              {createError}
            </div>
          )}
          <div className={styles.createActions}>
            <button
              type="button"
              className={styles.primaryBtn}
              disabled={createMutation.isPending || !newServiceId || !newProviderId}
              onClick={() => createMutation.mutate()}
            >
              <Check size={13} aria-hidden="true" />
              Criar preço
            </button>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => { setShowCreate(false); setCreateError(null); }}
              disabled={createMutation.isPending}
            >
              <X size={13} aria-hidden="true" />
              Cancelar
            </button>
          </div>
        </div>
      )}

      {listQuery.isLoading && (
        <div className={styles.loading}>
          <Loader2 size={14} className={styles.spin} aria-hidden="true" />
          Carregando preços…
        </div>
      )}

      {!listQuery.isLoading && !listQuery.isError && prices.length === 0 && (
        <div className={styles.empty}>
          Nenhum preço de referência cadastrado.
        </div>
      )}

      {prices.length > 0 && (
        <ul className={styles.list}>
          {prices.map((p) => (
            <PriceCard
              key={p.id}
              price={p}
              token={token}
              isOwner={isOwner}
              providers={providers}
              allPlans={allPlans}
              services={services}
              onMutated={invalidate}
            />
          ))}
        </ul>
      )}

      {!isOwner && (
        <p className={styles.roleNote}>
          Apenas o(a) dono(a) da clínica pode criar ou editar preços de referência.
        </p>
      )}
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

type InsuranceTab = 'accepted' | 'cards' | 'prices';

export function InsurancePanel(): JSX.Element {
  const { user } = useAuth();
  const isOwner = user?.papel === 'dono_clinica';
  const canWriteCards = isOwner || user?.papel === 'secretaria';
  const token = getToken();
  const [activeTab, setActiveTab] = useState<InsuranceTab>('cards');

  // Load providers once — shared across sections
  const providersQuery = useQuery({
    queryKey: [...PROVIDERS_KEY, 'shared'],
    enabled: !!token,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await api.listInsuranceProviders(token as string, { limit: 100 });
      return res.providers;
    },
  });

  // Load all plans once — shared across sections
  const plansQuery = useQuery({
    queryKey: [...PLANS_KEY, 'shared'],
    enabled: !!token,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await api.listInsurancePlans(token as string, { limit: 200 });
      return res.plans;
    },
  });

  // Load patients for patient insurance section
  const patientsQuery = useQuery({
    queryKey: ['patients', 'active-for-insurance'],
    enabled: !!token,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await api.listPatients(token as string, { limit: 100, status: 'active' });
      return res.patients;
    },
  });

  if (providersQuery.isError && is403(providersQuery.error)) {
    return (
      <div className={styles.panel}>
        <div className={styles.head}>
          <h3 className={styles.title}>
            <HeartHandshake size={20} aria-hidden="true" />
            Convênios
          </h3>
        </div>
        <div className={styles.restrictedCard}>
          <ShieldOff size={22} className={styles.restrictedIcon} aria-hidden="true" />
          <p className={styles.restrictedText}>
            Acesso restrito ao painel de convênios. Solicite permissão ao(à) dono(a) da clínica.
          </p>
        </div>
      </div>
    );
  }

  const providers = providersQuery.data ?? [];
  const allPlans = plansQuery.data ?? [];
  const patients: PublicPatient[] = patientsQuery.data ?? [];

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <h3 className={styles.title}>
          <HeartHandshake size={20} aria-hidden="true" />
          Convênios
          <span className={styles.categoryChip}>Administrativo</span>
        </h3>
      </div>

      <p className={styles.subtitle}>
        Cadastre convênios aceitos pela clínica e use essas informações em pacientes e cobranças.
        Apenas dados administrativos — sem diagnóstico, CID ou informações clínicas.
      </p>

      <nav className={styles.tabBar} aria-label="Seções de convênios">
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'cards' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('cards')}
        >
          Carteirinhas dos pacientes
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'accepted' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('accepted')}
        >
          Convênios aceitos
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'prices' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('prices')}
        >
          Preços de referência
        </button>
      </nav>

      <div className={styles.tabContent}>
        {activeTab === 'cards' && (
          <PatientInsurancesSection
            token={token as string}
            canWrite={canWriteCards}
            providers={providers}
            allPlans={allPlans}
            patients={patients}
          />
        )}

        {activeTab === 'accepted' && (
          <>
            <ProvidersSection token={token as string} isOwner={isOwner} />
            <PlansSection token={token as string} isOwner={isOwner} providers={providers} />
          </>
        )}

        {activeTab === 'prices' && (
          <>
            <div className={styles.piiBanner}>
              Preços de referência — nunca preenchidos automaticamente na cobrança.
              O valor da cobrança é sempre confirmado manualmente.
            </div>
            <ServicePricesSection
              token={token as string}
              isOwner={isOwner}
              providers={providers}
              allPlans={allPlans}
            />
          </>
        )}
      </div>
    </div>
  );
}
