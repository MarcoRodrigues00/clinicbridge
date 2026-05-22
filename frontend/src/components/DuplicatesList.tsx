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
} from 'lucide-react';
import {
  api,
  ApiError,
  type DuplicateConfidence,
  type DuplicateReason,
  type DuplicateScanResult,
} from '../services/api';
import { getToken } from '../services/authStorage';
import styles from './DuplicatesList.module.css';

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

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR');
}

function formatBirthDate(value: string | null): string {
  if (!value) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : value;
}

export function DuplicatesList(): JSX.Element {
  const [result, setResult] = useState<DuplicateScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Não foi possível analisar os duplicados.',
      );
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
        Esta análise é apenas informativa. Nenhum paciente será mesclado, editado ou excluído
        automaticamente.
      </p>

      {loading ? (
        <p className={styles.state}>
          <Loader2 size={18} className={styles.spin} aria-hidden="true" />
          Analisando possíveis duplicados…
        </p>
      ) : error ? (
        <p className={`${styles.state} ${styles.error}`}>{error}</p>
      ) : !result || result.groups.length === 0 ? (
        <p className={styles.empty}>Nenhum possível duplicado encontrado.</p>
      ) : (
        <>
          <p className={styles.count}>
            {result.summary.groups_count} grupo
            {result.summary.groups_count === 1 ? '' : 's'} ·{' '}
            {result.summary.patients_in_duplicate_groups} registro
            {result.summary.patients_in_duplicate_groups === 1 ? '' : 's'} envolvido
            {result.summary.patients_in_duplicate_groups === 1 ? '' : 's'}.
            {result.summary.scan_limited
              ? ' A análise foi limitada a uma parte dos registros.'
              : ''}
          </p>

          <ul className={styles.groups}>
            {result.groups.map((g) => (
              <li
                key={g.group_key}
                className={`${styles.group} ${
                  g.confidence === 'high' ? styles.groupHigh : styles.groupMedium
                }`}
              >
                <div className={styles.groupHead}>
                  <span className={styles.reason}>{REASON_LABELS[g.reason] ?? g.reason}</span>
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
                      <span className={styles.recordName} title={p.nome}>
                        {p.nome}
                      </span>
                      <span className={styles.recordFields}>
                        <span className={styles.recordField}>
                          <Phone size={13} aria-hidden="true" />
                          {p.telefone ?? '—'}
                        </span>
                        <span className={styles.recordField} title={p.email ?? undefined}>
                          <Mail size={13} aria-hidden="true" />
                          {p.email ?? '—'}
                        </span>
                        <span className={styles.recordField}>
                          <IdCard size={13} aria-hidden="true" />
                          {p.cpf_masked ?? '—'}
                        </span>
                        <span className={styles.recordField}>
                          <Cake size={13} aria-hidden="true" />
                          {formatBirthDate(p.data_nascimento)}
                        </span>
                      </span>
                      <span className={styles.recordMeta}>
                        {p.origem} · criado em {formatDateTime(p.criado_em)}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
