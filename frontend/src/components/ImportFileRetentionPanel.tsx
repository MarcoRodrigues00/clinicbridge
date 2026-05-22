import { useCallback, useEffect, useState } from 'react';
import { Archive, RefreshCw, Info, Loader2, Search, ShieldCheck } from 'lucide-react';
import {
  api,
  ApiError,
  type RetentionCandidate,
  type RetentionDryRunResult,
} from '../services/api';
import { getToken } from '../services/authStorage';
import styles from './ImportFileRetentionPanel.module.css';

const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_LIMIT = 100;
const MAX_RETENTION_DAYS = 365;
const MAX_LIMIT = 100;

// Friendly labels for the latest import-session status (no PII).
const SESSION_STATUS_LABELS: Record<string, string> = {
  validated: 'Validada',
  ready_for_import: 'Pronta para importar',
  import_started: 'Importação iniciada',
  import_completed: 'Importação concluída',
  cancelled: 'Cancelada',
  failed: 'Falhou',
};

function sessionStatusLabel(status: string | null): string {
  if (status === null) return 'Sem revisão';
  return SESSION_STATUS_LABELS[status] ?? status;
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR');
}

function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

function messageForError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Sessão expirada. Faça login novamente.';
    if (err.code === 'invalid_retention_params') {
      return 'Não foi possível usar esses valores. Ajuste os campos e tente novamente.';
    }
    if (err.code === 'rate_limited') {
      return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.';
    }
  }
  return 'Não foi possível verificar os arquivos agora. Tente novamente.';
}

