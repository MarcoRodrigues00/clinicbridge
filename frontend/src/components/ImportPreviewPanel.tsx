import { useState } from 'react';
import { X, Info, AlertTriangle, ArrowRight, CheckCircle2, XCircle, Loader2, Save } from 'lucide-react';
import {
  api,
  ApiError,
  type ImportPreviewResponse,
  type ImportSessionStatus,
  type ImportValidationReport,
  type MappingInput,
  type PreviewCell,
  type PublicImportSession,
  type SuggestedMapping,
} from '../services/api';
import { getToken } from '../services/authStorage';
import { ValidationReport } from './ValidationReport';
import styles from './ImportPreviewPanel.module.css';

type TargetKey = keyof SuggestedMapping;

const SESSION_STATUS_LABELS: Record<ImportSessionStatus, string> = {
  validated: 'Validada',
  ready_for_import: 'Pronta para importar',
  import_started: 'Importação iniciada',
  import_completed: 'Importação concluída',
  cancelled: 'Cancelada',
  failed: 'Falhou',
};

const TARGETS: Array<{ key: TargetKey; label: string }> = [
  { key: 'nome', label: 'Nome' },
  { key: 'telefone', label: 'Telefone' },
  { key: 'email', label: 'E-mail' },
  { key: 'cpf', label: 'CPF' },
  { key: 'data_nascimento', label: 'Data de nascimento' },
];

// Local-only value meaning "this target is intentionally not mapped".
const UNMAPPED = '';

// Frontend fallback synonyms, used only to fill a target the backend left null
// (e.g. headers like "Data Nasc." that the server heuristic misses).
const FALLBACK_SYNONYMS: Record<TargetKey, string[]> = {
  nome: ['nome completo', 'nome', 'paciente', 'patient', 'name'],
  telefone: ['telefone', 'celular', 'whatsapp', 'phone', 'contato', 'fone', 'tel'],
  email: ['email', 'e-mail', 'mail'],
  cpf: ['cpf', 'documento', 'doc'],
  data_nascimento: [
    'data de nascimento',
    'data nascimento',
    'data nasc',
    'dt nasc',
    'nascimento',
    'nasc',
    'birthdate',
    'dob',
  ],
};

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function fallbackSuggest(key: TargetKey, columns: string[]): string {
  const syns = FALLBACK_SYNONYMS[key];
  for (const col of columns) {
    const n = norm(col);
    if (syns.some((s) => n === s || n.includes(s))) {
      return col;
    }
  }
  return UNMAPPED;
}

function renderCell(value: PreviewCell): string {
  if (value === null) return '—';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  return String(value);
}

