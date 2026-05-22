import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Play, FileSearch } from 'lucide-react';
import { DashboardMockup } from './DashboardMockup';
import styles from './Hero.module.css';

export function Hero(): JSX.Element {
  const reduced = useReducedMotion();

  return (
    <section className={styles.hero} id="produto">
      <div className={styles.bg} aria-hidden="true" />
      <div className={styles.glow} aria-hidden="true" />

      <div className={styles.inner}>
        <motion.div
          className={styles.copy}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        >
          <span className="eyebrow">MVP em construção · Sprint 0</span>

          <h1 className={styles.title}>
            Migração segura de{' '}
            <span className={styles.titleAccent}>dados administrativos</span>{' '}
            para clínicas pequenas
          </h1>

          <p className={styles.subtitle}>
            Organize pacientes, contatos e agendas exportados de sistemas antigos em poucos
            passos, com revisão, auditoria e exportação limpa.
          </p>

          <div className={styles.actions}>
            <a href="#produto" className={styles.btnPrimary}>
              <Play size={16} aria-hidden="true" />
              Ver demonstração
            </a>
            <Link to="/register" className={styles.btnGhost}>
              <FileSearch size={16} aria-hidden="true" />
              Analisar arquivo
            </Link>
          </div>

          <div className={styles.stats} role="list">
            <div role="listitem">
              <span className={styles.statValue}>CSV · XLSX</span>
              Formatos suportados
            </div>
            <div role="listitem">
              <span className={styles.statValue}>Multi-tenant</span>
              Isolamento por clínica
            </div>
            <div role="listitem">
              <span className={styles.statValue}>LGPD</span>
              Privacidade desde o desenho
            </div>
          </div>
        </motion.div>

        <motion.div
          className={styles.floatWrap}
          initial={{ opacity: 0, y: 32, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.15, ease: 'easeOut' }}
        >
          <motion.div
            animate={reduced ? undefined : { y: [0, -6, 0] }}
            transition={{ duration: 6.5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
          >
            <DashboardMockup />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
