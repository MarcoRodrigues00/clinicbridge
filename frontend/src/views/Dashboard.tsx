import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LogOut,
  UploadCloud,
  ShieldCheck,
  ListChecks,
  CheckCircle2,
  Clock,
  Home,
  Users,
  CalendarDays,
} from 'lucide-react';
import { Logo } from '../components/Logo';
import { UploadPanel } from '../components/UploadPanel';
import { ImportSessionsList } from '../components/ImportSessionsList';
import { PatientsList } from '../components/PatientsList';
import { DuplicatesList } from '../components/DuplicatesList';
import { ImportFileRetentionPanel } from '../components/ImportFileRetentionPanel';
import { ClinicProfessionalsPanel } from '../components/ClinicProfessionalsPanel';
import { AdministrativeSchedulePanel } from '../components/AdministrativeSchedulePanel';
import { MfaSettings } from '../components/MfaSettings';
import { useAuth } from '../services/AuthProvider';
import type { SafeUser } from '../services/api';
import styles from './Dashboard.module.css';

const ROLE_LABELS: Record<SafeUser['papel'], string> = {
  admin_sistema: 'Administrador do sistema',
  dono_clinica: 'Dono(a) da clínica',
  secretaria: 'Secretaria',
};

type TabKey = 'inicio' | 'importacoes' | 'pacientes' | 'agenda' | 'seguranca';

const TABS: { key: TabKey; label: string; icon: typeof Home }[] = [
  { key: 'inicio', label: 'Início', icon: Home },
  { key: 'importacoes', label: 'Importações', icon: UploadCloud },
  { key: 'pacientes', label: 'Pacientes', icon: Users },
  { key: 'agenda', label: 'Agenda', icon: CalendarDays },
  { key: 'seguranca', label: 'Segurança', icon: ShieldCheck },
];

const SECTION_INTRO: Record<TabKey, { title: string; subtitle: string }> = {
  inicio: { title: 'Visão geral', subtitle: 'Resumo da sua conta e do que já está disponível no ClinicBridge.' },
  importacoes: { title: 'Importações', subtitle: 'Envie, valide e revise migrações de dados administrativos.' },
  pacientes: { title: 'Pacientes', subtitle: 'Pacientes administrativos importados, duplicados e exportações.' },
  agenda: { title: 'Agenda administrativa', subtitle: 'Profissionais e agendamentos. Não é prontuário nem dado clínico.' },
  seguranca: { title: 'Segurança e sessão', subtitle: 'Estado da autenticação e do MVP administrativo.' },
};

