import { useEffect, useRef, useState } from 'react';
import { Lock, X } from 'lucide-react';
import { DEMO_BLOCKED_EVENT, DEMO_BLOCKED_MESSAGE } from '../services/demoMode';
import styles from './DemoBlockedToast.module.css';

// Single global listener that surfaces the humanized message whenever a write is
// blocked in guided-demo mode (any panel, any action). Auto-dismisses; clicking
// another blocked action re-triggers it.
export function DemoBlockedToast(): JSX.Element | null {
  const [visible, setVisible] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    function onBlocked(): void {
      setVisible(true);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setVisible(false), 5000);
    }
    window.addEventListener(DEMO_BLOCKED_EVENT, onBlocked);
    return () => {
      window.removeEventListener(DEMO_BLOCKED_EVENT, onBlocked);
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      <div className={styles.toast}>
        <span className={styles.icon} aria-hidden="true">
          <Lock size={16} />
        </span>
        <p className={styles.text}>{DEMO_BLOCKED_MESSAGE}</p>
        <button
          type="button"
          className={styles.close}
          onClick={() => setVisible(false)}
          aria-label="Fechar aviso"
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
