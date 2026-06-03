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
    title: 'Migração e pacientes',
    items: [
      'Importação CSV/XLSX',
      'Mapeamento, validação e duplicados',
      'Exportação limpa',
    ],
  },
  {
    title: 'Agenda e serviços',
    items: [
      'Agendamentos por dia e profissional',
      'Catálogo de serviços da clínica',
      'Convênios e carteirinhas de planos',
    ],
  },
  {
    title: 'Financeiro e operações',
    items: [
      'Cobranças e recebimentos',
      'Relatórios gerenciais por período',
      'Controle de estoque e insumos',
    ],
  },
  {
    title: 'Clínica e governança',
    items: [
      'Prontuário e documentos',
      'MFA, papéis e auditoria LGPD',
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
          <span className="eyebrow">O que está incluído</span>
          <h2 className="section-title">Tudo que você precisa para tocar a clínica</h2>
          <p className="section-lead">
            Pacientes, agenda, financeiro, convênios, estoque e documentos — em uma plataforma
            só, com acesso por perfil e dados protegidos.
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
