import { Logo } from './Logo';
import styles from './Footer.module.css';

export function Footer(): JSX.Element {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <Logo size={22} />
          ClinicBridge
        </div>
        <p className={styles.note}>
          ClinicBridge — sistema de gestão para clínicas e consultórios. Sistema em piloto.
          Funcionalidades clínicas e documentos estão em evolução. Assinatura digital válida,
          integrações oficiais e obrigações regulatórias específicas exigem etapas próprias.
        </p>
        <span className={styles.meta}>v0.1 · piloto</span>
      </div>
    </footer>
  );
}
