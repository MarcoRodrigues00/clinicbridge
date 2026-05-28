import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Presentation, ArrowRight } from 'lucide-react';
import { Logo } from './Logo';
import styles from './Header.module.css';

type AnchorNavItem = { label: string; href: string };
type RouteNavItem  = { label: string; to: string };
type NavItem = AnchorNavItem | RouteNavItem;

const NAV_ITEMS: NavItem[] = [
  { label: 'Produto',        href: '#produto' },
  { label: 'Como funciona',  href: '#como-funciona' },
  { label: 'Funcionalidades', href: '#roadmap' },
  { label: 'Planos',         href: '#planos' },
  { label: 'Criar conta',    to: '/register' },
];

export function Header(): JSX.Element {
  return (
    <motion.header
      className={styles.header}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      <div className={styles.inner}>
        <a href="#top" className={styles.brand} aria-label="ClinicBridge — início">
          <Logo size={26} />
          <span>ClinicBridge</span>
        </a>

        <nav className={styles.nav} aria-label="Navegação principal">
          {NAV_ITEMS.map((item) =>
            'to' in item ? (
              <Link key={item.to} to={item.to}>
                {item.label}
              </Link>
            ) : (
              <a key={item.href} href={item.href}>
                {item.label}
              </a>
            ),
          )}
        </nav>

        <Link to="/demo" className={styles.cta} aria-label="Ver a demonstração guiada do ClinicBridge">
          <Presentation size={15} aria-hidden="true" />
          <span className={styles.ctaLong}>Ver demo guiada</span>
          <span className={styles.ctaShort} aria-hidden="true">
            Demo
          </span>
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
    </motion.header>
  );
}
