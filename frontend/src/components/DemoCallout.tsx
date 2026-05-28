import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Sparkles, ShieldCheck, Lock, Presentation, ArrowRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { DemoMascot } from './DemoMascot';
import styles from './DemoCallout.module.css';

type Point = { title: string; desc: string; icon?: LucideIcon; mascot?: boolean };

const POINTS: Point[] = [
  {
    icon: Sparkles,
    title: 'Dados fictícios',
    desc: 'Uma clínica de exemplo, criada só para você explorar à vontade.',
  },
  {
    mascot: true,
    title: 'A Auri guia você',
    desc: 'Um tour passo a passo pelos principais módulos, em poucos minutos.',
  },
  {
    icon: ShieldCheck,
    title: 'Sem paciente real',
    desc: 'Nenhuma informação de paciente de verdade é usada na demonstração.',
  },
  {
    icon: Lock,
    title: 'Ações bloqueadas',
    desc: 'Alterações ficam bloqueadas para manter a demonstração sempre limpa.',
  },
];

export function DemoCallout(): JSX.Element {
  return (
    <section className="section section--surface" id="demo-guiada">
      <div className="section-inner">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <span className="eyebrow">Demonstração guiada</span>
          <h2 className="section-title">Conheça o sistema sem compromisso</h2>
          <p className="section-lead">
            Entre em uma clínica de exemplo e veja, na prática, como o ClinicBridge organiza o
            dia a dia. A Auri mostra cada área para você.
          </p>
        </motion.div>

        <ul className={styles.grid}>
          {POINTS.map((p, i) => {
            const Icon = p.icon;
            return (
              <motion.li
                key={p.title}
                className={styles.point}
                initial={{ opacity: 0, y: 22 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.45, delay: i * 0.06, ease: 'easeOut' }}
              >
                <span className={styles.pointIcon} aria-hidden="true">
                  {p.mascot ? <DemoMascot size={26} mood="happy" /> : Icon ? <Icon size={19} strokeWidth={1.8} /> : null}
                </span>
                <h3 className={styles.pointTitle}>{p.title}</h3>
                <p className={styles.pointDesc}>{p.desc}</p>
              </motion.li>
            );
          })}
        </ul>

        <div className={styles.ctaWrap}>
          <Link to="/demo" className={styles.cta}>
            <Presentation size={16} aria-hidden="true" />
            Ver demo guiada
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
