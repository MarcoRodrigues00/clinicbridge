import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { UserPlus, FileSearch } from 'lucide-react';
import styles from './FinalCTA.module.css';

export function FinalCTA(): JSX.Element {
  return (
    <section className={`section ${styles.wrap}`} id="comecar">
      <motion.div
        className={`section-inner ${styles.inner}`}
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <span className="eyebrow">Comece pelo essencial</span>
        <h2 className={styles.title}>
          Comece a organizar sua clínica hoje
        </h2>
        <p className={styles.subtitle}>
          Crie sua conta e comece pelo que faz mais sentido para a sua rotina — a plataforma
          cresce junto com a clínica.
        </p>
        <div className={styles.actions}>
          <Link
            to="/register"
            className={styles.btnPrimary}
            aria-label="Criar conta no ClinicBridge"
          >
            <UserPlus size={16} aria-hidden="true" />
            Criar conta
          </Link>
          <Link
            to="/register"
            className={styles.btnGhost}
            aria-label="Preparar arquivo de teste para análise"
          >
            <FileSearch size={16} aria-hidden="true" />
            Preparar arquivo de teste
          </Link>
        </div>
      </motion.div>
    </section>
  );
}
