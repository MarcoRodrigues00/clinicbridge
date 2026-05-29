import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Users,
  Search,
  Eraser,
  Loader2,
  ShieldCheck,
  Phone,
  Mail,
  IdCard,
  Download,
  Plus,
  Pencil,
  Archive,
  ArchiveRestore,
  X,
  ClipboardList,
  HelpCircle,
} from 'lucide-react';
import {
  api,
  ApiError,
  type PatientStatus,
  type PatientStatusFilter,
  type PatientWritePayload,
  type PublicPatient,
} from '../services/api';
import { getToken } from '../services/authStorage';
import { useAuth } from '../services/AuthProvider';
import { ClinicalPatientPane } from './ClinicalPatientPane';
import styles from './PatientsList.module.css';
import clinicalStyles from './ClinicalPatientPane.module.css';

const FORBIDDEN_ROLE_MESSAGE =
  'Seu usuário não tem permissão para executar esta ação. Peça a um administrador da clínica.';

// Small page on purpose: the listing is a paginated/filtered view, not a dump of
// every patient. "Carregar mais" extends it; search/filters narrow it.
const PAGE_SIZE = 9;

const STATUS_LABELS: Record<PatientStatus, string> = {
  active: 'Ativo',
  inactive: 'Inativo',
  archived: 'Arquivado',
};

const STATUS_FILTERS: { value: PatientStatusFilter; label: string }[] = [
  { value: 'active', label: 'Ativos' },
  { value: 'archived', label: 'Arquivados' },
  { value: 'all', label: 'Todos' },
];

interface PatientForm {
  nome: string;
  telefone: string;
  email: string;
  cpf: string;
  data_nascimento: string;
  convenio: string;
  numero_carteirinha: string;
}

const EMPTY_FORM: PatientForm = {
  nome: '',
  telefone: '',
  email: '',
  cpf: '',
  data_nascimento: '',
  convenio: '',
  numero_carteirinha: '',
};

function emptyToNull(value: string): string | null {
  const t = value.trim();
  return t === '' ? null : t;
}

function formFrom(p: PublicPatient): PatientForm {
  return {
    nome: p.nome,
    telefone: p.telefone ?? '',
    email: p.email ?? '',
    // CPF only ever comes back masked, so it cannot be pre-filled. Leaving the
    // field blank on edit keeps the existing CPF (see buildPayload).
    cpf: '',
    data_nascimento: p.data_nascimento ?? '',
    convenio: p.convenio ?? '',
    numero_carteirinha: p.numero_carteirinha ?? '',
  };
}

// On edit, an empty CPF field means "keep the current CPF" (it can't be
// pre-filled because the API only returns it masked), so the key is omitted.
// On create, a blank CPF is sent as null.
function buildPayload(form: PatientForm, isEdit: boolean): PatientWritePayload {
  const payload: PatientWritePayload = {
    nome: form.nome.trim(),
    telefone: emptyToNull(form.telefone),
    email: emptyToNull(form.email),
    data_nascimento: emptyToNull(form.data_nascimento),
    convenio: emptyToNull(form.convenio),
    numero_carteirinha: emptyToNull(form.numero_carteirinha),
  };
  const cpf = form.cpf.trim();
  if (!isEdit) {
    payload.cpf = cpf === '' ? null : cpf;
  } else if (cpf !== '') {
    payload.cpf = cpf;
  }
  return payload;
}

function apiMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    return err.code === 'forbidden_role' ? FORBIDDEN_ROLE_MESSAGE : err.message;
  }
  return fallback;
}

