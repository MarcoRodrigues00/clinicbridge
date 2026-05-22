import { motion } from 'framer-motion';
import { UploadCloud, Columns3, WandSparkles, FileDown } from 'lucide-react';
import styles from './HowItWorks.module.css';

const STEPS = [
  {
    icon: UploadCloud,
    label: 'Envie o arquivo',
    desc: 'Faça upload do CSV ou XLSX exportado do sistema antigo. Limite, MIME e hash conferidos no servidor.',
  },
  {
    icon: Columns3,
    label: 'Revise o mapeamento',
    desc: 'O ClinicBridge sugere automaticamente quais colunas viraram nome, telefone, e-mail, CPF e convênio.',
  },
  {
    icon: WandSparkles,
    label: 'Corrija inconsistências',
    desc: 'Veja duplicados, formatos inválidos e campos incompletos. Corrija ou mescle direto na revisão.',
  },
  {
    icon: FileDown,
    label: 'Exporte os dados limpos',
    desc: 'Baixe CSV e XLSX prontos para importar, junto com um relatório de migração para a clínica.',
  },
];

export function HowItWorks(): JSX.Element {
  return (
    <section className="section" id="como-funciona">
      <div className="section-inner">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <span className="eyebrow">Como funciona</span>
          <h2 className="section-title">Do arquivo antigo à exportação limpa</h2>
          <p className="section-lead">
            Um fluxo curto que cabe na rotina da secretaria, com revisão humana antes de qualquer
            exportação.
          </p>
        </motion.div>

        <ul className={styles.grid}>
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <motion.li
                key={s.label}
                className={styles.step}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.5, delay: i * 0.08, ease: 'easeOut' }}
              >
                <span className={styles.number}>0{i + 1}</span>
                <div className={styles.icon}>
                  <Icon size={20} strokeWidth={1.8} />
                </div>
                <h3 className={styles.label}>{s.label}</h3>
                <p className={styles.desc}>{s.desc}</p>
              </motion.li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
