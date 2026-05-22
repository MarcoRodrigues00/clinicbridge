import { useState } from 'react';
import {
  ListChecks,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Copy,
  Info,
  ChevronDown,
  ChevronUp,
  type LucideIcon,
} from 'lucide-react';
import type {
  ContactPresence,
  DryRunIssue,
  DryRunRowStatus,
  DryRunSampleRow,
  ImportDryRunReport,
} from '../services/api';
import styles from './DryRunResult.module.css';

const ROW_STATUS_LABELS: Record<DryRunRowStatus, string> = {
  would_import: 'Seria importada',
  blocked: 'Bloqueada',
  needs_review: 'Precisa revisão',
};

const INITIAL_ISSUES_VISIBLE = 8;
const INITIAL_SAMPLE_VISIBLE = 10;

type Tone = 'neutral' | 'ok' | 'warn' | 'error' | 'info';
type IssueGroupTone = 'error' | 'warning' | 'duplicate';

function Card({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: LucideIcon;
  value: number;
  label: string;
  tone: Tone;
}): JSX.Element {
  return (
    <div className={`${styles.card} ${styles[`card_${tone}`]}`}>
      <Icon size={18} aria-hidden="true" />
      <span className={styles.cardValue}>{value}</span>
      <span className={styles.cardLabel}>{label}</span>
    </div>
  );
}

export function DryRunResult({ report }: { report: ImportDryRunReport }): JSX.Element {
  const s = report.summary;
  const errors = report.issues.filter((i) => i.severity === 'error');
  const warnings = report.issues.filter((i) => i.severity === 'warning');
  const duplicates = report.issues.filter((i) => i.severity === 'duplicate');

  return (
    <div className={styles.result}>
      <h5 className={styles.title}>Resultado da simulação</h5>
      <div className={styles.notice}>
        <Info size={15} aria-hidden="true" />
        <span>Esta foi apenas uma simulação. Nenhum paciente foi importado.</span>
      </div>

      <div className={styles.cards}>
        <Card
          icon={ListChecks}
          value={s.total_rows_analyzed}
          label="Linhas analisadas"
          tone="neutral"
        />
        <Card
          icon={CheckCircle2}
          value={s.would_import_count}
          label="Seriam importadas"
          tone="ok"
        />
        <Card
          icon={XCircle}
          value={s.blocked_count}
          label="Bloqueadas"
          tone={s.blocked_count > 0 ? 'error' : 'neutral'}
        />
        <Card icon={AlertTriangle} value={s.warning_count} label="Com avisos" tone="warn" />
        <Card icon={Copy} value={s.duplicate_count} label="Possíveis duplicados" tone="info" />
      </div>

      <InterpretiveSummary
        blocked={s.blocked_count}
        warnings={s.warning_count}
        duplicates={s.duplicate_count}
      />

      <SampleRowsSection rows={report.sample_rows} />

      <IssueGroup
        tone="error"
        title="Erros bloqueantes"
        totalCount={s.blocked_count}
        description="Essas linhas não seriam importadas até serem corrigidas."
        issues={errors}
        sampleTruncated={s.issues_truncated}
      />

      <IssueGroup
        tone="warning"
        title="Avisos"
        totalCount={s.warning_count}
        description="Esses pontos merecem revisão, mas não bloqueiam necessariamente a importação."
        issues={warnings}
        sampleTruncated={s.issues_truncated}
      />

      <IssueGroup
        tone="duplicate"
        title="Possíveis duplicados"
        totalCount={s.duplicate_count}
        description="Podem ser cadastros repetidos ou contatos compartilhados — confira antes de importar."
        issues={duplicates}
        sampleTruncated={s.issues_truncated}
      />
    </div>
  );
}

function InterpretiveSummary({
  blocked,
  warnings,
  duplicates,
}: {
  blocked: number;
  warnings: number;
  duplicates: number;
}): JSX.Element | null {
  const lines: Array<{ tone: 'error' | 'warning' | 'info'; text: string }> = [];
  if (blocked > 0) {
    lines.push({
      tone: 'error',
      text: 'Existem linhas bloqueadas que não seriam importadas sem correção.',
    });
  }
  if (warnings > 0) {
    lines.push({
      tone: 'warning',
      text: 'Há avisos que merecem revisão, mas eles não impedem necessariamente a importação.',
    });
  }
  if (duplicates > 0) {
    lines.push({
      tone: 'info',
      text: 'Possíveis duplicados devem ser revisados antes da importação real.',
    });
  }
  if (lines.length === 0) return null;
  return (
    <ul className={styles.summary}>
      {lines.map((l, i) => (
        <li key={i} className={`${styles.summaryItem} ${styles[`summary_${l.tone}`]}`}>
          {l.tone === 'error' ? (
            <XCircle size={14} aria-hidden="true" />
          ) : l.tone === 'warning' ? (
            <AlertTriangle size={14} aria-hidden="true" />
          ) : (
            <Info size={14} aria-hidden="true" />
          )}
          <span>{l.text}</span>
        </li>
      ))}
    </ul>
  );
}

