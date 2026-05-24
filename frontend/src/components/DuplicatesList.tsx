import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  CopyCheck,
  RefreshCw,
  Info,
  Loader2,
  Phone,
  Mail,
  IdCard,
  Cake,
  Pencil,
  Archive,
  ShieldCheck,
  Merge,
  CheckCircle2,
} from 'lucide-react';
import {
  api,
  ApiError,
  type DuplicateConfidence,
  type DuplicateReason,
  type DuplicateScanResult,
  type PatientStatus,
  type PublicPatient,
} from '../services/api';
import { getToken } from '../services/authStorage';
import { useAuth } from '../services/AuthProvider';
import { ConfirmDialog } from './ConfirmDialog';
import { PatientEditForm } from './PatientEditForm';
import styles from './DuplicatesList.module.css';

const FORBIDDEN_ROLE_MESSAGE =
  'Seu usuário não tem permissão para executar esta ação. Peça a um administrador da clínica.';

// How many groups to render before "Carregar mais grupos". Client-side only — the
// backend already caps the scan (DUPLICATES_SCAN_MAX_ROWS) and sorts strongest
// first. Backend pagination of duplicates is a future improvement (roadmap 3.23).
const GROUPS_PAGE = 8;

const REASON_LABELS: Record<DuplicateReason, string> = {
  cpf_match: 'CPF igual',
  email_match: 'E-mail igual',
  telefone_match: 'Telefone igual',
  name_dob_match: 'Nome + data de nascimento',
  name_telefone_match: 'Nome + telefone',
  name_email_match: 'Nome + e-mail',
};

const CONFIDENCE_LABELS: Record<DuplicateConfidence, string> = {
  high: 'Confiança alta',
  medium: 'Confiança média',
};

const STATUS_LABELS: Record<PatientStatus, string> = {
  active: 'Ativo',
  inactive: 'Inativo',
  archived: 'Arquivado',
};

type MatchField = 'nome' | 'telefone' | 'email' | 'cpf' | 'nascimento';

// Which record fields each reason is based on — used to highlight what matched.
const REASON_FIELDS: Record<DuplicateReason, MatchField[]> = {
  cpf_match: ['cpf'],
  email_match: ['email'],
  telefone_match: ['telefone'],
  name_dob_match: ['nome', 'nascimento'],
  name_telefone_match: ['nome', 'telefone'],
  name_email_match: ['nome', 'email'],
};

function matchedFieldsOf(reasons: DuplicateReason[]): Set<MatchField> {
  const set = new Set<MatchField>();
  for (const r of reasons) for (const f of REASON_FIELDS[r]) set.add(f);
  return set;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR');
}

function formatBirthDate(value: string | null): string {
  if (!value) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : value;
}

function apiMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    return err.code === 'forbidden_role' ? FORBIDDEN_ROLE_MESSAGE : err.message;
  }
  return fallback;
}

function fieldClass(matched: Set<MatchField>, field: MatchField): string {
  return matched.has(field) ? `${styles.recordField} ${styles.recordFieldMatched}` : styles.recordField;
}

