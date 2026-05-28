import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Check, ArrowRight } from 'lucide-react';
import styles from './PricingPlans.module.css';

type Plan = {
  name: string;
  tag?: string;
  desc: string;
  items: string[];
  cta: string;
  highlight?: boolean;
};

const PLANS: Plan[] = [
  {
    name: 'Essencial',
    desc: 'Para consultórios que querem organizar a rotina sem complicação.',
    items: [
      'Pacientes e agenda',
      'Serviços da clínica',
      'Cobranças básicas',
      'Relatórios simples',
    ],
    cta: 'Começar pelo Essencial',
  },
  {
    name: 'Profissional',
    tag: 'Mais completo',
    desc: 'Para clínicas que precisam de operação mais completa.',
    items: [
      'Tudo do Essencial',
      'Convênios e carteirinhas',
      'Estoque e insumos',
      'Documentos e auditoria',
      'Relatórios gerenciais',
    ],
    cta: 'Conhecer o Profissional',
    highlight: true,
  },
  {
    name: 'Piloto assistido',
    desc: 'Para clínicas que querem migrar dados com acompanhamento.',
    items: [
      'Importação CSV/XLSX',
      'Deduplicação',
      'Configuração inicial',
      'Treinamento da equipe',
      'Acompanhamento no início',
    ],
    cta: 'Começar piloto assistido',
  },
];

export function PricingPlans(): JSX.Element {
  return (
    <section className="section" id="planos">
      <div className="section-inner">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <span className="eyebrow">Planos</span>
          <h2 className="section-title">Escolha por onde começar</h2>
          <p className="section-lead">
            Comece pelo essencial e expanda conforme a clínica precisar. Preços e condições
            apresentados durante o piloto.
          </p>
        </motion.div>

        <ul className={styles.grid}>
          {PLANS.map((plan, i) => (
            <motion.li
              key={plan.name}
              className={`${styles.card} ${plan.highlight ? styles.cardHighlight : ''}`}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: i * 0.08, ease: 'easeOut' }}
            >
              {plan.tag && (
                <span className={styles.tag}>{plan.tag}</span>
              )}
              <h3 className={styles.name}>{plan.name}</h3>
              <p className={styles.desc}>{plan.desc}</p>
              <ul className={styles.items}>
                {plan.items.map((item) => (
                  <li key={item} className={styles.item}>
                    <Check size={13} strokeWidth={2.5} className={styles.itemIcon} aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <Link
                to="/register"
                className={`${styles.cta} ${plan.highlight ? styles.ctaHighlight : ''}`}
                aria-label={`${plan.cta} — ClinicBridge`}
              >
                {plan.cta}
              </Link>
              <Link
                to="/demo"
                className={styles.demoMini}
                aria-label={`Explorar o plano ${plan.name} na demonstração guiada`}
              >
                Ver na demo guiada
                <ArrowRight size={12} aria-hidden="true" />
              </Link>
            </motion.li>
          ))}
        </ul>

        <p className={styles.note}>
          Sob consulta durante o piloto. Nenhuma cobrança é feita automaticamente.
        </p>
      </div>
    </section>
  );
}
