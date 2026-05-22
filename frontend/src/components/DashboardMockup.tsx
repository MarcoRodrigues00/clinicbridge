import { motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, Circle, Check, AlertCircle } from 'lucide-react';
import styles from './DashboardMockup.module.css';

const STEPS = [
  { label: 'Upload CSV/XLSX', state: 'done', badge: '1.4 MB' },
  { label: 'Mapeamento de colunas', state: 'done', badge: '8/8' },
  { label: 'Validação concluída', state: 'done', badge: '412 ok' },
  { label: 'Duplicados encontrados', state: 'active', badge: '3' },
  { label: 'Exportação CSV/XLSX', state: 'pending', badge: '' },
] as const;

const TABLE_ROWS = [
  { name: 'Ana S. Pereira', phone: '(11) 9****-2210', status: 'ok' },
  { name: 'João P. Almeida', phone: '(21) 9****-7733', status: 'dup' },
  { name: 'Maria L. Souza', phone: '(47) 9****-1184', status: 'ok' },
  { name: 'Carlos R. Lima', phone: '(31) 9****-0942', status: 'warn' },
];

const AUDIT = [
  { time: '14:02', text: 'Upload concluído por dono_clinica@demo' },
  { time: '14:03', text: 'Mapeamento aplicado · 8 colunas' },
  { time: '14:05', text: '3 duplicados marcados para revisão' },
  { time: '14:06', text: 'Exportação em fila · CSV + XLSX' },
];

function StepIcon({ state }: { state: (typeof STEPS)[number]['state'] }): JSX.Element {
  if (state === 'done') return <CheckCircle2 size={16} />;
  if (state === 'active') return <AlertTriangle size={16} />;
  return <Circle size={16} />;
}

export function DashboardMockup(): JSX.Element {
  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <div className={styles.dots} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className={styles.meta}>
          <span className={styles.title}>Migração #1247</span>
          <span className={styles.sub}>Em revisão · Clínica Dr. Lima · 415 registros</span>
        </div>
        <span className={styles.badge}>78%</span>
      </div>

      <ul className={styles.steps}>
        {STEPS.map((s) => (
          <li
            key={s.label}
            className={`${styles.step} ${
              s.state === 'done'
                ? styles.stepDone
                : s.state === 'active'
                  ? styles.stepActive
                  : styles.stepPending
            }`}
          >
            <StepIcon state={s.state} />
            <span>{s.label}</span>
            {s.badge ? <span className={styles.stepBadge}>{s.badge}</span> : null}
          </li>
        ))}
      </ul>

      <div className={styles.progressLabel}>
        <span>Progresso da migração</span>
        <strong>78%</strong>
      </div>
      <div className={styles.progressTrack}>
        <motion.div
          className={styles.progressBar}
          initial={{ width: 0 }}
          animate={{ width: '78%' }}
          transition={{ duration: 1.2, delay: 0.4, ease: 'easeOut' }}
        />
      </div>

      <div className={styles.table} role="table" aria-label="Amostra de registros migrados">
        <div className={styles.tableHead} role="row">
          <span role="columnheader">Nome</span>
          <span role="columnheader">Telefone</span>
          <span role="columnheader">Status</span>
        </div>
        {TABLE_ROWS.map((row) => (
          <div key={row.name} className={styles.tableRow} role="row">
            <span className={styles.cellName} role="cell">
              {row.name}
            </span>
            <span role="cell">{row.phone}</span>
            <span role="cell">
              {row.status === 'ok' && (
                <span className={styles.statusOk}>
                  <Check size={11} aria-hidden="true" /> válido
                </span>
              )}
              {row.status === 'warn' && (
                <span className={styles.statusWarn}>
                  <AlertCircle size={11} aria-hidden="true" /> revisar
                </span>
              )}
              {row.status === 'dup' && (
                <span className={styles.statusDup}>
                  <AlertTriangle size={11} aria-hidden="true" /> duplicado
                </span>
              )}
            </span>
          </div>
        ))}
      </div>

      <div className={styles.audit}>
        <div className={styles.auditTitle}>Audit log</div>
        <ul className={styles.auditList}>
          {AUDIT.map((a) => (
            <li key={a.time} className={styles.auditItem}>
              <span className={styles.auditDot} aria-hidden="true" />
              <span className={styles.auditTime}>{a.time}</span>
              <span>{a.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
