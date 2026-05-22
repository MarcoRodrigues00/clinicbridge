import { useState } from 'react';
import {
  ListChecks,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  Copy,
  ChevronDown,
  ChevronUp,
  MinusCircle,
  type LucideIcon,
} from 'lucide-react';
import type { FieldStat, ImportValidationReport, ValidationIssue } from '../services/api';
import styles from './ValidationReport.module.css';

const INITIAL_VISIBLE = 10;

type CardTone = 'neutral' | 'ok' | 'warn' | 'error' | 'info';

type FieldKey = 'nome' | 'telefone' | 'email' | 'cpf' | 'data_nascimento';

const FIELD_LABELS: Array<{ key: FieldKey; label: string }> = [
  { key: 'nome', label: 'Nome' },
  { key: 'telefone', label: 'Telefone' },
  { key: 'email', label: 'E-mail' },
  { key: 'cpf', label: 'CPF' },
  { key: 'data_nascimento', label: 'Data de nascimento' },
];

type FieldTone = 'ok' | 'warn' | 'attention' | 'none';

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function fieldStatus(stat: FieldStat | undefined): {
  tone: FieldTone;
  status: string;
  text: string;
  icon: LucideIcon;
} {
  if (!stat || stat.mapped_column === null) {
    return {
      tone: 'none',
      status: 'Não mapeado',
      text: 'Este campo não foi ligado a uma coluna.',
      icon: MinusCircle,
    };
  }
  if (stat.invalid > 0) {
    return {
      tone: 'warn',
      status: 'Revisar',
      text: 'Há formatos que merecem revisão.',
      icon: AlertTriangle,
    };
  }
  if (stat.empty > 0) {
    return {
      tone: 'attention',
      status: 'Atenção',
      text: 'Há campos não informados.',
      icon: Info,
    };
  }
  return {
    tone: 'ok',
    status: 'OK',
    text: 'Sem problemas encontrados nas linhas analisadas.',
    icon: CheckCircle2,
  };
}

