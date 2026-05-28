import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Presentation, X } from 'lucide-react';
import { DemoMascot } from './DemoMascot';
import styles from './LandingAuriTeaser.module.css';

// Auri teaser (Sprint 5.0G.3): friendly invite on the public landing.
// Not a chat, not a modal. The real demo login only happens on /demo.
// When dismissed the teaser becomes a floating bubble the user can reopen.
const STORAGE_KEY = 'cb-auri-teaser-dismissed';

export function LandingAuriTeaser(): JSX.Element {
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const [bubble, setBubble] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      dismissed = false;
    }
    if (dismissed) {
      setBubble(true);
      return;
    }
    const t = window.setTimeout(() => setVisible(true), 1200);
    return () => window.clearTimeout(t);
  }, []);

  function dismiss(): void {
    setVisible(false);
    setBubble(true);
    try {
      sessionStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* sessionStorage unavailable — hide for this mount anyway */
    }
  }

  function reopen(): void {
    setBubble(false);
    setVisible(true);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignored */
    }
  }

  return (
    <>
      <AnimatePresence>
        {visible && (
          <motion.aside
            className={styles.teaser}
            role="complementary"
            aria-label="Convite para a demonstração guiada"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.93 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.96 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <button
              type="button"
              className={styles.close}
              onClick={dismiss}
              aria-label="Fechar convite"
            >
              <X size={16} aria-hidden="true" />
            </button>

            <span className={styles.avatar} aria-hidden="true">
              <span className={reduced ? styles.mascotStill : styles.mascotFloat}>
                <DemoMascot className={styles.mascot} mood="wave" animated={!reduced} />
              </span>
            </span>

            <div className={styles.body}>
              <p className={styles.greeting}>Oi, eu sou a Auri 👋</p>
              <p className={styles.text}>
                Quer ver o ClinicBridge funcionando com dados fictícios?
              </p>
              <div className={styles.actions}>
                <Link to="/demo" className={styles.cta} onClick={dismiss}>
                  <Presentation size={15} aria-hidden="true" />
                  Entrar na demo guiada
                </Link>
                <button type="button" className={styles.dismiss} onClick={dismiss}>
                  Agora não
                </button>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {bubble && (
          <motion.button
            type="button"
            className={styles.bubble}
            onClick={reopen}
            aria-label="Abrir convite da Auri"
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <DemoMascot
              className={styles.bubbleMascot}
              mood="happy"
              animated={!reduced}
              title="Abrir convite da Auri"
            />
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}
