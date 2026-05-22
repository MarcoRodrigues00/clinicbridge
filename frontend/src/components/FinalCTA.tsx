import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Play, FileSearch } from 'lucide-react';
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
          Quer sair do sistema antigo sem perder seus dados?
        </h2>
        <p className={styles.subtitle}>
          ClinicBridge começa pelo problema mais urgente: organizar a migração administrativa com
          segurança, revisão e exportação limpa.
        </p>
        <div className={styles.actions}>
          <a href="#produto" className={styles.btnPrimary} aria-label="Ver demonstração do produto">
            <Play size={16} aria-hidden="true" />
            Ver demonstração
          </a>
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