// `refreshKey` reloads the scan after the sibling patient list changes;
// `onPatientsChanged` lets actions here refresh both panels.
export function DuplicatesList({
  refreshKey = 0,
  onPatientsChanged,
}: {
  refreshKey?: number;
  onPatientsChanged?: () => void;
} = {}): JSX.Element {
  const { user } = useAuth();
  // Edit: owner + secretaria. Archive/restore + merge: owner only (backend
  // enforces with requireRole; the UI hides the controls).
  const canWrite = user?.papel === 'dono_clinica' || user?.papel === 'secretaria';
  const isOwner = user?.papel === 'dono_clinica';
  const queryClient = useQueryClient();

  const [result, setResult] = useState<DuplicateScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(GROUPS_PAGE);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Safe-merge B-safe (Sprint 3.34). One selection per group, keyed by the
  // backend's stable group_key (a hash, not PII). Cleared on every reload so a
  // stale selection from a previous scan can't be acted on.
  const [primaryByGroup, setPrimaryByGroup] = useState<Record<string, string>>({});
  const [confirmGroupKey, setConfirmGroupKey] = useState<string | null>(null);
  const [mergeBusy, setMergeBusy] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [mergeNotice, setMergeNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.listPatientDuplicates(token);
      setResult(res);
      setVisibleCount(GROUPS_PAGE);
      // Stale selection from the previous scan can no longer be acted on safely
      // (the group may have changed). Drop it on every reload.
      setPrimaryByGroup({});
    } catch (err) {
      setError(apiMessage(err, 'Não foi possível analisar os duplicados.'));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  // After an action: refresh both panels (parent bumps refreshKey, reloading this
  // scan + the patient list). Falls back to a local reload when used standalone.
  function afterChange(): void {
    setEditingId(null);
    setActionError(null);
    if (onPatientsChanged) onPatientsChanged();
    else void load();
  }

  // After a merge: bump the patients panels (refreshKey) AND invalidate the
  // TanStack caches that the Agenda / scheduling picker read from — so the
  // owner can switch to the Agenda tab and immediately see the appointment
  // listed under the primary's name (no more "Paciente abc12345…" fallback).
  function afterMerge(): void {
    if (onPatientsChanged) onPatientsChanged();
    else void load();
    void queryClient.invalidateQueries({ queryKey: ['appointments'] });
    void queryClient.invalidateQueries({ queryKey: ['patients'] });
  }

  function selectPrimary(groupKey: string, patientId: string): void {
    setPrimaryByGroup((prev) => ({ ...prev, [groupKey]: patientId }));
    // Clear any stale notice from a previous merge so it doesn't linger over
    // a new selection.
    setMergeNotice(null);
  }

  function openMergeConfirm(groupKey: string): void {
    setMergeError(null);
    setMergeNotice(null);
    setConfirmGroupKey(groupKey);
  }

  function closeMergeConfirm(): void {
    if (mergeBusy) return;
    setConfirmGroupKey(null);
    setMergeError(null);
  }

  async function handleMergeConfirm(): Promise<void> {
    if (!confirmGroupKey) return;
    const group = activeGroups.find((g) => g.group_key === confirmGroupKey);
    const primaryId = primaryByGroup[confirmGroupKey];
    if (!group || !primaryId) return;
    const secondaryIds = group.patients
      .filter((p) => p.id !== primaryId && p.status === 'active')
      .map((p) => p.id);
    if (secondaryIds.length === 0) {
      setMergeError('Selecione o principal e ao menos um duplicado para resolver.');
      return;
    }

    const token = getToken();
    if (!token) return;
    setMergeBusy(true);
    setMergeError(null);
    try {
      const res = await api.mergePatients(token, primaryId, secondaryIds);
      setConfirmGroupKey(null);
      setMergeNotice(
        `Duplicado resolvido. ${res.merge.merged_count} registro${
          res.merge.merged_count === 1 ? '' : 's'
        } arquivado${res.merge.merged_count === 1 ? '' : 's'}; ${
          res.merge.moved_appointments_count
        } agendamento${
          res.merge.moved_appointments_count === 1 ? '' : 's'
        } movido${res.merge.moved_appointments_count === 1 ? '' : 's'} para o principal.`,
      );
      afterMerge();
    } catch (err) {
      // Modal stays open with the error inline (consistent with the rest of the
      // app) so the owner can read it without losing the selection.
      setMergeError(apiMessage(err, 'Não foi possível resolver o duplicado.'));
    } finally {
      setMergeBusy(false);
    }
  }

  async function handleArchive(p: PublicPatient): Promise<void> {
    const token = getToken();
    if (!token) return;
    setActionBusyId(p.id);
    setActionError(null);
    try {
      await api.archivePatient(token, p.id);
      afterChange();
    } catch (err) {
      setActionError(apiMessage(err, 'Não foi possível arquivar o paciente.'));
    } finally {
      setActionBusyId(null);
    }
  }

  // This screen is the ACTIVE correction queue, not an archive view: hide archived
  // records and drop any group that no longer has 2+ records to compare. So
  // "Excluir duplicado" (which archives) makes the record leave this list; it stays
  // available under Pacientes > Arquivados. (Restore lives there, not here.)
  // Frontend-only — the backend scan still returns every status (unchanged).
  const activeGroups = (result?.groups ?? [])
    .map((g) => ({ ...g, patients: g.patients.filter((p) => p.status !== 'archived') }))
    .filter((g) => g.patients.length >= 2);

  const groupsShown = activeGroups.length;
  const recordsShown = activeGroups.reduce((sum, g) => sum + g.patients.length, 0);
  const visibleGroups = activeGroups.slice(0, visibleCount);
  const hasMoreGroups = activeGroups.length > visibleCount;

  return (
    <section className={styles.panel}>
      <div className={styles.head}>
        <div>
          <h2 className={styles.title}>
            <CopyCheck size={20} aria-hidden="true" />
            Possíveis duplicados
          </h2>
          <p className={styles.subtitle}>
            Registros administrativos que parecem ser o mesmo paciente dentro desta clínica.
            Revise e corrija direto daqui.
          </p>
        </div>
        <button
          type="button"
          className={styles.refresh}
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw size={16} aria-hidden="true" />
          Atualizar análise
        </button>
      </div>

      <p className={styles.notice}>
        <Info size={16} aria-hidden="true" />
        Esta tela mostra possíveis duplicados ativos. Ao excluir um duplicado, ele é arquivado e
        sai desta lista, mas continua disponível em Pacientes &gt; Arquivados. Histórico e
        agendamentos são preservados. Merge automático ainda não existe.
      </p>

      {!isOwner && (
        <p className={styles.notice}>
          <ShieldCheck size={16} aria-hidden="true" />
          {canWrite
            ? 'Você pode editar os registros. Arquivar/restaurar e resolver duplicados são exclusivos do dono da clínica.'
            : 'Visualização apenas. Ações de correção exigem permissão na clínica.'}
        </p>
      )}

      {mergeNotice && (
        <p className={styles.mergeNotice} role="status">
          <CheckCircle2 size={16} aria-hidden="true" />
          {mergeNotice}
        </p>
      )}

      {actionError && <p className={styles.actionError}>{actionError}</p>}

      {loading ? (
        <p className={styles.state}>
          <Loader2 size={18} className={styles.spin} aria-hidden="true" />
          Analisando possíveis duplicados…
        </p>
      ) : error ? (
        <p className={`${styles.state} ${styles.error}`}>{error}</p>
      ) : groupsShown === 0 ? (
        <p className={styles.empty}>Nenhum possível duplicado ativo encontrado.</p>
      ) : (
        <>
          <p className={styles.count}>
            {groupsShown} grupo
            {groupsShown === 1 ? '' : 's'} ·{' '}
            {recordsShown} registro
            {recordsShown === 1 ? '' : 's'} ativo
            {recordsShown === 1 ? '' : 's'}.
            {result?.summary.scan_limited
              ? ' A análise foi limitada a uma parte dos registros.'
              : ''}
          </p>

          <ul className={styles.groups}>
            {visibleGroups.map((g) => {
              const matched = matchedFieldsOf(g.reasons);
              return (
                <li
                  key={g.group_key}
                  className={`${styles.group} ${
                    g.confidence === 'high' ? styles.groupHigh : styles.groupMedium
                  }`}
                >
                  <div className={styles.groupHead}>
                    <span className={styles.reason}>Motivo: {REASON_LABELS[g.reason] ?? g.reason}</span>
                    <span
                      className={`${styles.badge} ${
                        g.confidence === 'high' ? styles.badgeHigh : styles.badgeMedium
                      }`}
                    >
                      {CONFIDENCE_LABELS[g.confidence]}
                    </span>
                    <span className={styles.countPill}>{g.patients.length} registros</span>
                  </div>

                  {g.reasons.length > 1 && (
                    <p className={styles.reasonsExtra}>
                      Também coincide em:{' '}
                      {g.reasons
                        .filter((r) => r !== g.reason)
                        .map((r) => REASON_LABELS[r] ?? r)
                        .join(' · ')}
                    </p>
                  )}

                  {canWrite && g.patients.length >= 3 && (
                    <p className={styles.groupHint}>
                      Corrija o registro que deve ficar e exclua os duplicados.
                    </p>
                  )}

                  {isOwner && (
                    <p className={styles.groupHint}>
                      Para resolver de uma vez, escolha o paciente principal abaixo e clique em
                      “Resolver duplicado”. Agendamentos vinculados aos demais serão movidos para
                      o principal; campos vazios do principal podem ser preenchidos (nunca
                      sobrescritos); os duplicados são arquivados.
                    </p>
                  )}

                  <ul className={styles.records}>
                    {g.patients.map((p) => {
                      const isSelectedPrimary = primaryByGroup[g.group_key] === p.id;
                      return (
                      <li
                        key={p.id}
                        className={`${styles.record} ${
                          isSelectedPrimary ? styles.recordPrimary : ''
                        }`}
                      >
                        <div className={styles.recordTop}>
                          {isOwner && (
                            <label
                              className={styles.primaryRadio}
                              title="Escolher este paciente como principal"
                            >
                              <input
                                type="radio"
                                name={`primary-${g.group_key}`}
                                value={p.id}
                                checked={isSelectedPrimary}
                                onChange={() => selectPrimary(g.group_key, p.id)}
                                disabled={mergeBusy}
                              />
                              <span className={styles.primaryRadioLabel}>
                                Manter como principal
                              </span>
                            </label>
                          )}
                          <span className={styles.recordName} title={p.nome}>
                            {p.nome}
                          </span>
                          {isSelectedPrimary && (
                            <span className={styles.primaryTag}>Principal</span>
                          )}
                          <span
                            className={`${styles.statusBadge} ${
                              styles[`status_${p.status}`] ?? ''
                            }`}
                          >
                            {STATUS_LABELS[p.status] ?? p.status}
                          </span>
                        </div>

                        <span className={styles.recordFields}>
                          <span className={fieldClass(matched, 'telefone')}>
                            <Phone size={13} aria-hidden="true" />
                            {p.telefone ?? '—'}
                          </span>
                          <span
                            className={fieldClass(matched, 'email')}
                            title={p.email ?? undefined}
                          >
                            <Mail size={13} aria-hidden="true" />
                            {p.email ?? '—'}
                          </span>
                          <span className={fieldClass(matched, 'cpf')}>
                            <IdCard size={13} aria-hidden="true" />
                            {p.cpf_masked ?? '—'}
                          </span>
                          <span className={fieldClass(matched, 'nascimento')}>
                            <Cake size={13} aria-hidden="true" />
                            {formatBirthDate(p.data_nascimento)}
                          </span>
                        </span>

                        <span className={styles.recordMeta}>
                          {p.origem} · criado em {formatDateTime(p.criado_em)}
                        </span>

                        {(canWrite || isOwner) && (
                          <div className={styles.recordActions}>
                            {/* Only active records are shown here, so the actions are
                                "Corrigir" (edit, owner + secretaria) and "Excluir duplicado"
                                (archive, owner only). Restore lives in Pacientes > Arquivados. */}
                            {canWrite && (
                              <button
                                type="button"
                                className={styles.recordActionBtn}
                                onClick={() =>
                                  setEditingId((cur) => (cur === p.id ? null : p.id))
                                }
                                disabled={actionBusyId === p.id}
                              >
                                <Pencil size={13} aria-hidden="true" />
                                Corrigir
                              </button>
                            )}
                            {isOwner && (
                              <button
                                type="button"
                                className={`${styles.recordActionBtn} ${styles.recordActionDanger}`}
                                onClick={() => void handleArchive(p)}
                                disabled={actionBusyId === p.id}
                                title="Apenas arquiva o registro (soft-delete). Histórico e agendamentos são preservados."
                              >
                                {actionBusyId === p.id ? (
                                  <Loader2 size={13} className={styles.spin} aria-hidden="true" />
                                ) : (
                                  <Archive size={13} aria-hidden="true" />
                                )}
                                Excluir duplicado
                              </button>
                            )}
                          </div>
                        )}

                        {editingId === p.id && (
                          <PatientEditForm
                            patient={p}
                            onSaved={afterChange}
                            onCancel={() => setEditingId(null)}
                          />
                        )}
                      </li>
                      );
                    })}
                  </ul>

                  {isOwner && (
                    <div className={styles.mergeBar}>
                      <span className={styles.mergeBarHint}>
                        {primaryByGroup[g.group_key]
                          ? `Os outros ${g.patients.length - 1} registro${
                              g.patients.length - 1 === 1 ? '' : 's'
                            } serão arquivados como duplicados.`
                          : 'Escolha o paciente principal antes de resolver.'}
                      </span>
                      <button
                        type="button"
                        className={styles.mergeBtn}
                        onClick={() => openMergeConfirm(g.group_key)}
                        disabled={!primaryByGroup[g.group_key] || mergeBusy}
                      >
                        <Merge size={14} aria-hidden="true" />
                        Resolver duplicado
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {hasMoreGroups && (
            <div className={styles.moreRow}>
              <button
                type="button"
                className={styles.moreBtn}
                onClick={() => setVisibleCount((n) => n + GROUPS_PAGE)}
              >
                Carregar mais grupos
              </button>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmGroupKey !== null}
        title="Resolver pacientes duplicados?"
        description={
          'O ClinicBridge vai manter o paciente principal escolhido, mover agendamentos vinculados aos duplicados, se houver, para ele, preencher apenas os campos vazios do principal e arquivar os registros duplicados. Nenhum campo já preenchido do principal será sobrescrito. Nada será apagado fisicamente. Esta versão ainda não tem desfazer completo.'
        }
        confirmLabel="Resolver duplicado"
        cancelLabel="Cancelar"
        variant="danger"
        isBusy={mergeBusy}
        error={mergeError}
        onConfirm={() => void handleMergeConfirm()}
        onCancel={closeMergeConfirm}
      />
    </section>
  );
}
