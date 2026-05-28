import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Presentation, UserPlus } from 'lucide-react';
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
        <span className="eyebrow">Comece pela demonstração</span>
        <h2 className={styles.title}>
          Veja o ClinicBridge funcionando agora
        </h2>
        <p className={styles.subtitle}>
          Entre na demonstração guiada com dados fictícios e deixe a Auri te mostrar agenda,
          pacientes, financeiro e muito mais em poucos minutos. Quando quiser, crie sua conta.
        </p>
        <div className={styles.actions}>
          <Link
            to="/demo"
            className={styles.btnPrimary}
            aria-label="Ver a demonstração guiada do ClinicBridge"
          >
            <Presentation size={16} aria-hidden="true" />
            Ver demo guiada
          </Link>
          <Link
            to="/register"
            className={styles.btnGhost}
            aria-label="Criar conta no ClinicBridge"
          >
            <UserPlus size={16} aria-hidden="true" />
            Criar conta
          </Link>
        </div>
      </motion.div>
    </section>
  );
}
