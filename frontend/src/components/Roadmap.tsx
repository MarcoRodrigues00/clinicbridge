import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import styles from './Roadmap.module.css';

// Sprint 3.17: replaced the old internal "Sprint 0/1/2/3" roadmap (stale and
// confusing for a demo) with a product-oriented "what the pilot delivers" view.
// Honest framing: it's an administrative pilot — not production-ready, no full
// compliance claims, no clinical records.
type Capability = {
  title: string;
  items: string[];
};

const CAPABILITIES: Capability[] = [
  {
    title: 'Migração de dados',
    items: [
      'Importação de CSV/XLSX',
      'Mapeamento de colunas',
      'Validação e revisão',
    ],
  },
  {
    title: 'Pacientes administrativos',
    items: [
      'Listagem com busca',
      'Detecção de duplicados',
      'Exportação CSV/XLSX',
    ],
  },
  {
    title: 'Agenda administrativa',
    items: [
      'Profissionais da clínica',
      'Agendamentos por dia',
      'Confirmar, remarcar, concluir',
    ],
  },
  {
    title: 'Segurança e governança',
    items: [
      'Isolamento por clínica',
      'Papéis e auditoria',
      'Retenção e backup (local)',
    ],
  },
];

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
          <span className="eyebrow">Piloto</span>
          <h2 className="section-title">O que o ClinicBridge entrega no piloto</h2>
          <p className="section-lead">
            Uma versão piloto administrativa: migração, revisão e operação de dados
            administrativos com segurança desde o início — sem prontuário clínico nem
            integrações complexas.
          </p>
        </motion.div>

        <ul className={styles.grid}>
          {CAPABILITIES.map((c, i) => (
            <motion.li
              key={c.title}
              className={styles.card}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: i * 0.08, ease: 'easeOut' }}
            >
              <h3 className={styles.title}>{c.title}</h3>
              <ul className={styles.items}>
                {c.items.map((item) => (
                  <li key={item} className={`${styles.item} ${styles.itemDone}`}>
                    <Check size={14} strokeWidth={2.5} />
                    <span>{item}</span>
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
