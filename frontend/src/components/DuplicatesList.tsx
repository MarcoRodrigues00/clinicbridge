import { useCallback, useEffect, useState } from 'react';
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
  ArchiveRestore,
  ShieldCheck,
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
  // Edit: owner + secretaria. Archive/restore: owner only (backend enforces; UI hides).
  const canWrite = user?.papel === 'dono_clinica' || user?.papel === 'secretaria';
  const isOwner = user?.papel === 'dono_clinica';

  const [result, setResult] = useState<DuplicateScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(GROUPS_PAGE);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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

  async function handleRestore(p: PublicPatient): Promise<void> {
    const token = getToken();
    if (!token) return;
    setActionBusyId(p.id);
    setActionError(null);
    try {
      await api.restorePatient(token, p.id);
      afterChange();
    } catch (err) {
      setActionError(apiMessage(err, 'Não foi possível restaurar o paciente.'));
    } finally {
      setActionBusyId(null);
    }
  }

  const groups = result?.groups ?? [];
  const visibleGroups = groups.slice(0, visibleCount);
  const hasMoreGroups = groups.length > visibleCount;

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
        Revise os dados antes de arquivar. Arquivar não apaga histórico nem agendamentos — apenas
        tira o registro da lista padrão e da agenda. Merge automático ainda não existe.
      </p>

      {!isOwner && (
        <p className={styles.notice}>
          <ShieldCheck size={16} aria-hidden="true" />
          {canWrite
            ? 'Você pode editar os registros. Arquivar/restaurar é exclusivo do dono da clínica.'
            : 'Visualização apenas. Ações de correção exigem permissão na clínica.'}
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
      ) : groups.length === 0 ? (
        <p className={styles.empty}>Nenhum possível duplicado encontrado.</p>
      ) : (
        <>
          <p className={styles.count}>
            {result?.summary.groups_count} grupo
            {result?.summary.groups_count === 1 ? '' : 's'} ·{' '}
            {result?.summary.patients_in_duplicate_groups} registro
            {result?.summary.patients_in_duplicate_groups === 1 ? '' : 's'} envolvido
            {result?.summary.patients_in_duplicate_groups === 1 ? '' : 's'}.
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
                    <span className={styles.countPill}>{g.count} registros</span>
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

                  <ul className={styles.records}>
                    {g.patients.map((p) => (
                      <li key={p.id} className={styles.record}>
                        <div className={styles.recordTop}>
                          <span className={styles.recordName} title={p.nome}>
                            {p.nome}
                          </span>
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
                                Editar
                              </button>
                            )}
                            {isOwner &&
                              (p.status === 'archived' ? (
                                <button
                                  type="button"
                                  className={styles.recordActionBtn}
                                  onClick={() => void handleRestore(p)}
                                  disabled={actionBusyId === p.id}
                                >
                                  {actionBusyId === p.id ? (
                                    <Loader2 size={13} className={styles.spin} aria-hidden="true" />
                                  ) : (
                                    <ArchiveRestore size={13} aria-hidden="true" />
                                  )}
                                  Restaurar
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className={`${styles.recordActionBtn} ${styles.recordActionDanger}`}
                                  onClick={() => void handleArchive(p)}
                                  disabled={actionBusyId === p.id}
                                >
                                  {actionBusyId === p.id ? (
                                    <Loader2 size={13} className={styles.spin} aria-hidden="true" />
                                  ) : (
                                    <Archive size={13} aria-hidden="true" />
                                  )}
                                  Arquivar
                                </button>
                              ))}
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
                    ))}
                  </ul>
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
    </section>
  );
}
