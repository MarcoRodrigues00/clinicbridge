import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ClipboardCheck, BellRing } from 'lucide-react';
import styles from './Validation.module.css';

export function Validation(): JSX.Element {
  return (
    <section className="section" id="valide">
      <div className="section-inner">
        <motion.div
          className={styles.panel}
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <div className={styles.content}>
            <span className="eyebrow">Análise prévia</span>
            <h2 className={styles.title}>
              Valide sua migração antes do MVP completo
            </h2>
            <p className={styles.desc}>
              Envie um arquivo de exemplo para uma análise inicial de qualidade dos dados,
              duplicados e campos incompletos.
            </p>
          </div>

          <div className={styles.actions}>
            <Link
              to="/register"
              className={styles.btnPrimary}
              aria-label="Solicitar análise prévia do arquivo"
            >
              <ClipboardCheck size={16} aria-hidden="true" />
              Solicitar análise
            </Link>
            <Link
              to="/register"
              className={styles.btnGhost}
              aria-label="Entrar na lista de espera do ClinicBridge"
            >
              <BellRing size={16} aria-hidden="true" />
              Entrar na lista de espera
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
