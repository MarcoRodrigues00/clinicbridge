import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Presentation, UserPlus, FileSearch } from 'lucide-react';
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
          <span className="eyebrow">Para clínicas e consultórios · piloto v0.1</span>

          <h1 className={styles.title}>
            Veja o ClinicBridge funcionando{' '}
            <span className={styles.titleAccent}>antes de criar sua clínica</span>
          </h1>

          <p className={styles.subtitle}>
            Entre em uma demonstração guiada com dados fictícios. A Auri mostra agenda,
            pacientes, financeiro, convênios, estoque, serviços e relatórios em poucos minutos.
          </p>

          <div className={styles.actions}>
            <Link to="/demo" className={styles.btnPrimary}>
              <Presentation size={16} aria-hidden="true" />
              Ver demo guiada
            </Link>
            <Link to="/register" className={styles.btnGhost}>
              <UserPlus size={16} aria-hidden="true" />
              Criar conta
            </Link>
          </div>

          <Link to="/register" className={styles.btnText}>
            <FileSearch size={14} aria-hidden="true" />
            Preparar arquivo de teste
          </Link>

          <div className={styles.stats} role="list">
            <div role="listitem">
              <span className={styles.statValue}>CSV · XLSX</span>
              Importação de dados
            </div>
            <div role="listitem">
              <span className={styles.statValue}>Por clínica</span>
              Dados separados
            </div>
            <div role="listitem">
              <span className={styles.statValue}>LGPD</span>
              Dados protegidos
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