export function Dashboard(): JSX.Element {
  const navigate = useNavigate();
  const { user, clinic, logout, refreshMe } = useAuth();
  const [sessionsRefresh, setSessionsRefresh] = useState(0);
  // Shared counter so the patient list and the duplicates panel reload each other
  // after a create/edit/archive/restore (Sprint 3.22/3.23).
  const [patientsRefresh, setPatientsRefresh] = useState(0);
  const [tab, setTab] = useState<TabKey>('inicio');

  // Sprint 3.1: only the clinic owner can run sensitive administrative actions.
  const isOwner = user?.papel === 'dono_clinica';

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  function handleLogout(): void {
    logout();
    navigate('/login', { replace: true });
  }

  const intro = SECTION_INTRO[tab];

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <span className={styles.brand}>
          <Logo size={30} />
          ClinicBridge
        </span>
        <button type="button" className={styles.logout} onClick={handleLogout}>
          <LogOut size={18} aria-hidden="true" />
          Sair
        </button>
      </header>

      <main className={styles.main}>
        <section className={styles.hero}>
          <span className={styles.statusPill}>
            <ShieldCheck size={16} aria-hidden="true" />
            Sessão ativa
          </span>
          <h1 className={styles.greeting}>Olá, {user?.nome ?? 'usuário'}.</h1>
          <p className={styles.heroClinic}>{clinic?.nome ?? 'Sua clínica'}</p>
        </section>

        <nav className={styles.nav} aria-label="Seções do app">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                className={`${styles.navItem} ${active ? styles.navItemActive : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={() => setTab(t.key)}
              >
                <Icon size={17} aria-hidden="true" />
                {t.label}
              </button>
            );
          })}
        </nav>

        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>{intro.title}</h2>
          <p className={styles.sectionSubtitle}>{intro.subtitle}</p>
        </div>

        {tab === 'inicio' && (
          <>
            <div className={styles.identity}>
              <div className={styles.identityItem}>
                <span className={styles.identityLabel}>E-mail</span>
                <span className={styles.identityValue}>{user?.email ?? '—'}</span>
              </div>
              <div className={styles.identityItem}>
                <span className={styles.identityLabel}>Papel</span>
                <span className={styles.identityValue}>{user ? ROLE_LABELS[user.papel] : '—'}</span>
              </div>
              <div className={styles.identityItem}>
                <span className={styles.identityLabel}>Clínica</span>
                <span className={styles.identityValue}>{clinic?.nome ?? '—'}</span>
              </div>
            </div>

            <div className={styles.grid}>
              <section className={styles.card}>
                <span className={`${styles.cardBadge} ${styles.cardBadgeOk}`}>
                  <ShieldCheck size={14} aria-hidden="true" />
                  Ativo
                </span>
                <h3 className={styles.cardTitle}>Bem-vindo(a) ao ClinicBridge</h3>
                <p className={styles.cardText}>
                  Use a navegação acima: <strong>Importações</strong> para migrar dados,
                  <strong> Pacientes</strong> para revisar e exportar, e <strong>Agenda</strong>
                  {' '}para os agendamentos administrativos da clínica.
                </p>
              </section>
            </div>
          </>
        )}

        {tab === 'importacoes' && (
          <>
            <UploadPanel onSessionSaved={() => setSessionsRefresh((n) => n + 1)} />
            <ImportSessionsList refreshKey={sessionsRefresh} />
            {isOwner && <ImportFileRetentionPanel />}
          </>
        )}

        {tab === 'pacientes' && (
          <>
            <PatientsList
              refreshKey={patientsRefresh}
              onPatientsChanged={() => setPatientsRefresh((n) => n + 1)}
            />
            <DuplicatesList
              refreshKey={patientsRefresh}
              onPatientsChanged={() => setPatientsRefresh((n) => n + 1)}
            />
          </>
        )}

        {tab === 'agenda' && (
          <>
            <ClinicProfessionalsPanel />
            <AdministrativeSchedulePanel />
          </>
        )}

        {tab === 'seguranca' && (
          <>
          <MfaSettings />
          <div className={styles.grid}>
            <section className={styles.card}>
              <span className={`${styles.cardBadge} ${styles.cardBadgeOk}`}>
                <ShieldCheck size={14} aria-hidden="true" />
                Ativo
              </span>
              <h3 className={styles.cardTitle}>Autenticação e sessão</h3>
              <p className={styles.cardText}>
                O ClinicBridge valida autenticação e sessão com isolamento por clínica
                (multi-tenant) em todas as áreas administrativas.
              </p>
            </section>

            <section className={styles.card}>
              <span className={`${styles.cardBadge} ${styles.cardBadgeInfo}`}>
                <ListChecks size={14} aria-hidden="true" />
                Resumo
              </span>
              <h3 className={styles.cardTitle}>Checklist do MVP</h3>
              <ul className={styles.checklist}>
                <li className={styles.checkItem}>
                  <CheckCircle2 size={18} className={styles.iconDone} aria-hidden="true" />
                  <span>Autenticação, MFA e códigos de recuperação</span>
                </li>
                <li className={styles.checkItem}>
                  <CheckCircle2 size={18} className={styles.iconDone} aria-hidden="true" />
                  <span>Importação CSV/XLSX e pacientes</span>
                </li>
                <li className={styles.checkItem}>
                  <CheckCircle2 size={18} className={styles.iconDone} aria-hidden="true" />
                  <span>Agenda administrativa e lembrete manual</span>
                </li>
                <li className={styles.checkItem}>
                  <Clock size={18} className={styles.iconPending} aria-hidden="true" />
                  <span>Preparação para produção (em andamento)</span>
                </li>
              </ul>
            </section>
          </div>
          </>
        )}
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <span className={styles.footerBrand}>
            <Logo size={20} />
            ClinicBridge · MVP administrativo
          </span>
          <p className={styles.footerNote}>
            Ferramenta administrativa. Não substitui prontuário ou sistema clínico.
          </p>
          <nav className={styles.footerLinks} aria-label="Links">
            <span>Segurança</span>
            <span>Privacidade</span>
            <span>Suporte</span>
            <span>Roadmap</span>
          </nav>
        </div>
      </footer>
    </div>
  );
}