function FieldQuality({
  fields,
}: {
  fields: ImportValidationReport['field_stats'];
}): JSX.Element {
  return (
    <div className={styles.fieldSection}>
      <h6 className={styles.fieldSectionTitle}>Qualidade por campo</h6>
      <p className={styles.fieldSectionSub}>
        Veja quais informações tiveram mais campos vazios ou formatos que merecem revisão.
      </p>
      <div className={styles.fieldGrid}>
        {FIELD_LABELS.map(({ key, label }) => {
          const stat = fields[key];
          const { tone, status, text, icon: Icon } = fieldStatus(stat);
          const mapped = stat?.mapped_column ?? null;
          return (
            <div key={key} className={`${styles.fieldCard} ${styles[`field_${tone}`]}`}>
              <div className={styles.fieldHead}>
                <span className={styles.fieldName}>{label}</span>
                <span className={`${styles.fieldBadge} ${styles[`badge_${tone}`]}`}>
                  <Icon size={13} aria-hidden="true" />
                  {status}
                </span>
              </div>
              <span className={styles.fieldColumn}>
                {mapped ? `Coluna: ${mapped}` : 'Sem coluna ligada'}
              </span>
              {stat && mapped ? (
                <span className={styles.fieldCounts}>
                  {plural(stat.empty, 'vazio', 'vazios')} ·{' '}
                  {plural(stat.invalid, 'inválido', 'inválidos')}
                </span>
              ) : null}
              <span className={styles.fieldText}>{text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: LucideIcon;
  value: number;
  label: string;
  tone: CardTone;
}): JSX.Element {
  return (
    <div className={`${styles.card} ${styles[`card_${tone}`]}`}>
      <Icon size={18} aria-hidden="true" />
      <span className={styles.cardValue}>{value}</span>
      <span className={styles.cardLabel}>{label}</span>
    </div>
  );
}

function IssueGroup({
  title,
  explanation,
  issues,
  tone,
  noun,
  withLinePrefix,
}: {
  title: string;
  explanation: string;
  issues: ValidationIssue[];
  tone: 'error' | 'warn' | 'dup';
  noun: string;
  withLinePrefix: boolean;
}): JSX.Element | null {
  const [showAll, setShowAll] = useState(false);
  if (issues.length === 0) return null;

  const visible = showAll ? issues : issues.slice(0, INITIAL_VISIBLE);
  const extra = issues.length - INITIAL_VISIBLE;
  const Icon = tone === 'error' ? XCircle : tone === 'warn' ? AlertTriangle : Info;
  const itemClass =
    tone === 'error' ? styles.itemError : tone === 'warn' ? styles.itemWarn : styles.itemDup;

  return (
    <div className={styles.group}>
      <div className={styles.groupHead}>
        <span className={`${styles.groupTitle} ${styles[`title_${tone}`]}`}>
          {title}
          <span className={styles.countBadge}>{issues.length}</span>
        </span>
      </div>
      <p className={styles.groupExplain}>{explanation}</p>
      <ul className={styles.issueList}>
        {visible.map((iss, idx) => (
          <li key={`${tone}-${idx}`} className={itemClass}>
            <Icon size={14} aria-hidden="true" />
            <span>{withLinePrefix ? `Linha ${iss.line}: ${iss.message}` : iss.message}</span>
          </li>
        ))}
      </ul>
      {extra > 0 ? (
        <button type="button" className={styles.toggle} onClick={() => setShowAll((v) => !v)}>
          {showAll ? (
            <>
              <ChevronUp size={15} aria-hidden="true" />
              Ocultar {noun}
            </>
          ) : (
            <>
              <ChevronDown size={15} aria-hidden="true" />
              Ver mais {noun} (+{extra})
            </>
          )}
        </button>
      ) : null}
    </div>
  );
}

export function ValidationReport({ report }: { report: ImportValidationReport }): JSX.Element {
  const s = report.summary;
  const errors = report.issues.filter((i) => i.severity === 'error');
  const warns = report.issues.filter((i) => i.severity === 'warning');
  const dups = report.issues.filter((i) => i.severity === 'duplicate');

  const hasErrors = s.rows_with_errors > 0;
  const hasWarnings = s.rows_with_warnings > 0;
  const hasDuplicates = s.duplicate_groups > 0;

  // Friendly, structured messaging derived from flags — we don't echo the raw
  // backend "limited/truncated" warning strings (we reword them here). Any other
  // warning (e.g. multiple sheets) is still surfaced verbatim.
  const otherWarnings = s.warnings.filter(
    (w) =>
      !/^A validação analisou apenas as primeiras \d+ linhas/.test(w) &&
      !/^Há mais problemas do que os exibidos/.test(w) &&
      !/^O relatório encontrou mais pontos de atenção/.test(w),
  );

  return (
    <div className={styles.report}>
      <h5 className={styles.title}>Relatório de validação do arquivo completo</h5>
      <p className={styles.subtitle}>
        O ClinicBridge analisou o arquivo até o limite configurado e gerou este resumo de
        qualidade. Esta etapa ainda não importa dados.
      </p>

      <div className={styles.cards}>
        <SummaryCard icon={ListChecks} value={s.total_rows_analyzed} label="Linhas analisadas" tone="neutral" />
        <SummaryCard icon={CheckCircle2} value={s.valid_rows} label="Linhas válidas" tone="ok" />
        <SummaryCard icon={AlertTriangle} value={s.rows_with_warnings} label="Com avisos" tone="warn" />
        <SummaryCard icon={XCircle} value={s.rows_with_errors} label="Com erros" tone={hasErrors ? 'error' : 'neutral'} />
        <SummaryCard icon={Copy} value={s.duplicate_groups} label="Possíveis duplicados" tone="info" />
      </div>

      <div className={styles.interpret}>
        {hasErrors ? (
          <p className={styles.interpretError}>
            <XCircle size={15} aria-hidden="true" />
            Foram encontrados erros que precisam ser corrigidos antes de qualquer importação.
          </p>
        ) : (
          <p className={styles.interpretOk}>
            <CheckCircle2 size={15} aria-hidden="true" />
            Bom sinal: nenhum erro bloqueante foi encontrado nas linhas analisadas.
          </p>
        )}
        {hasWarnings ? (
          <p className={styles.interpretWarn}>
            <AlertTriangle size={15} aria-hidden="true" />
            Existem avisos que merecem conferência, mas não significam necessariamente que o
            arquivo está inválido. Revise os avisos antes de continuar.
          </p>
        ) : null}
        {hasDuplicates ? (
          <p className={styles.interpretInfo}>
            <Info size={15} aria-hidden="true" />
            Possíveis duplicados podem indicar cadastros repetidos ou contatos compartilhados.
            Revise antes de importar.
          </p>
        ) : null}
        <p className={styles.interpretMuted}>
          <Info size={15} aria-hidden="true" />
          Nenhum dado foi importado ainda.
        </p>
      </div>

      {s.validation_limited ? (
        <div className={styles.banner}>
          <AlertTriangle size={15} aria-hidden="true" />
          <span>
            Este arquivo ultrapassou o limite configurado. Apenas as primeiras{' '}
            {s.total_rows_analyzed} linhas foram analisadas.
          </span>
        </div>
      ) : null}

      {s.issues_truncated ? (
        <div className={styles.banner}>
          <Info size={15} aria-hidden="true" />
          <span>
            O relatório completo encontrou mais pontos de atenção do que os exibidos aqui. Para
            manter a tela legível, mostramos uma amostra com erros, avisos e possíveis duplicados
            quando disponíveis.
          </span>
        </div>
      ) : null}

      {otherWarnings.map((w) => (
        <div key={w} className={styles.banner}>
          <AlertTriangle size={15} aria-hidden="true" />
          <span>{w}</span>
        </div>
      ))}

      <FieldQuality fields={report.field_stats} />

      {!hasErrors && !hasWarnings && !hasDuplicates ? (
        <p className={styles.clean}>
          <CheckCircle2 size={16} aria-hidden="true" />
          Nenhum ponto de atenção encontrado nas linhas analisadas.
        </p>
      ) : (
        <>
          <IssueGroup
            title="Erros"
            explanation="Erros são pontos que podem impedir a importação correta."
            issues={errors}
            tone="error"
            noun="erros"
            withLinePrefix
          />
          <IssueGroup
            title="Avisos"
            explanation="Avisos indicam dados que merecem revisão, mas nem sempre bloqueiam o uso."
            issues={warns}
            tone="warn"
            noun="avisos"
            withLinePrefix
          />
          <IssueGroup
            title="Possíveis duplicados"
            explanation="Possíveis duplicados indicam registros parecidos ou repetidos. Eles precisam ser revisados antes de importar."
            issues={dups}
            tone="dup"
            noun="duplicados"
            withLinePrefix={false}
          />
        </>
      )}
    </div>
  );
}
