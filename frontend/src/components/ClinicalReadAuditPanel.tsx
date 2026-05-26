// ClinicalReadAuditPanel — Sprint 4.2E (ADR 0010 §8.3).
// Owner-only panel for LGPD-art.18 transparency: shows who accessed the
// clinical records (prontuário), when, and for which patient. Does NOT show
// any clinical content — only access metadata from clinical_read_audit.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, Loader2, Search } from 'lucide-react';
import { api, ApiError, type ClinicalReadAuditFilters } from '../services/api';
import { getToken } from '../services/authStorage';
import { useAuth } from '../services/AuthProvider';
import styles from './ClinicalReadAuditPanel.module.css';

// Human-readable labels for acao values.
const ACAO_LABELS: Record<string, string> = {
  'clinical.encounter.read': 'Leitura de atendimento',
  'clinical.encounter.list': 'Listagem de atendimentos',
  'clinical.timeline.list': 'Visualização de histórico',
};

// Human-readable labels for papel_at_read values.
const PAPEL_LABELS: Record<string, string> = {
  dono_clinica: 'Dono(a) da clínica',
  gestor_clinica: 'Supervisor',
  profissional_clinico: 'Profissional clínico',
  unknown: 'Desconhecido',
};

// Acao options for the filter dropdown.
const ACAO_OPTIONS = [
  { value: '', label: 'Todos os tipos' },
  { value: 'clinical.encounter.read', label: 'Leitura de atendimento' },
  { value: 'clinical.encounter.list', label: 'Listagem de atendimentos' },
  { value: 'clinical.timeline.list', label: 'Visualização de histórico' },
];

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return 'Não foi possível carregar os dados de auditoria. Tente novamente.';
}

export function ClinicalReadAuditPanel(): JSX.Element | null {
  const { user } = useAuth();
  const token = getToken();

  const isOwner = user?.papel === 'dono_clinica';

  // Active filter state. Empty strings mean "no filter".
  const [filterAcao, setFilterAcao] = useState('');
  // Applied filters — only sent to the query after the user clicks "Buscar".
  // This prevents a new fetch on every keystroke for date inputs.
  const [appliedFilters, setAppliedFilters] = useState<ClinicalReadAuditFilters>({});
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['clinicalReadAudit', appliedFilters],
    queryFn: () => api.listClinicalReadAudit(token!, appliedFilters),
    enabled: isOwner && !!token,
    staleTime: 30_000,
  });

  if (!isOwner) return null;

  function handleSearch(): void {
    const filters: ClinicalReadAuditFilters = {};
    if (filterAcao) filters.acao = filterAcao;
    if (dateFrom) filters.date_from = new Date(dateFrom).toISOString();
    if (dateTo) {
      // date_to from a date input is start-of-day; use end-of-day for inclusivity
      const d = new Date(dateTo);
      d.setHours(23, 59, 59, 999);
      filters.date_to = d.toISOString();
    }
    filters.limit = 100;
    setAppliedFilters(filters);
  }

  function handleReset(): void {
    setFilterAcao('');
    setDateFrom('');
    setDateTo('');
    setAppliedFilters({});
  }

  const audits = data?.audits ?? [];

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <p className={styles.panelTitle}>
          <ShieldCheck size={18} aria-hidden="true" />
          Auditoria do prontuário
        </p>
        <p className={styles.panelSubtitle}>
          Registro de quem acessou os dados clínicos dos pacientes da sua
          clínica. Esta tela mostra apenas metadados de acesso (quem, quando,
          qual tipo de ação) — nunca o conteúdo do prontuário. Use para
          conformidade com a LGPD e rastreabilidade interna.
        </p>
      </div>

      {/* Filters */}
      <div className={styles.filterRow}>
        <label className={styles.filterField}>
          <span className={styles.filterLabel}>Tipo de acesso</span>
          <select
            className={styles.filterSelect}
            value={filterAcao}
            onChange={(e) => setFilterAcao(e.target.value)}
          >
            {ACAO_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.filterField}>
          <span className={styles.filterLabel}>A partir de</span>
          <input
            type="date"
            className={styles.filterInput}
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </label>
        <label className={styles.filterField}>
          <span className={styles.filterLabel}>Até</span>
          <input
            type="date"
            className={styles.filterInput}
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </label>
        <div className={styles.filterActions}>
          <button type="button" className={styles.searchBtn} onClick={handleSearch}>
            <Search size={14} aria-hidden="true" />
            Buscar
          </button>
          <button type="button" className={styles.resetBtn} onClick={handleReset}>
            Limpar
          </button>
        </div>
      </div>

      {/* Status messages */}
      {isLoading && (
        <p className={styles.stateMsg}>
          <Loader2 size={15} className={styles.spin} aria-hidden="true" />
          Carregando registros…
        </p>
      )}

      {error && <p className={styles.errorMsg}>{errorMessage(error)}</p>}

      {!isLoading && !error && audits.length === 0 && (
        <p className={styles.emptyMsg}>
          Nenhum evento de acesso registrado para os filtros selecionados.
        </p>
      )}

      {/* Audit list */}
      {audits.length > 0 && (
        <>
          <p className={styles.countMsg}>
            Exibindo {audits.length} evento{audits.length !== 1 ? 's' : ''}
            {audits.length === 100 ? ' (máximo — use os filtros para refinar)' : ''}.
          </p>
          <ul className={styles.auditList}>
            {audits.map((entry) => (
              <li key={entry.id} className={styles.auditRow}>
                <div className={styles.auditLeft}>
                  <p className={styles.auditAcao}>
                    {ACAO_LABELS[entry.acao] ?? entry.acao}
                  </p>
                  <p className={styles.auditMeta}>
                    {entry.paciente_nome
                      ? `Paciente: ${entry.paciente_nome}`
                      : entry.paciente_id
                        ? 'Paciente: (registro não localizado)'
                        : 'Paciente: listagem geral'}
                  </p>
                  <p className={styles.auditMeta}>
                    Papel:{' '}
                    {PAPEL_LABELS[entry.papel_at_read] ?? entry.papel_at_read}
                  </p>
                </div>
                <div className={styles.auditRight}>
                  <p className={styles.auditUser}>
                    {entry.usuario_nome ?? entry.usuario_email ?? 'Usuário removido'}
                  </p>
                  {entry.usuario_email && entry.usuario_nome && (
                    <p className={styles.auditUserEmail}>{entry.usuario_email}</p>
                  )}
                  <p className={styles.auditDate}>{formatDateTime(entry.criado_em)}</p>
                </div>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className={styles.reloadBtn}
            onClick={() => void refetch()}
          >
            Atualizar lista
          </button>
        </>
      )}
    </div>
  );
}
