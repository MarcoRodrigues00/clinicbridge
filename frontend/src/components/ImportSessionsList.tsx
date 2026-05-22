import { useCallback, useEffect, useState } from 'react';
import {
  Loader2,
  RefreshCw,
  FolderOpen,
  X,
  ArrowRight,
  Play,
  XCircle,
  CheckCircle2,
  Circle,
  AlertTriangle,
  ShieldCheck,
  PackageCheck,
  type LucideIcon,
} from 'lucide-react';
import {
  api,
  ApiError,
  type ImportDryRunReport,
  type ImportExecutionResult,
  type ImportSessionStatus,
  type ImportValidationReport,
  type PublicImportSession,
} from '../services/api';
import { getToken } from '../services/authStorage';
import { useAuth } from '../services/AuthProvider';
import { ValidationReport } from './ValidationReport';
import { DryRunResult } from './DryRunResult';
import styles from './ImportSessionsList.module.css';

const FORBIDDEN_ROLE_MESSAGE =
  'Seu usuário não tem permissão para executar esta ação. Peça a um administrador da clínica.';

const STATUS_LABELS: Record<ImportSessionStatus, string> = {
  validated: 'Validada',
  ready_for_import: 'Pronta para importar',
  import_started: 'Importação iniciada',
  import_completed: 'Importação concluída',
  cancelled: 'Cancelada',
  failed: 'Falhou',
};

const MAPPING_LABELS: Array<{ key: keyof PublicImportSession['mapping']; label: string }> = [
  { key: 'nome', label: 'Nome' },
  { key: 'telefone', label: 'Telefone' },
  { key: 'email', label: 'E-mail' },
  { key: 'cpf', label: 'CPF' },
  { key: 'data_nascimento', label: 'Data de nascimento' },
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR');
}

function toReport(session: PublicImportSession): ImportValidationReport {
  return {
    file: session.file,
    summary: session.validation_summary,
    field_stats: session.field_stats,
    issues: session.issues_sample,
  };
}

