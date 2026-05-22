import { motion } from 'framer-motion';
import { Check, Circle } from 'lucide-react';
import styles from './Roadmap.module.css';

type SprintStatus = 'done' | 'now' | 'next';

type Sprint = {
  tag: string;
  status: SprintStatus;
  sprint: string;
  title: string;
  items: { label: string; done: boolean }[];
};

const ROADMAP: Sprint[] = [
  {
    tag: 'Concluído',
    status: 'done',
    sprint: 'Sprint 0',
    title: 'Fundação',
    items: [
      { label: 'Monorepo pnpm', done: true },
      { label: 'Backend Express + TS', done: true },
      { label: 'Frontend React + Vite', done: true },
      { label: 'Docker Compose · Postgres', done: true },
    ],
  },
  {
    tag: 'Em planejamento',
    status: 'now',
    sprint: 'Sprint 1',
    title: 'Autenticação e clínica',
    items: [
      { label: 'Cadastro com argon2', done: false },
      { label: 'Login com sessão/token', done: false },
      { label: 'Cadastro de clínica + LGPD', done: false },
      { label: 'Upload básico (skeleton)', done: false },
    ],
  },
  {
    tag: 'Previsto',
    status: 'next',
    sprint: 'Sprint 2',
    title: 'Migração e revisão',
    items: [
      { label: 'Parse CSV/XLSX em background', done: false },
      { label: 'Mapeamento de colunas', done: false },
      { label: 'Validação e duplicados', done: false },
      { label: 'Exportação limpa + relatório', done: false },
    ],
  },
  {
    tag: 'Previsto',
    status: 'next',
    sprint: 'Sprint 3',
    title: 'Segurança e auditoria',
    items: [
      { label: 'Audit logs append-only', done: false },
      { label: 'Hardening de upload (MIME, hash)', done: false },
      { label: 'Rate limit e headers', done: false },
      { label: 'Backup e restore testado', done: false },
    ],
  },
];

const STATUS_CLASS: Record<SprintStatus, string> = {
  done: styles.statusDone,
  now: styles.statusNow,
  next: styles.statusNext,
};

export function Roadmap(): JSX.Element {
  return (
    <section className="section" id="roadmap">
      <div className="section-inner">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <span className="eyebrow">Roadmap</span>
          <h2 className="section-title">Roadmap do MVP</h2>
          <p className="section-lead">
            Quatro sprints curtas para chegar a um produto vendável, sem prontuário clínico nem
            integrações complexas.
          </p>
        </motion.div>

        <ul className={styles.grid}>
          {ROADMAP.map((r, i) => (
            <motion.li
              key={r.sprint}
              className={styles.card}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: i * 0.08, ease: 'easeOut' }}
            >
              <span className={`${styles.tag} ${STATUS_CLASS[r.status]}`}>{r.tag}</span>
              <div className={styles.sprint}>{r.sprint}</div>
              <h3 className={styles.title}>{r.title}</h3>
              <ul className={styles.items}>
                {r.items.map((item) => (
                  <li
                    key={item.label}
                    className={`${styles.item} ${item.done ? styles.itemDone : ''}`}
                  >
                    {item.done ? <Check size={14} strokeWidth={2.5} /> : <Circle size={12} />}
                    <span>{item.label}</span>
                  </li>
                ))}
              </ul>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}
