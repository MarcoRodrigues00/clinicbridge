import { motion } from 'framer-motion';
import { UploadCloud, Columns3, WandSparkles, BarChart3 } from 'lucide-react';
import styles from './HowItWorks.module.css';

const STEPS = [
  {
    icon: UploadCloud,
    label: 'Importe ou cadastre seus dados',
    desc: 'Comece pelo upload do arquivo antigo ou cadastre diretamente. Pacientes, duplicados e campos incompletos são identificados antes de salvar.',
  },
  {
    icon: Columns3,
    label: 'Organize a agenda e os pacientes',
    desc: 'Agende consultas por profissional e serviço, mantenha os pacientes organizados e a equipe com acesso certo para cada função.',
  },
  {
    icon: WandSparkles,
    label: 'Registre cobranças e convênios',
    desc: 'Lance cobranças, marque recebimentos, cadastre convênios aceitos e controle os materiais e insumos da clínica.',
  },
  {
    icon: BarChart3,
    label: 'Acompanhe relatórios e estoque',
    desc: 'Veja resumos de agenda, recebimentos e pacientes por período. Estoque com alertas de quantidade baixa.',
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
          <h2 className="section-title">Do arquivo antigo à clínica organizada</h2>
          <p className="section-lead">
            Quatro passos que cabem na rotina de qualquer consultório — do arquivo antigo
            à operação do dia a dia, sem precisar trocar de sistema.
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