function SampleRowsSection({ rows }: { rows: DryRunSampleRow[] }): JSX.Element | null {
  const [expanded, setExpanded] = useState(false);
  if (rows.length === 0) return null;
  const hasMore = rows.length > INITIAL_SAMPLE_VISIBLE;
  const visible = expanded || !hasMore ? rows : rows.slice(0, INITIAL_SAMPLE_VISIBLE);
  const remaining = rows.length - INITIAL_SAMPLE_VISIBLE;

  return (
    <section className={styles.block} aria-label="Amostra de linhas">
      <div className={styles.blockHead}>
        <span className={styles.blockLabel}>Amostra de linhas ({rows.length})</span>
        <p className={styles.blockDesc}>Uma prévia das primeiras linhas processadas.</p>
      </div>
      <ul className={styles.sampleList}>
        {visible.map((r) => (
          <li key={r.line} className={styles.sampleItem}>
            <span
              className={`${styles.rowBadge} ${
                r.status === 'would_import'
                  ? styles.badgeOk
                  : r.status === 'blocked'
                    ? styles.badgeError
                    : styles.badgeWarn
              }`}
            >
              {ROW_STATUS_LABELS[r.status]}
            </span>
            <span className={styles.sampleLine}>Linha {r.line}</span>
            <span className={styles.chips}>
              <span className={styles.chip}>Contato: {contatoLabel(r.preview.contato)}</span>
              <span className={styles.chip}>CPF: {r.preview.has_cpf ? 'sim' : 'não'}</span>
              <span className={styles.chip}>
                Data nasc.: {r.preview.has_data_nascimento ? 'sim' : 'não'}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {hasMore ? (
        <button
          type="button"
          className={styles.expandBtn}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? (
            <>
              <ChevronUp size={14} aria-hidden="true" />
              Ocultar linhas
            </>
          ) : (
            <>
              <ChevronDown size={14} aria-hidden="true" />
              Ver mais linhas da amostra (+{remaining})
            </>
          )}
        </button>
      ) : null}
    </section>
  );
}

function IssueGroup({
  tone,
  title,
  totalCount,
  description,
  issues,
  sampleTruncated,
}: {
  tone: IssueGroupTone;
  title: string;
  totalCount: number;
  description: string;
  issues: DryRunIssue[];
  sampleTruncated: boolean;
}): JSX.Element | null {
  const [expanded, setExpanded] = useState(false);
  if (totalCount === 0 && issues.length === 0) return null;

  const hasMoreInSample = issues.length > INITIAL_ISSUES_VISIBLE;
  const visible =
    expanded || !hasMoreInSample ? issues : issues.slice(0, INITIAL_ISSUES_VISIBLE);
  const sampleSmallerThanTotal = sampleTruncated && totalCount > issues.length;

  const more = tone === 'error' ? 'erros' : tone === 'warning' ? 'avisos' : 'duplicados';
  const Icon = tone === 'error' ? XCircle : tone === 'warning' ? AlertTriangle : Copy;
  const itemClass =
    tone === 'error' ? styles.issueError : tone === 'warning' ? styles.issueWarn : styles.issueDup;
  const groupClass =
    tone === 'error'
      ? styles.group_error
      : tone === 'warning'
        ? styles.group_warning
        : styles.group_duplicate;

  return (
    <section className={`${styles.group} ${groupClass}`} aria-label={title}>
      <header className={styles.groupHeader}>
        <h6 className={styles.groupTitle}>
          <Icon size={15} aria-hidden="true" />
          {title} ({totalCount})
        </h6>
        <p className={styles.groupDesc}>{description}</p>
      </header>

      {issues.length === 0 ? (
        <p className={styles.groupNote}>
          {totalCount > 0
            ? `Existem ${totalCount} ${
                tone === 'error'
                  ? 'erros bloqueantes'
                  : tone === 'warning'
                    ? 'avisos'
                    : 'possíveis duplicados'
              } no arquivo, mas nenhum exemplo foi incluído nesta amostra.`
            : 'Nenhum item nesta categoria.'}
        </p>
      ) : (
        <>
          <ul className={styles.issueList}>
            {visible.map((iss, idx) => (
              <li key={`${iss.line}-${idx}`} className={itemClass}>
                <Icon size={14} aria-hidden="true" />
                <span>
                  {iss.severity === 'duplicate'
                    ? iss.message
                    : `Linha ${iss.line}: ${iss.message}`}
                </span>
              </li>
            ))}
          </ul>
          {hasMoreInSample ? (
            <button
              type="button"
              className={styles.expandBtn}
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
            >
              {expanded ? (
                <>
                  <ChevronUp size={14} aria-hidden="true" />
                  Ocultar {more}
                </>
              ) : (
                <>
                  <ChevronDown size={14} aria-hidden="true" />
                  Ver mais {more} (+{issues.length - INITIAL_ISSUES_VISIBLE})
                </>
              )}
            </button>
          ) : null}
          {sampleSmallerThanTotal ? (
            <p className={styles.groupNote}>
              Mostramos uma amostra. O arquivo tem mais ocorrências dessa categoria.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

function contatoLabel(c: ContactPresence): string {
  switch (c) {
    case 'email_telefone':
      return 'e-mail e telefone';
    case 'email':
      return 'e-mail';
    case 'telefone':
      return 'telefone';
    default:
      return 'nenhum';
  }
}