export function ImportSessionsList({ refreshKey }: { refreshKey: number }): JSX.Element {
  const { user } = useAuth();
  // Sprint 3.1: preparing (mark-ready) and executing the real import are gated to
  // the clinic owner. Operators can still open reviews and run the dry-run.
  const canManageImport = user?.papel === 'dono_clinica';
  const [sessions, setSessions] = useState<PublicImportSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [dryRun, setDryRun] = useState<ImportDryRunReport | null>(null);
  const [dryRunLoading, setDryRunLoading] = useState(false);
  const [dryRunError, setDryRunError] = useState<string | null>(null);
  const [markReadyLoading, setMarkReadyLoading] = useState(false);
  const [markReadyError, setMarkReadyError] = useState<string | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportExecutionResult | null>(null);
  const [importConfirmed, setImportConfirmed] = useState(false);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.listImportSessions(token);
      setSessions(res.sessions);
      setError(null);
    } catch {
      setError('Não foi possível carregar as revisões salvas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  // Opening a different session (or closing) clears any previous simulation,
  // the mark-ready state and the import-execution state so they don't leak
  // between reviews.
  useEffect(() => {
    setDryRun(null);
    setDryRunError(null);
    setMarkReadyError(null);
    setImportError(null);
    setImportResult(null);
    setImportConfirmed(false);
  }, [openId]);

  async function handleDryRun(sessionId: string): Promise<void> {
    const token = getToken();
    if (!token) {
      setDryRunError('Sessão expirada. Faça login novamente.');
      return;
    }
    setDryRunError(null);
    setDryRunLoading(true);
    try {
      const res = await api.runImportDryRun(token, sessionId);
      setDryRun(res.report);
    } catch (err) {
      setDryRunError(
        err instanceof ApiError ? err.message : 'Não foi possível simular a importação.',
      );
    } finally {
      setDryRunLoading(false);
    }
  }

  async function handleExecuteImport(sessionId: string): Promise<void> {
    const token = getToken();
    if (!token) {
      setImportError('Sessão expirada. Faça login novamente.');
      return;
    }
    setImportError(null);
    setImportLoading(true);
    try {
      const res = await api.executeImportSession(token, sessionId);
      setImportResult(res.result);
      // Update the session locally so the badge/status flips to "import_completed".
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? { ...s, status: 'import_completed', updated_at: new Date().toISOString() }
            : s,
        ),
      );
    } catch (err) {
      setImportError(
        err instanceof ApiError
          ? err.code === 'forbidden_role'
            ? FORBIDDEN_ROLE_MESSAGE
            : err.message
          : 'Não foi possível concluir a importação.',
      );
    } finally {
      setImportLoading(false);
    }
  }

  async function handleMarkReady(sessionId: string): Promise<void> {
    const token = getToken();
    if (!token) {
      setMarkReadyError('Sessão expirada. Faça login novamente.');
      return;
    }
    setMarkReadyError(null);
    setMarkReadyLoading(true);
    try {
      const res = await api.markImportSessionReady(token, sessionId);
      setSessions((prev) =>
        prev.map((s) => (s.id === res.session.id ? res.session : s)),
      );
    } catch (err) {
      setMarkReadyError(
        err instanceof ApiError
          ? err.code === 'forbidden_role'
            ? FORBIDDEN_ROLE_MESSAGE
            : err.message
          : 'Não foi possível preparar a revisão.',
      );
    } finally {
      setMarkReadyLoading(false);
    }
  }

  const openSession = sessions.find((s) => s.id === openId) ?? null;

  return (
    <section className={styles.panel} aria-labelledby="sessions-heading">
      <div className={styles.head}>
        <div>
          <h2 id="sessions-heading" className={styles.title}>
            Revisões salvas
          </h2>
          <p className={styles.note}>
            Essas revisões guardam o arquivo, o mapeamento e o resultado da validação. Nenhum
            paciente foi importado ainda.
          </p>
        </div>
        <button
          type="button"
          className={styles.refresh}
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? (
            <Loader2 size={15} className="spin" aria-hidden="true" />
          ) : (
            <RefreshCw size={15} aria-hidden="true" />
          )}
          Atualizar revisões
        </button>
      </div>

      {loading ? (
        <p className={styles.empty}>Carregando…</p>
      ) : error ? (
        <p className={styles.empty}>{error}</p>
      ) : sessions.length === 0 ? (
        <p className={styles.empty}>Nenhuma revisão salva ainda.</p>
      ) : (
        <ul className={styles.list}>
          {sessions.map((s) => (
            <li key={s.id} className={styles.item}>
              <div className={styles.itemMain}>
                <span className={styles.fileName} title={s.file.nome_original}>
                  {s.file.nome_original}
                </span>
                <span className={styles.statusBadge}>Status: {STATUS_LABELS[s.status]}</span>
                <span className={styles.itemDate}>{formatDate(s.created_at)}</span>
                <span className={styles.itemStats}>
                  {s.validation_summary.total_rows_analyzed} analisadas ·{' '}
                  {s.validation_summary.valid_rows} válidas ·{' '}
                  {s.validation_summary.rows_with_warnings} com avisos ·{' '}
                  {s.validation_summary.rows_with_errors} com erros ·{' '}
                  {s.validation_summary.duplicate_groups} possíveis duplicados
                </span>
              </div>
              <button
                type="button"
                className={styles.openBtn}
                onClick={() => setOpenId((cur) => (cur === s.id ? null : s.id))}
                aria-expanded={openId === s.id}
              >
                {openId === s.id ? (
                  <>
                    <X size={15} aria-hidden="true" />
                    Fechar
                  </>
                ) : (
                  <>
                    <FolderOpen size={15} aria-hidden="true" />
                    Abrir revisão
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {openSession ? (
        <div className={styles.detail}>
          <div className={styles.mappingBlock}>
            <span className={styles.blockLabel}>Mapeamento salvo</span>
            <div className={styles.mappingGrid}>
              {MAPPING_LABELS.map(({ key, label }) => {
                const col = openSession.mapping[key];
                return (
                  <div key={key} className={styles.mappingItem}>
                    <span className={styles.mappingField}>{label}</span>
                    <ArrowRight size={13} aria-hidden="true" className={styles.mappingArrow} />
                    <span className={col ? styles.mappingValue : styles.mappingNone}>
                      {col || 'Não mapeado'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <ValidationReport report={toReport(openSession)} />

          <DryRunSection
            session={openSession}
            dryRun={dryRun}
            loading={dryRunLoading}
            error={dryRunError}
            onRun={() => void handleDryRun(openSession.id)}
          />

          <ReadyForImportSection
            session={openSession}
            dryRun={dryRun}
            loading={markReadyLoading}
            error={markReadyError}
            canManage={canManageImport}
            onMarkReady={() => void handleMarkReady(openSession.id)}
          />

          <ImportExecutionSection
            session={openSession}
            dryRun={dryRun}
            loading={importLoading}
            error={importError}
            result={importResult}
            confirmed={importConfirmed}
            canManage={canManageImport}
            onToggleConfirm={() => setImportConfirmed((v) => !v)}
            onExecute={() => void handleExecuteImport(openSession.id)}
          />
        </div>
      ) : null}
    </section>
  );
}

type ChecklistTone = 'ok' | 'warn' | 'error' | 'neutral';

function ChecklistItem({
  tone,
  label,
}: {
  tone: ChecklistTone;
  label: string;
}): JSX.Element {
  const Icon: LucideIcon =
    tone === 'ok'
      ? CheckCircle2
      : tone === 'warn'
        ? AlertTriangle
        : tone === 'error'
          ? XCircle
          : Circle;
  return (
    <li className={`${styles.checklistItem} ${styles[`check_${tone}`]}`}>
      <Icon size={15} aria-hidden="true" />
      <span>{label}</span>
    </li>
  );
}

function DryRunSection({
  session,
  dryRun,
  loading,
  error,
  onRun,
}: {
  session: PublicImportSession;
  dryRun: ImportDryRunReport | null;
  loading: boolean;
  error: string | null;
  onRun: () => void;
}): JSX.Element {
  const status = session.status;
  // Statuses where the backend accepts the dry-run today. Mirrors the
  // backend allow-list so the button never sends a request that will 400.
  const canSimulate =
    status === 'validated' ||
    status === 'ready_for_import' ||
    status === 'import_completed';
  const isCompleted = status === 'import_completed';

  const helpText = isCompleted
    ? 'Esta revisão já foi importada. A simulação não altera os dados — é apenas leitura.'
    : status === 'ready_for_import'
      ? 'Reexecute a simulação para conferir o que aconteceria agora. Nenhum paciente será salvo.'
      : canSimulate
        ? 'Verifica o que aconteceria se essa revisão fosse importada. Nenhum paciente será salvo.'
        : 'Esta revisão não pode ser simulada no status atual.';

  const buttonLabel = loading
    ? 'Simulando importação…'
    : isCompleted
      ? dryRun
        ? 'Ver simulação novamente'
        : 'Ver simulação'
      : dryRun
        ? 'Simular novamente'
        : 'Simular importação';

  return (
    <div className={styles.dryRunBlock}>
      <div className={styles.dryRunBar}>
        <div className={styles.dryRunText}>
          <span className={styles.blockLabel}>Simulação de importação</span>
          <p className={styles.dryRunHelp}>{helpText}</p>
        </div>
        <button
          type="button"
          className={styles.dryRunBtn}
          onClick={onRun}
          disabled={loading || !canSimulate}
        >
          {loading ? (
            <Loader2 size={15} className="spin" aria-hidden="true" />
          ) : (
            <Play size={15} aria-hidden="true" />
          )}
          {buttonLabel}
        </button>
      </div>

      {error ? (
        <div className={styles.dryRunError} role="alert">
          <XCircle size={15} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {dryRun ? <DryRunResult report={dryRun} /> : null}
    </div>
  );
}

function ReadyForImportSection({
  session,
  dryRun,
  loading,
  error,
  canManage,
  onMarkReady,
}: {
  session: PublicImportSession;
  dryRun: ImportDryRunReport | null;
  loading: boolean;
  error: string | null;
  canManage: boolean;
  onMarkReady: () => void;
}): JSX.Element {
  const summary = dryRun?.summary;
  const dryRunDone = !!summary;
  const blocked = summary?.blocked_count ?? 0;
  const warnings = summary?.warning_count ?? 0;
  const duplicates = summary?.duplicate_count ?? 0;
  const wouldImport = summary?.would_import_count ?? 0;

  const isValidated = session.status === 'validated';
  const isReady = session.status === 'ready_for_import';
  const canMarkReady =
    isValidated && dryRunDone && blocked === 0 && wouldImport > 0 && !loading;

  const blockedTone: ChecklistTone = !dryRunDone ? 'neutral' : blocked === 0 ? 'ok' : 'error';
  const warningsTone: ChecklistTone = !dryRunDone ? 'neutral' : warnings > 0 ? 'warn' : 'ok';
  const duplicatesTone: ChecklistTone = !dryRunDone
    ? 'neutral'
    : duplicates > 0
      ? 'warn'
      : 'ok';

  return (
    <section className={styles.readyBlock} aria-label="Preparação para importação">
      <div className={styles.readyHead}>
        <ShieldCheck size={16} aria-hidden="true" className={styles.readyHeadIcon} />
        <div>
          <span className={styles.blockLabel}>Preparação para importação</span>
          <p className={styles.readyHelp}>
            Esta etapa não importa pacientes. Ela apenas confirma que a revisão passou nas
            verificações mínimas. A importação real será implementada em uma etapa futura.
          </p>
        </div>
      </div>

      <ul className={styles.checklist}>
        <ChecklistItem tone="ok" label="Revisão salva" />
        <ChecklistItem
          tone={dryRunDone ? 'ok' : 'neutral'}
          label={dryRunDone ? 'Simulação executada' : 'Simulação ainda não foi executada'}
        />
        <ChecklistItem
          tone={blockedTone}
          label={
            !dryRunDone
              ? 'Sem linhas bloqueadas (a verificar)'
              : blocked === 0
                ? 'Sem linhas bloqueadas'
                : `Existem ${blocked} linhas bloqueadas`
          }
        />
        <ChecklistItem
          tone={warningsTone}
          label={
            !dryRunDone
              ? 'Avisos (a verificar)'
              : warnings > 0
                ? `Existem ${warnings} avisos para revisar`
                : 'Sem avisos'
          }
        />
        <ChecklistItem
          tone={duplicatesTone}
          label={
            !dryRunDone
              ? 'Possíveis duplicados (a verificar)'
              : duplicates > 0
                ? `Existem ${duplicates} possíveis duplicados para revisar`
                : 'Sem possíveis duplicados detectados'
          }
        />
        <ChecklistItem tone="ok" label="Nenhum paciente foi importado ainda" />
      </ul>

      {dryRunDone && blocked > 0 ? (
        <div className={styles.readyError} role="alert">
          <XCircle size={15} aria-hidden="true" />
          <span>
            Ainda existem linhas bloqueadas. Esta revisão não pode ser marcada como pronta.
          </span>
        </div>
      ) : null}

      {dryRunDone && blocked === 0 && (warnings > 0 || duplicates > 0) ? (
        <div className={styles.readyHint}>
          <AlertTriangle size={15} aria-hidden="true" />
          <span>Existem avisos ou possíveis duplicados. Revise antes de avançar.</span>
        </div>
      ) : null}

      {dryRunDone && blocked === 0 && wouldImport <= 0 ? (
        <div className={styles.readyError} role="alert">
          <XCircle size={15} aria-hidden="true" />
          <span>Nenhuma linha desta revisão seria importada. Revise o arquivo e o mapeamento.</span>
        </div>
      ) : null}

      {isReady ? (
        <div className={styles.readySuccess} role="status">
          <CheckCircle2 size={15} aria-hidden="true" />
          <span>Revisão marcada como pronta. Nenhum paciente foi importado ainda.</span>
        </div>
      ) : !canManage ? (
        <p className={styles.readyPending}>
          Apenas o dono da clínica pode preparar a revisão para importação.
        </p>
      ) : isValidated ? (
        <>
          {!dryRunDone ? (
            <p className={styles.readyPending}>
              Execute a simulação acima para habilitar a preparação.
            </p>
          ) : null}
          <button
            type="button"
            className={styles.readyBtn}
            onClick={onMarkReady}
            disabled={!canMarkReady}
          >
            {loading ? (
              <Loader2 size={15} className="spin" aria-hidden="true" />
            ) : (
              <ShieldCheck size={15} aria-hidden="true" />
            )}
            {loading ? 'Preparando revisão…' : 'Marcar como pronta para importação'}
          </button>
        </>
      ) : (
        <p className={styles.readyPending}>
          Esta revisão está com status “{STATUS_LABELS[session.status]}” e não pode ser preparada
          novamente.
        </p>
      )}

      {error ? (
        <div className={styles.readyError} role="alert">
          <XCircle size={15} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}
    </section>
  );
}

function ImportExecutionSection({
  session,
  dryRun,
  loading,
  error,
  result,
  confirmed,
  canManage,
  onToggleConfirm,
  onExecute,
}: {
  session: PublicImportSession;
  dryRun: ImportDryRunReport | null;
  loading: boolean;
  error: string | null;
  result: ImportExecutionResult | null;
  confirmed: boolean;
  canManage: boolean;
  onToggleConfirm: () => void;
  onExecute: () => void;
}): JSX.Element | null {
  const status = session.status;

  // Hide the section entirely while the review is still in earlier states —
  // the "Preparação para importação" section already guides the user there.
  if (status !== 'ready_for_import' && status !== 'import_completed') {
    return null;
  }

  const isCompleted = status === 'import_completed';
  const summary = dryRun?.summary;
  const dryRunDone = !!summary;
  const blocked = summary?.blocked_count ?? 0;
  const wouldImport = summary?.would_import_count ?? 0;

  // The backend re-runs the dry-run before any insert, but UX-wise we also
  // require a visual simulation in *this* session of the screen — that way
  // the user always sees the counts they are about to import. Clearing the
  // dry-run (by closing/reopening the review) resets this gate.
  const canExecute =
    status === 'ready_for_import' &&
    dryRunDone &&
    blocked === 0 &&
    wouldImport > 0 &&
    confirmed &&
    !loading;

  return (
    <section className={styles.importBlock} aria-label="Importação controlada">
      <div className={styles.readyHead}>
        <PackageCheck size={16} aria-hidden="true" className={styles.importHeadIcon} />
        <div>
          <span className={styles.blockLabel}>Importação controlada</span>
          <p className={styles.readyHelp}>
            Esta ação criará pacientes administrativos. Não serão importados dados clínicos. A
            importação será limitada e auditada. Após concluir, esta revisão não poderá ser
            importada novamente.
          </p>
        </div>
      </div>

      {isCompleted ? (
        <ImportReceipt session={session} liveResult={result} />
      ) : !canManage ? (
        <p className={styles.readyPending}>
          Apenas o dono da clínica pode executar a importação controlada.
        </p>
      ) : (
        <>
          {!dryRunDone ? (
            <div className={styles.readyHint}>
              <AlertTriangle size={15} aria-hidden="true" />
              <span>Execute a simulação antes de importar.</span>
            </div>
          ) : blocked > 0 ? (
            <div className={styles.readyError} role="alert">
              <XCircle size={15} aria-hidden="true" />
              <span>
                A simulação encontrou linhas bloqueadas. Não é possível importar até que sejam
                corrigidas.
              </span>
            </div>
          ) : wouldImport <= 0 ? (
            <div className={styles.readyError} role="alert">
              <XCircle size={15} aria-hidden="true" />
              <span>Nenhuma linha desta revisão seria importada agora.</span>
            </div>
          ) : null}

          <label className={styles.confirmRow}>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={onToggleConfirm}
              disabled={loading || !dryRunDone}
            />
            <span>Entendo que esta ação criará pacientes administrativos.</span>
          </label>
          <button
            type="button"
            className={styles.importBtn}
            onClick={onExecute}
            disabled={!canExecute}
          >
            {loading ? (
              <Loader2 size={15} className="spin" aria-hidden="true" />
            ) : (
              <PackageCheck size={15} aria-hidden="true" />
            )}
            {loading ? 'Importando…' : 'Executar importação controlada'}
          </button>
        </>
      )}

      {error ? (
        <div className={styles.readyError} role="alert">
          <XCircle size={15} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}
    </section>
  );
}

function ImportReceipt({
  session,
  liveResult,
}: {
  session: PublicImportSession;
  liveResult: ImportExecutionResult | null;
}): JSX.Element {
  // Prefer the in-memory result (just imported) but fall back to the persisted
  // receipt so the section keeps showing after a page reload. Both shapes are
  // counts + metadata only — no PII.
  const summary = liveResult?.summary ?? session.import_summary;
  const importedAtIso = liveResult ? new Date().toISOString() : session.imported_at;
  const importedAt = importedAtIso
    ? new Date(importedAtIso).toLocaleString('pt-BR')
    : '—';

  return (
    <>
      <div className={styles.readySuccess} role="status">
        <CheckCircle2 size={15} aria-hidden="true" />
        <span>
          {summary
            ? `Importação concluída. ${summary.patients_created} pacientes administrativos foram criados.`
            : 'Importação concluída.'}
        </span>
      </div>

      {summary ? (
        <div className={styles.receiptBlock} aria-label="Recibo da importação">
          <span className={styles.blockLabel}>Recibo da importação</span>
          <dl className={styles.receiptGrid}>
            <div className={styles.receiptItem}>
              <dt>Concluída em</dt>
              <dd>{importedAt}</dd>
            </div>
            <div className={styles.receiptItem}>
              <dt>Pacientes criados</dt>
              <dd>{summary.patients_created}</dd>
            </div>
            <div className={styles.receiptItem}>
              <dt>Linhas analisadas</dt>
              <dd>{summary.total_rows_analyzed}</dd>
            </div>
            <div className={styles.receiptItem}>
              <dt>Linhas puladas</dt>
              <dd>{summary.skipped_count}</dd>
            </div>
            <div className={styles.receiptItem}>
              <dt>Limite por execução</dt>
              <dd>{summary.import_max_rows}</dd>
            </div>
            <div className={styles.receiptItem}>
              <dt>Status</dt>
              <dd>Concluída</dd>
            </div>
          </dl>
          <p className={styles.receiptNote}>
            Este resumo contém apenas contagens e metadados da execução. Nenhum dado clínico foi
            importado.
          </p>
        </div>
      ) : null}

      <p className={styles.readyPending}>
        Esta revisão já foi importada e não pode ser executada novamente.
      </p>
    </>
  );
}