// `refreshKey` lets a sibling (the duplicates panel) force a reload after it
// edits/archives a patient; `onPatientsChanged` lets this panel notify siblings.
export function PatientsList({
  refreshKey = 0,
  onPatientsChanged,
  onAuriTour,
}: {
  refreshKey?: number;
  onPatientsChanged?: () => void;
  onAuriTour?: () => void;
} = {}): JSX.Element {
  const { user } = useAuth();
  // Owner + secretaria can create/edit. Archive/restore and export are owner-only
  // (Sprint 3.1/3.22) — the backend enforces this; the UI just hides the controls.
  const canWrite = user?.papel === 'dono_clinica' || user?.papel === 'secretaria';
  const isOwner = user?.papel === 'dono_clinica';
  const canExport = isOwner;

  const [patients, setPatients] = useState<PublicPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PatientStatusFilter>('active');
  const [hasMore, setHasMore] = useState(false);
  const [exporting, setExporting] = useState<'csv' | 'xlsx' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // Create / edit form. `editingId` null + formOpen true = create.
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PatientForm>(EMPTY_FORM);
  const [editingMaskedCpf, setEditingMaskedCpf] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Per-card archive/restore state.
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Clinical pane state — tracks which patient's prontuário is open.
  const [clinicalPatient, setClinicalPatient] = useState<PublicPatient | null>(null);

  const loadFirstPage = useCallback(
    async (search: string, status: PatientStatusFilter) => {
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
          status,
          limit: PAGE_SIZE,
          offset: 0,
        });
        setPatients(res.patients);
        setHasMore(res.pagination.has_more);
      } catch (err) {
        setError(apiMessage(err, 'Não foi possível carregar os pacientes.'));
        setPatients([]);
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadFirstPage('', statusFilter);
    // Reload when the status filter changes; search is applied via its own submit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  // External refresh (e.g., a duplicate action in the sibling panel). Skip the
  // initial mount (the status-filter effect already loads) and preserve the
  // current search + filter so the user's view isn't reset.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    void loadFirstPage(activeSearch, statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  function reload(): void {
    void loadFirstPage(activeSearch, statusFilter);
  }

  // After a successful write: tell the parent (which bumps refreshKey, reloading
  // both this list and the duplicates panel). Falls back to a local reload when
  // used standalone (no parent callback).
  function notifyChanged(): void {
    if (onPatientsChanged) onPatientsChanged();
    else reload();
  }

  function handleSearch(e: React.FormEvent): void {
    e.preventDefault();
    const term = searchInput.trim();
    setActiveSearch(term);
    void loadFirstPage(term, statusFilter);
  }

  function handleClear(): void {
    setSearchInput('');
    setActiveSearch('');
    void loadFirstPage('', statusFilter);
  }

  function openCreate(): void {
    setEditingId(null);
    setEditingMaskedCpf(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(p: PublicPatient): void {
    setEditingId(p.id);
    setEditingMaskedCpf(p.cpf_masked);
    setForm(formFrom(p));
    setFormError(null);
    setFormOpen(true);
  }

  function closeForm(): void {
    setFormOpen(false);
    setEditingId(null);
    setEditingMaskedCpf(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  function setField<K extends keyof PatientForm>(key: K, value: string): void {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    if (form.nome.trim() === '') {
      setFormError('Informe o nome do paciente.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload = buildPayload(form, editingId !== null);
      if (editingId) {
        await api.updatePatient(token, editingId, payload);
      } else {
        await api.createPatient(token, payload);
      }
      closeForm();
      notifyChanged();
    } catch (err) {
      setFormError(apiMessage(err, 'Não foi possível salvar o paciente.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive(p: PublicPatient): Promise<void> {
    const token = getToken();
    if (!token) return;
    setActionBusyId(p.id);
    setActionError(null);
    try {
      await api.archivePatient(token, p.id);
      notifyChanged();
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
      notifyChanged();
    } catch (err) {
      setActionError(apiMessage(err, 'Não foi possível restaurar o paciente.'));
    } finally {
      setActionBusyId(null);
    }
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
      setExportError(apiMessage(err, 'Não foi possível gerar a exportação.'));
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
        status: statusFilter,
        limit: PAGE_SIZE,
        offset: patients.length,
      });
      setPatients((prev) => [...prev, ...res.patients]);
      setHasMore(res.pagination.has_more);
    } catch (err) {
      setError(apiMessage(err, 'Não foi possível carregar mais pacientes.'));
    } finally {
      setLoadingMore(false);
    }
  }

  function emptyMessage(): string {
    if (activeSearch) return 'Nenhum paciente encontrado para essa busca.';
    if (statusFilter === 'archived') return 'Nenhum paciente arquivado.';
    if (statusFilter === 'all') return 'Nenhum paciente cadastrado ainda.';
    return 'Nenhum paciente ativo. Cadastre um paciente ou importe uma planilha.';
  }

  return (
    <section className={styles.panel}>
      <div className={styles.head}>
        <div>
          <h2 className={styles.title}>
            <Users size={20} aria-hidden="true" />
            Pacientes
          </h2>
          <p className={styles.subtitle}>
            Cadastro administrativo de pacientes (criação manual e importações). A lista é
            paginada e filtrada — não mostra todos os pacientes de uma vez. Use a busca e os
            filtros de status para encontrar um registro. Esta área não contém prontuário clínico.
          </p>
        </div>
        <span className={styles.headActions}>
          {onAuriTour && (
            <button type="button" className={styles.clearBtn} onClick={onAuriTour} title="Auri explica este módulo">
              <HelpCircle size={15} aria-hidden="true" />
              Auri explica
            </button>
          )}
          {canWrite && (
            <button type="button" className={styles.newBtn} onClick={openCreate}>
              <Plus size={16} aria-hidden="true" />
              Novo paciente
            </button>
          )}
        </span>
      </div>

      <p className={styles.notice}>
        <ShieldCheck size={16} aria-hidden="true" />
        Esta área mostra apenas dados administrativos. Nenhum dado clínico é registrado.
      </p>

      {formOpen && (
        <form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
          <div className={styles.formHead}>
            <h3 className={styles.formTitle}>
              {editingId ? 'Editar paciente' : 'Novo paciente'}
            </h3>
            <button
              type="button"
              className={styles.formClose}
              onClick={closeForm}
              aria-label="Fechar formulário"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>

          <div className={styles.formGrid}>
            <label className={styles.formField}>
              <span className={styles.formLabel}>Nome *</span>
              <input
                className={styles.formInput}
                value={form.nome}
                onChange={(e) => setField('nome', e.target.value)}
                maxLength={200}
                required
                autoFocus
              />
            </label>
            <label className={styles.formField}>
              <span className={styles.formLabel}>Telefone</span>
              <input
                className={styles.formInput}
                value={form.telefone}
                onChange={(e) => setField('telefone', e.target.value)}
                maxLength={40}
                inputMode="tel"
              />
            </label>
            <label className={styles.formField}>
              <span className={styles.formLabel}>E-mail</span>
              <input
                className={styles.formInput}
                type="email"
                value={form.email}
                onChange={(e) => setField('email', e.target.value)}
                maxLength={180}
              />
            </label>
            <label className={styles.formField}>
              <span className={styles.formLabel}>CPF</span>
              <input
                className={styles.formInput}
                value={form.cpf}
                onChange={(e) => setField('cpf', e.target.value)}
                inputMode="numeric"
                placeholder={
                  editingId
                    ? editingMaskedCpf
                      ? `Atual: ${editingMaskedCpf} (em branco mantém)`
                      : 'Em branco mantém o atual'
                    : 'Somente números'
                }
              />
            </label>
            <label className={styles.formField}>
              <span className={styles.formLabel}>Nascimento</span>
              <input
                className={styles.formInput}
                type="date"
                value={form.data_nascimento}
                onChange={(e) => setField('data_nascimento', e.target.value)}
              />
            </label>
            <label className={styles.formField}>
              <span className={styles.formLabel}>Convênio</span>
              <input
                className={styles.formInput}
                value={form.convenio}
                onChange={(e) => setField('convenio', e.target.value)}
                maxLength={120}
              />
            </label>
            <label className={styles.formField}>
              <span className={styles.formLabel}>Nº da carteirinha</span>
              <input
                className={styles.formInput}
                value={form.numero_carteirinha}
                onChange={(e) => setField('numero_carteirinha', e.target.value)}
                maxLength={60}
              />
            </label>
          </div>

          {formError && <p className={styles.formError}>{formError}</p>}

          <div className={styles.formActions}>
            <button type="submit" className={styles.saveBtn} disabled={saving}>
              {saving ? (
                <Loader2 size={16} className={styles.spin} aria-hidden="true" />
              ) : null}
              {editingId ? 'Salvar alterações' : 'Criar paciente'}
            </button>
            <button type="button" className={styles.cancelBtn} onClick={closeForm} disabled={saving}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className={styles.filterTabs} role="group" aria-label="Filtrar por status">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={`${styles.filterBtn} ${statusFilter === f.value ? styles.filterBtnActive : ''}`}
            onClick={() => setStatusFilter(f.value)}
            aria-pressed={statusFilter === f.value}
          >
            {f.label}
          </button>
        ))}
      </div>

      <form className={styles.searchBar} onSubmit={handleSearch} role="search" data-tour-id="patients-search">
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

      {actionError && <p className={styles.actionError}>{actionError}</p>}

      {loading ? (
        <p className={styles.state}>
          <Loader2 size={18} className={styles.spin} aria-hidden="true" />
          Carregando pacientes…
        </p>
      ) : error ? (
        <p className={`${styles.state} ${styles.error}`}>{error}</p>
      ) : patients.length === 0 ? (
        <p className={styles.empty}>{emptyMessage()}</p>
      ) : (
        <>
          <p className={styles.count}>
            Mostrando {patients.length} paciente{patients.length === 1 ? '' : 's'} nesta página
            {activeSearch ? ' (busca atual)' : ''}.
          </p>

          {hasMore && (
            <p className={styles.hint}>
              <Search size={14} aria-hidden="true" />
              Use a busca ou carregue mais registros.
            </p>
          )}

          <ul className={styles.grid} data-tour-id="patients-list">
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

                {p.status === 'archived' && p.merged_into_id && (
                  // Safe-merge B-safe provenance (Sprint 3.34): this archived
                  // record was the secondary of a merge. We do NOT look up the
                  // primary's name — it could be PII to surface here and isn't
                  // needed for the badge's purpose.
                  <p className={styles.mergedTag} title="Este registro foi resolvido como duplicado.">
                    Mesclado em outro registro
                  </p>
                )}

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
                </dl>

                <div className={styles.cardActions}>
                  {canWrite && (
                    <button
                      type="button"
                      className={styles.cardActionBtn}
                      onClick={() => openEdit(p)}
                      disabled={actionBusyId === p.id}
                    >
                      <Pencil size={14} aria-hidden="true" />
                      Editar
                    </button>
                  )}
                  {isOwner &&
                    (p.status === 'archived' ? (
                      <button
                        type="button"
                        className={styles.cardActionBtn}
                        onClick={() => void handleRestore(p)}
                        disabled={actionBusyId === p.id}
                      >
                        {actionBusyId === p.id ? (
                          <Loader2 size={14} className={styles.spin} aria-hidden="true" />
                        ) : (
                          <ArchiveRestore size={14} aria-hidden="true" />
                        )}
                        Restaurar
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={`${styles.cardActionBtn} ${styles.cardActionDanger}`}
                        onClick={() => void handleArchive(p)}
                        disabled={actionBusyId === p.id}
                      >
                        {actionBusyId === p.id ? (
                          <Loader2 size={14} className={styles.spin} aria-hidden="true" />
                        ) : (
                          <Archive size={14} aria-hidden="true" />
                        )}
                        Arquivar
                      </button>
                    ))}
                  {/* Prontuário button — available for non-archived patients.
                      The backend is authoritative on clinical access. We do NOT
                      hide the button by papel because a secretaria may legitimately
                      hold a clinical grant (gestor/profissional_clinico) that the
                      frontend user object does not expose. Instead, ClinicalPatientPane
                      renders a clear "Acesso ao prontuário restrito" state on 403
                      (Sprint 6.0J) so a blocked user sees an explanation, not an error. */}
                  {p.status !== 'archived' && (
                    <button
                      type="button"
                      className={clinicalStyles.prontuarioBtn}
                      onClick={() => setClinicalPatient(p)}
                    >
                      <ClipboardList size={13} aria-hidden="true" />
                      Prontuário
                    </button>
                  )}
                </div>
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
      {/* Clinical pane — mounted once; backend decides if the user has access */}
      {clinicalPatient && (
        <ClinicalPatientPane
          patient={clinicalPatient}
          open={clinicalPatient !== null}
          onClose={() => setClinicalPatient(null)}
        />
      )}
    </section>
  );
}
