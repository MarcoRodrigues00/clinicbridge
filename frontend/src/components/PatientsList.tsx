import { useCallback, useEffect, useState } from 'react';
import {
  Users,
  Search,
  Eraser,
  Loader2,
  ShieldCheck,
  Phone,
  Mail,
  IdCard,
  Cake,
  Tag,
  Clock,
  Download,
} from 'lucide-react';
import { api, ApiError, type PatientStatus, type PublicPatient } from '../services/api';
import { getToken } from '../services/authStorage';
import { useAuth } from '../services/AuthProvider';
import styles from './PatientsList.module.css';

const FORBIDDEN_ROLE_MESSAGE =
  'Seu usuário não tem permissão para executar esta ação. Peça a um administrador da clínica.';

const PAGE_SIZE = 50;

const STATUS_LABELS: Record<PatientStatus, string> = {
  active: 'Ativo',
  inactive: 'Inativo',
  archived: 'Arquivado',
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR');
}

// data_nascimento arrives as a date-only string (YYYY-MM-DD). Format it without
// constructing a Date so the value never shifts a day across time zones.
function formatBirthDate(value: string | null): string {
  if (!value) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : value;
}

export function PatientsList(): JSX.Element {
  const { user } = useAuth();
  // Sprint 3.1: export produces a file with administrative PII, so it is owner-only.
  const canExport = user?.papel === 'dono_clinica';
  const [patients, setPatients] = useState<PublicPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [exporting, setExporting] = useState<'csv' | 'xlsx' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const loadFirstPage = useCallback(async (search: string) => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.listPatients(token, {
        search: search || undefined,
        limit: PAGE_SIZE,
        offset: 0,
      });
      setPatients(res.patients);
      setHasMore(res.pagination.has_more);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Não foi possível carregar os pacientes.',
      );
      setPatients([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFirstPage('');
  }, [loadFirstPage]);

  function handleSearch(e: React.FormEvent): void {
    e.preventDefault();
    const term = searchInput.trim();
    setActiveSearch(term);
    void loadFirstPage(term);
  }

  function handleClear(): void {
    setSearchInput('');
    setActiveSearch('');
    void loadFirstPage('');
  }

  async function handleExport(format: 'csv' | 'xlsx'): Promise<void> {
    const token = getToken();
    if (!token) return;
    setExporting(format);
    setExportError(null);
    try {
      const { blob, filename } = await api.downloadPatientsExport(token, {
        format,
        search: activeSearch || undefined,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(
        err instanceof ApiError
          ? err.code === 'forbidden_role'
            ? FORBIDDEN_ROLE_MESSAGE
            : err.message
          : 'Não foi possível gerar a exportação.',
      );
    } finally {
      setExporting(null);
    }
  }

  async function handleLoadMore(): Promise<void> {
    const token = getToken();
    if (!token) return;
    setLoadingMore(true);
    try {
      const res = await api.listPatients(token, {
        search: activeSearch || undefined,
        limit: PAGE_SIZE,
        offset: patients.length,
      });
      setPatients((prev) => [...prev, ...res.patients]);
      setHasMore(res.pagination.has_more);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Não foi possível carregar mais pacientes.',
      );
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section className={styles.panel}>
      <div className={styles.head}>
        <div>
          <h2 className={styles.title}>
            <Users size={20} aria-hidden="true" />
            Pacientes importados
          </h2>
          <p className={styles.subtitle}>
            Pacientes administrativos criados pelas importações. Esta área ainda não contém
            prontuário clínico.
          </p>
        </div>
      </div>

      <p className={styles.notice}>
        <ShieldCheck size={16} aria-hidden="true" />
        Esta listagem mostra apenas dados administrativos importados. Nenhum dado clínico foi
        importado.
      </p>

      <form className={styles.searchBar} onSubmit={handleSearch} role="search">
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Buscar por nome, e-mail ou telefone"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          aria-label="Buscar pacientes por nome, e-mail ou telefone"
        />
        <button type="submit" className={styles.searchBtn} disabled={loading}>
          <Search size={16} aria-hidden="true" />
          Buscar
        </button>
        <button
          type="button"
          className={styles.clearBtn}
          onClick={handleClear}
          disabled={loading || (searchInput === '' && activeSearch === '')}
        >
          <Eraser size={16} aria-hidden="true" />
          Limpar
        </button>
      </form>

      {canExport ? (
        <div className={styles.exportBlock}>
          <p className={styles.exportNote}>
            A exportação contém apenas dados administrativos. Nenhum dado clínico será exportado.
            CPF será exportado apenas mascarado.
            {activeSearch ? ' A exportação respeita a busca atual.' : ''}
          </p>
          <div className={styles.exportBtns}>
            <button
              type="button"
              className={styles.exportBtn}
              onClick={() => void handleExport('csv')}
              disabled={exporting !== null}
            >
              {exporting === 'csv' ? (
                <Loader2 size={16} className={styles.spin} aria-hidden="true" />
              ) : (
                <Download size={16} aria-hidden="true" />
              )}
              Exportar CSV
            </button>
            <button
              type="button"
              className={styles.exportBtn}
              onClick={() => void handleExport('xlsx')}
              disabled={exporting !== null}
            >
              {exporting === 'xlsx' ? (
                <Loader2 size={16} className={styles.spin} aria-hidden="true" />
              ) : (
                <Download size={16} aria-hidden="true" />
              )}
              Exportar XLSX
            </button>
          </div>
          {exportError && <p className={styles.exportError}>{exportError}</p>}
        </div>
      ) : (
        <p className={styles.notice}>
          <ShieldCheck size={16} aria-hidden="true" />
          A exportação de pacientes está disponível apenas para o dono da clínica.
        </p>
      )}

      {loading ? (
        <p className={styles.state}>
          <Loader2 size={18} className={styles.spin} aria-hidden="true" />
          Carregando pacientes…
        </p>
      ) : error ? (
        <p className={`${styles.state} ${styles.error}`}>{error}</p>
      ) : patients.length === 0 ? (
        <p className={styles.empty}>
          {activeSearch
            ? 'Nenhum paciente encontrado para essa busca.'
            : 'Nenhum paciente importado ainda.'}
        </p>
      ) : (
        <>
          <p className={styles.count}>
            Mostrando {patients.length} paciente{patients.length === 1 ? '' : 's'}
            {activeSearch ? ' para a busca atual' : ''}.
          </p>

          <ul className={styles.grid}>
            {patients.map((p) => (
              <li key={p.id} className={styles.card}>
                <div className={styles.cardHead}>
                  <span className={styles.name} title={p.nome}>
                    {p.nome}
                  </span>
                  <span className={`${styles.badge} ${styles[`status_${p.status}`] ?? ''}`}>
                    {STATUS_LABELS[p.status] ?? p.status}
                  </span>
                </div>

                <dl className={styles.fields}>
                  <div className={styles.field}>
                    <dt className={styles.fieldLabel}>
                      <Phone size={14} aria-hidden="true" />
                      Telefone
                    </dt>
                    <dd className={styles.fieldValue}>{p.telefone ?? '—'}</dd>
                  </div>
                  <div className={styles.field}>
                    <dt className={styles.fieldLabel}>
                      <Mail size={14} aria-hidden="true" />
                      E-mail
                    </dt>
                    <dd className={styles.fieldValue} title={p.email ?? undefined}>
                      {p.email ?? '—'}
                    </dd>
                  </div>
                  <div className={styles.field}>
                    <dt className={styles.fieldLabel}>
                      <IdCard size={14} aria-hidden="true" />
                      CPF
                    </dt>
                    <dd className={styles.fieldValue}>{p.cpf_masked ?? '—'}</dd>
                  </div>
                  <div className={styles.field}>
                    <dt className={styles.fieldLabel}>
                      <Cake size={14} aria-hidden="true" />
                      Nascimento
                    </dt>
                    <dd className={styles.fieldValue}>{formatBirthDate(p.data_nascimento)}</dd>
                  </div>
                  <div className={styles.field}>
                    <dt className={styles.fieldLabel}>
                      <Tag size={14} aria-hidden="true" />
                      Origem
                    </dt>
                    <dd className={styles.fieldValue}>{p.origem}</dd>
                  </div>
                  <div className={styles.field}>
                    <dt className={styles.fieldLabel}>
                      <Clock size={14} aria-hidden="true" />
                      Criado em
                    </dt>
                    <dd className={styles.fieldValue}>{formatDateTime(p.criado_em)}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>

          {hasMore && (
            <div className={styles.moreRow}>
              <button
                type="button"
                className={styles.moreBtn}
                onClick={() => void handleLoadMore()}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <>
                    <Loader2 size={16} className={styles.spin} aria-hidden="true" />
                    Carregando…
                  </>
                ) : (
                  'Carregar mais pacientes'
                )}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
