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
          ClinicBridge — MVP focado em migração administrativa, não em prontuário clínico.
        </p>
        <span className={styles.meta}>Piloto administrativo · v0.1</span>
      </div>
    </footer>
  );
}
