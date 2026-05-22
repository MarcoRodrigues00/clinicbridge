import { motion } from 'framer-motion';
import { Layers, Lock, ScrollText, ShieldCheck } from 'lucide-react';
import styles from './Security.module.css';

const ITEMS = [
  {
    icon: Layers,
    label: 'Multi-tenant por clínica',
    desc: 'Cada clínica acessa apenas os próprios dados. O sistema isola tudo por clínica desde o cadastro inicial.',
    tags: ['Por clínica', 'Acesso isolado'],
  },
  {
    icon: Lock,
    label: 'Upload seguro',
    desc: 'Arquivos enviados passam por validação antes do processamento. Só aceitamos CSV e XLSX, com limite de tamanho e checagem de integridade.',
    tags: ['CSV/XLSX', 'Validação'],
  },
  {
    icon: ScrollText,
    label: 'Logs de auditoria',
    desc: 'Ações importantes ficam registradas para auditoria. Login, upload, exportação e exclusão entram em um registro que não pode ser alterado.',
    tags: ['Registro imutável'],
  },
  {
    icon: ShieldCheck,
    label: 'LGPD e exclusão',
    desc: 'A clínica pode solicitar exportação ou exclusão dos dados a qualquer momento, com aceite explícito dos termos no cadastro.',
    tags: ['Consentimento', 'Exclusão'],
  },
];

export function Security(): JSX.Element {
  return (
    <section className={`section section--surface ${styles.wrap}`} id="seguranca">
      <div className="section-inner">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <span className="eyebrow">Segurança</span>
          <h2 className="section-title">Segurança desde o desenho</h2>
          <p className="section-lead">
            Controles aplicados desde a arquitetura — não como remendo. Princípios CIAA, modelagem
            STRIDE e LGPD orientam cada decisão.
          </p>
          <p className={styles.scopeNote}>
            O MVP é focado em dados administrativos. Não armazena prontuário, diagnóstico ou
            prescrição.
          </p>
        </motion.div>

        <ul className={styles.grid}>
          {ITEMS.map((it, i) => {
            const Icon = it.icon;
            return (
              <motion.li
                key={it.label}
                className={styles.card}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.5, delay: i * 0.08, ease: 'easeOut' }}
              >
                <div className={styles.icon}>
                  <Icon size={20} strokeWidth={1.8} />
                </div>
                <h3 className={styles.label}>{it.label}</h3>
                <p className={styles.desc}>{it.desc}</p>
                <div className={styles.tags}>
                  {it.tags.map((t) => (
                    <span key={t} className={styles.tag}>
                      {t}
                    </span>
                  ))}
                </div>
              </motion.li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