export function ImportFileRetentionPanel(): JSX.Element {
  const [result, setResult] = useState<RetentionDryRunResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [daysInput, setDaysInput] = useState(String(DEFAULT_RETENTION_DAYS));
  const [limitInput, setLimitInput] = useState(String(DEFAULT_LIMIT));
  const [inputError, setInputError] = useState<string | null>(null);

  const load = useCallback(async (params?: { retention_days: number; limit: number }) => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.getImportFileRetentionDryRun(token, params);
      setResult(res);
    } catch (err) {
      setError(messageForError(err));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Validates the inputs client-side before calling the API. Returns the parsed
  // params or null (and sets an inline message) when invalid.
  function readParams(): { retention_days: number; limit: number } | null {
    if (!/^\d+$/.test(daysInput.trim()) || !/^\d+$/.test(limitInput.trim())) {
      setInputError('Use apenas números inteiros.');
      return null;
    }
    const days = Number(daysInput);
    const limit = Number(limitInput);
    if (days < 1 || days > MAX_RETENTION_DAYS) {
      setInputError(`Informe um número de dias entre 1 e ${MAX_RETENTION_DAYS}.`);
      return null;
    }
    if (limit < 1 || limit > MAX_LIMIT) {
      setInputError(`O valor de "Mostrar até" deve estar entre 1 e ${MAX_LIMIT}.`);
      return null;
    }
    setInputError(null);
    return { retention_days: days, limit };
  }

  function handleAnalyze(e: React.FormEvent): void {
    e.preventDefault();
    const params = readParams();
    if (params) void load(params);
  }

  function handleRefresh(): void {
    const params = readParams();
    if (params) void load(params);
  }

  const candidates: RetentionCandidate[] = result?.candidates ?? [];

  return (
    <section className={styles.panel}>
      <div className={styles.head}>
        <div>
          <h2 className={styles.title}>
            <Archive size={20} aria-hidden="true" />
            Arquivos antigos de importação
          </h2>
          <p className={styles.subtitle}>
            Veja arquivos enviados há mais tempo que podem ser revisados para limpeza futura.
          </p>
        </div>
        <button
          type="button"
          className={styles.refresh}
          onClick={handleRefresh}
          disabled={loading}
        >
          <RefreshCw size={16} aria-hidden="true" />
          Atualizar
        </button>
      </div>

      <p className={styles.notice}>
        <Info size={16} aria-hidden="true" />
        Esta verificação é apenas informativa. Nenhum arquivo será apagado por aqui.
      </p>
      <p className={styles.safety}>
        <ShieldCheck size={16} aria-hidden="true" />
        A limpeza real exigirá uma etapa futura com confirmação e auditoria.
      </p>

      <form className={styles.controls} onSubmit={handleAnalyze}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Arquivos com mais de</span>
          <span className={styles.inputWrap}>
            <input
              type="number"
              className={styles.input}
              min={1}
              max={MAX_RETENTION_DAYS}
              value={daysInput}
              onChange={(e) => setDaysInput(e.target.value)}
              aria-label={`Idade mínima dos arquivos em dias (1 a ${MAX_RETENTION_DAYS})`}
            />
            <span className={styles.suffix}>dias</span>
          </span>
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Mostrar até</span>
          <input
            type="number"
            className={styles.input}
            min={1}
            max={MAX_LIMIT}
            value={limitInput}
            onChange={(e) => setLimitInput(e.target.value)}
            aria-label={`Quantidade máxima de arquivos a exibir (1 a ${MAX_LIMIT})`}
          />
        </label>
        <button type="submit" className={styles.analyze} disabled={loading}>
          <Search size={16} aria-hidden="true" />
          Verificar arquivos
        </button>
      </form>
      {inputError && <p className={styles.inputError}>{inputError}</p>}

      {loading ? (
        <p className={styles.state}>
          <Loader2 size={18} className={styles.spin} aria-hidden="true" />
          Verificando arquivos…
        </p>
      ) : error ? (
        <p className={`${styles.state} ${styles.error}`}>{error}</p>
      ) : result ? (
        <>
          <div className={styles.summary}>
            <span className={styles.summaryItem}>
              Período analisado: <strong>mais de {result.retention_days} dias</strong>
            </span>
            <span className={styles.summaryItem}>
              Arquivos encontrados: <strong>{result.candidates_count}</strong>
            </span>
            <span className={styles.summaryItem}>
              Exibidos: <strong>{candidates.length}</strong>
            </span>
            <span className={styles.summaryItem}>
              Análise limitada: <strong>{result.scan_limited ? 'Sim' : 'Não'}</strong>
            </span>
          </div>

          {result.scan_limited && (
            <p className={styles.hint}>
              Há mais arquivos antigos do que o valor de "Mostrar até". Aumente esse número
              para ver mais.
            </p>
          )}

          {candidates.length === 0 ? (
            <p className={styles.empty}>Nenhum arquivo antigo encontrado para revisão.</p>
          ) : (
            <ul className={styles.list}>
              {candidates.map((c) => (
                <li key={c.id} className={styles.item}>
                  <div className={styles.itemHead}>
                    <span className={styles.typeChip}>{c.extensao.toUpperCase()}</span>
                    <span className={styles.itemRef} title={c.id}>
                      Ref. {shortId(c.id)}
                    </span>
                  </div>
                  <dl className={styles.fields}>
                    <div className={styles.fieldRow}>
                      <dt className={styles.rowLabel}>Tamanho</dt>
                      <dd className={styles.rowValue}>{formatBytes(c.tamanho_bytes)}</dd>
                    </div>
                    <div className={styles.fieldRow}>
                      <dt className={styles.rowLabel}>Enviado em</dt>
                      <dd className={styles.rowValue}>{formatDateTime(c.criado_em)}</dd>
                    </div>
                    <div className={styles.fieldRow}>
                      <dt className={styles.rowLabel}>Tem revisão salva?</dt>
                      <dd className={styles.rowValue}>{c.has_import_session ? 'Sim' : 'Não'}</dd>
                    </div>
                    <div className={styles.fieldRow}>
                      <dt className={styles.rowLabel}>Último status da revisão</dt>
                      <dd className={styles.rowValue}>
                        {sessionStatusLabel(c.latest_session_status)}
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}