export function ImportPreviewPanel({
  preview,
  onClose,
  onSessionSaved,
}: {
  preview: ImportPreviewResponse;
  onClose: () => void;
  onSessionSaved?: () => void;
}): JSX.Element {
  const { file, summary, suggested_mapping, rows } = preview;

  // Manual mapping lives in component state. Seeded from the server suggestion,
  // then a frontend fallback fills any target the server left null. Keyed by
  // file id upstream, so a new preview re-mounts and re-seeds.
  const [mapping, setMapping] = useState<Record<TargetKey, string>>(() => {
    const init = {} as Record<TargetKey, string>;
    for (const t of TARGETS) {
      init[t.key] = suggested_mapping[t.key] ?? fallbackSuggest(t.key, summary.detected_columns);
    }
    return init;
  });
  const [report, setReport] = useState<ImportValidationReport | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [savedSession, setSavedSession] = useState<PublicImportSession | null>(null);
  const [savingSession, setSavingSession] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Live mapping guidance (pre-conditions for verifying).
  const localWarnings: string[] = [];
  if (mapping.nome === UNMAPPED) {
    localWarnings.push('Mapeie a coluna de nome antes de avançar.');
  }
  if (mapping.telefone === UNMAPPED && mapping.email === UNMAPPED) {
    localWarnings.push('Mapeie pelo menos telefone ou e-mail para contato.');
  }
  const usedCols = TARGETS.map((t) => mapping[t.key]).filter((v) => v !== UNMAPPED);
  if (new Set(usedCols).size !== usedCols.length) {
    localWarnings.push('A mesma coluna foi usada em mais de um campo. Confira se isso está correto.');
  }

  function buildMappingInput(): MappingInput {
    return {
      nome: mapping.nome || null,
      telefone: mapping.telefone || null,
      email: mapping.email || null,
      cpf: mapping.cpf || null,
      data_nascimento: mapping.data_nascimento || null,
    };
  }

  function setTarget(key: TargetKey, value: string): void {
    setMapping((prev) => ({ ...prev, [key]: value }));
    // Mapping changed → previous report and saved review are stale.
    setReport(null);
    setReportError(null);
    setSavedSession(null);
    setSessionError(null);
  }

  async function handleSaveSession(): Promise<void> {
    setSessionError(null);
    const token = getToken();
    if (!token) {
      setSessionError('Sessão expirada. Faça login novamente.');
      return;
    }
    setSavingSession(true);
    try {
      const res = await api.createImportSession(token, file.id, buildMappingInput());
      setSavedSession(res.session);
      onSessionSaved?.();
    } catch (err) {
      setSessionError(
        err instanceof ApiError ? err.message : 'Não foi possível salvar a revisão.',
      );
    } finally {
      setSavingSession(false);
    }
  }

  async function handleVerify(): Promise<void> {
    setReportError(null);
    setSavedSession(null);
    setSessionError(null);

    if (mapping.nome === UNMAPPED) {
      setReportError('Mapeie a coluna de nome antes de verificar.');
      return;
    }
    if (mapping.telefone === UNMAPPED && mapping.email === UNMAPPED) {
      setReportError('Mapeie telefone ou e-mail antes de verificar.');
      return;
    }
    const token = getToken();
    if (!token) {
      setReportError('Sessão expirada. Faça login novamente.');
      return;
    }

    const mappingInput: MappingInput = buildMappingInput();

    setVerifying(true);
    setReport(null);
    try {
      const r = await api.validateImportFile(token, file.id, mappingInput);
      setReport(r);
    } catch (err) {
      setReportError(
        err instanceof ApiError ? err.message : 'Não foi possível validar o arquivo.',
      );
    } finally {
      setVerifying(false);
    }
  }

  // Avoid duplicating the row-count message: we render our own line, so drop the
  // backend's "Mostrando as primeiras N linhas." warning (keep column/sheet ones).
  const otherWarnings = summary.warnings.filter(
    (w) => !/^Mostrando as primeiras \d+ linhas\.?$/.test(w),
  );

  return (
    <section className={styles.panel} aria-label={`Pré-visualização de ${file.nome_original}`}>
      <div className={styles.head}>
        <h3 className={styles.title} title={file.nome_original}>
          Pré-visualização: {file.nome_original}
        </h3>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label="Fechar pré-visualização"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <div className={styles.notice}>
        <Info size={16} aria-hidden="true" />
        <span>Esta é apenas uma pré-visualização. Nenhum dado foi importado ainda.</span>
      </div>

      {summary.preview_limited ? (
        <div className={styles.limited}>
          <AlertTriangle size={15} aria-hidden="true" />
          <span>
            O arquivo possui mais registros. Apenas as primeiras {summary.total_preview_rows}{' '}
            linhas aparecem na tabela abaixo.
          </span>
        </div>
      ) : (
        <p className={styles.count}>
          Mostrando {summary.total_preview_rows}{' '}
          {summary.total_preview_rows === 1 ? 'linha' : 'linhas'}.
        </p>
      )}

      <div className={styles.block}>
        <span className={styles.blockLabel}>Colunas detectadas</span>
        <div className={styles.chips}>
          {summary.detected_columns.map((col) => (
            <span key={col} className={styles.chip}>
              {col}
            </span>
          ))}
        </div>
      </div>

      <div className={styles.block}>
        <span className={styles.blockLabel}>Mapeamento sugerido</span>
        <div className={styles.suggestGrid}>
          {TARGETS.map(({ key, label }) => (
            <div key={key} className={styles.suggestItem}>
              <span className={styles.suggestField}>{label}</span>
              <ArrowRight size={14} aria-hidden="true" className={styles.suggestArrow} />
              <span className={mapping[key] ? styles.suggestValue : styles.suggestNone}>
                {mapping[key] || 'sem sugestão'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {otherWarnings.length > 0 ? (
        <ul className={styles.warnings}>
          {otherWarnings.map((w) => (
            <li key={w} className={styles.warning}>
              <AlertTriangle size={14} aria-hidden="true" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {rows.length === 0 ? (
        <p className={styles.empty}>O arquivo não tem linhas de dados para pré-visualizar.</p>
      ) : (
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                {summary.detected_columns.map((col) => (
                  <th key={col} title={col}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {summary.detected_columns.map((col) => (
                    <td key={col}>{renderCell(row[col] ?? null)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={styles.mapSection}>
        <h4 className={styles.mapTitle}>Confirme o que cada coluna representa</h4>
        <p className={styles.mapHint}>
          Ao verificar, o ClinicBridge analisa o arquivo inteiro (até o limite configurado) e
          devolve um relatório de qualidade. Nenhum dado foi importado ainda.
        </p>

        <div className={styles.mapForm}>
          {TARGETS.map(({ key, label }) => (
            <div key={key} className={styles.mapRow}>
              <label className={styles.mapLabel} htmlFor={`map-${key}`}>
                {label}
              </label>
              <select
                id={`map-${key}`}
                className={styles.select}
                value={mapping[key]}
                onChange={(e) => setTarget(key, e.target.value)}
              >
                <option value={UNMAPPED}>Não mapear</option>
                {summary.detected_columns.map((col) => (
                  <option key={col} value={col}>
                    {col}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        {localWarnings.length > 0 ? (
          <ul className={styles.warnings}>
            {localWarnings.map((w) => (
              <li key={w} className={styles.warning}>
                <AlertTriangle size={14} aria-hidden="true" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <button
          type="button"
          className={styles.validateBtn}
          onClick={handleVerify}
          disabled={verifying}
        >
          {verifying ? (
            <>
              <Loader2 size={16} className="spin" aria-hidden="true" />
              Verificando arquivo…
            </>
          ) : (
            <>
              <CheckCircle2 size={16} aria-hidden="true" />
              Verificar dados
            </>
          )}
        </button>

        {reportError ? (
          <div className={styles.reportError} role="alert">
            <XCircle size={16} aria-hidden="true" />
            <span>{reportError}</span>
          </div>
        ) : null}

        {report ? <ValidationReport report={report} /> : null}

        {report ? (
          <div className={styles.saveSection}>
            <button
              type="button"
              className={styles.saveBtn}
              onClick={handleSaveSession}
              disabled={
                savingSession ||
                mapping.nome === UNMAPPED ||
                (mapping.telefone === UNMAPPED && mapping.email === UNMAPPED)
              }
            >
              {savingSession ? (
                <>
                  <Loader2 size={16} className="spin" aria-hidden="true" />
                  Salvando revisão…
                </>
              ) : (
                <>
                  <Save size={16} aria-hidden="true" />
                  Salvar revisão da migração
                </>
              )}
            </button>
            <p className={styles.saveHint}>
              Esta etapa apenas salva a revisão e o mapeamento para auditoria. Nenhum paciente
              foi importado. A importação real será implementada em uma etapa futura.
            </p>

            {sessionError ? (
              <div className={styles.reportError} role="alert">
                <XCircle size={16} aria-hidden="true" />
                <span>{sessionError}</span>
              </div>
            ) : null}

            {savedSession ? (
              <div className={styles.saveSuccess} role="status">
                <CheckCircle2 size={16} aria-hidden="true" />
                <span>
                  Revisão salva. Nenhum paciente foi importado ainda
                  ({SESSION_STATUS_LABELS[savedSession.status]}).
                </span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
