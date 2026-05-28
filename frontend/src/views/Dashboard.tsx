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
  Wallet,
  BarChart3,
  Briefcase,
  HeartHandshake,
  Boxes,
  RotateCcw,
  CreditCard,
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
import { JoinClinicGate } from '../components/JoinClinicGate';
import { TeamManagementPanel } from '../components/TeamManagementPanel';
import { ClinicalRolesPanel } from '../components/ClinicalRolesPanel';
import { ClinicalReadAuditPanel } from '../components/ClinicalReadAuditPanel';
import { FinancialPanel } from '../components/FinancialPanel';
import { ReportsPanel } from '../components/ReportsPanel';
import { ServicesPanel } from '../components/ServicesPanel';
import { InsurancePanel } from '../components/InsurancePanel';
import { InventoryPanel } from '../components/InventoryPanel';
import { SubscriptionPanel } from '../components/SubscriptionPanel';
import { GuidedDemoTour, DEMO_TOUR_STEPS } from '../components/GuidedDemoTour';
import { DemoBlockedToast } from '../components/DemoBlockedToast';
import { DemoMascot } from '../components/DemoMascot';
import { useAuth } from '../services/AuthProvider';
import type { SafeUser } from '../services/api';
import styles from './Dashboard.module.css';

// Sprint 3.24.1: rótulos do papel são "produto-facing". A role técnica continua
// sendo `secretaria` no JWT/DB; a UI mostra um nome neutro (funcionário(a) com
// acesso administrativo) para não amarrar o produto a uma profissão específica.
const ROLE_LABELS: Record<SafeUser['papel'], string> = {
  admin_sistema: 'Administrador do sistema',
  dono_clinica: 'Dono(a) da clínica',
  secretaria: 'Funcionário(a) (acesso administrativo)',
};

type TabKey = 'inicio' | 'importacoes' | 'pacientes' | 'agenda' | 'financeiro' | 'relatorios' | 'servicos' | 'convenios' | 'estoque' | 'equipe' | 'seguranca' | 'assinatura';

const TABS: { key: TabKey; label: string; icon: typeof Home; ownerOnly?: boolean }[] = [
  { key: 'inicio', label: 'Início', icon: Home },
  { key: 'importacoes', label: 'Importações', icon: UploadCloud },
  { key: 'pacientes', label: 'Pacientes', icon: Users },
  { key: 'agenda', label: 'Agenda', icon: CalendarDays },
  { key: 'financeiro', label: 'Financeiro', icon: Wallet },
  { key: 'relatorios', label: 'Relatórios', icon: BarChart3 },
  { key: 'servicos', label: 'Serviços', icon: Briefcase },
  { key: 'convenios', label: 'Convênios', icon: HeartHandshake },
  { key: 'estoque', label: 'Estoque', icon: Boxes },
  { key: 'equipe', label: 'Equipe', icon: Users, ownerOnly: true },
  { key: 'seguranca', label: 'Segurança', icon: ShieldCheck },
  { key: 'assinatura', label: 'Assinatura', icon: CreditCard },
];

const SECTION_INTRO: Record<TabKey, { title: string; subtitle: string }> = {
  inicio: { title: 'Visão geral', subtitle: 'Resumo da sua conta e do que já está disponível no ClinicBridge.' },
  importacoes: { title: 'Importações', subtitle: 'Envie, valide e revise migrações de dados administrativos.' },
  pacientes: { title: 'Pacientes', subtitle: 'Pacientes administrativos importados, duplicados e exportações.' },
  agenda: { title: 'Agenda administrativa', subtitle: 'Agendamentos administrativos. Não é prontuário nem dado clínico.' },
  financeiro: { title: 'Financeiro', subtitle: 'Cobranças e recebimentos da clínica. Não substitui contabilidade ou emissão de notas fiscais.' },
  relatorios: { title: 'Relatórios', subtitle: 'Resumos de agenda, financeiro e pacientes. Apenas dados administrativos — sem dados clínicos.' },
  servicos: { title: 'Serviços', subtitle: 'Catálogo de tipos de atendimento da clínica — consultas, retornos, sessões e procedimentos. Aparecem na agenda e nas cobranças.' },
  convenios: { title: 'Convênios', subtitle: 'Cadastre convênios aceitos pela clínica e use essas informações em pacientes e cobranças. Apenas dados administrativos — sem dados clínicos.' },
  estoque: { title: 'Estoque', subtitle: 'Controle materiais e insumos da clínica com entradas, saídas e alertas de estoque baixo. Apenas dados administrativos — sem dados clínicos.' },
  equipe: { title: 'Equipe', subtitle: 'Acesso ao sistema (membros), solicitações pendentes e profissionais usados na agenda.' },
  seguranca: { title: 'Segurança e sessão', subtitle: 'Estado da autenticação, MFA e auditoria de acesso clínico.' },
  assinatura: { title: 'Plano e assinatura', subtitle: 'Acompanhe o plano comercial da clínica, módulos habilitados e estado da assinatura.' },
};

export function Dashboard(): JSX.Element {
  const navigate = useNavigate();
  const { user, clinic, isDemo, logout, refreshMe } = useAuth();
  const [sessionsRefresh, setSessionsRefresh] = useState(0);
  // Shared counter so the patient list and the duplicates panel reload each other
  // after a create/edit/archive/restore (Sprint 3.22/3.23).
  const [patientsRefresh, setPatientsRefresh] = useState(0);
  const [tab, setTab] = useState<TabKey>('inicio');

  // Guided demo tour state (Sprint 5.0E; walkthrough mode 5.0F.2). Lifted here so
  // the demo bar's "Recomeçar tour" can drive the floating tour and so each step
  // can auto-open the module it points at.
  const [tourStep, setTourStep] = useState(0);
  const [tourCollapsed, setTourCollapsed] = useState(false);

  // Sprint 3.1: only the clinic owner can run sensitive administrative actions.
  const isOwner = user?.papel === 'dono_clinica';

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  // Walkthrough mode (5.0F.2): advancing/rewinding a step opens the module that
  // step points at, so Auri's spotlight always has its target on screen. Only
  // fires on step changes — manual tab clicks mid-tour are left alone.
  useEffect(() => {
    if (!isDemo || tourCollapsed) return;
    const stepTab = DEMO_TOUR_STEPS[tourStep]?.tab;
    if (stepTab) setTab(stepTab as TabKey);
  }, [tourStep, isDemo, tourCollapsed]);

  function handleLogout(): void {
    logout();
    navigate('/login', { replace: true });
  }

  // Closing-CTA / "Sair da demo": end the demo session and leave /app.
  function handleExitDemoTo(path: string): void {
    logout();
    if (path.startsWith('/#')) {
      window.location.href = path;
    } else {
      navigate(path, { replace: true });
    }
  }

  function restartTour(): void {
    setTourStep(0);
    setTourCollapsed(false);
  }

  // Sprint 3.24: a logged-in user without a clinic (typically a freshly
  // registered secretaria) hasn't been approved yet — show the join gate
  // instead of the dashboard, so they can submit/track invite requests.
  if (user && !clinic) {
    return <JoinClinicGate />;
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

      {isDemo && (
        <div className={styles.demoBar} role="note">
          <span className={styles.demoBarLeft}>
            <DemoMascot size={26} mood="happy" />
            <span className={styles.demoBarText}>
              <strong>Demonstração guiada</strong>
              <span className={styles.demoBarSub}>Dados 100% fictícios · ambiente controlado</span>
            </span>
          </span>
          <span className={styles.demoBarActions}>
            <button type="button" className={styles.demoBarBtn} onClick={restartTour}>
              <RotateCcw size={14} aria-hidden="true" />
              Recomeçar tour
            </button>
            <button
              type="button"
              className={styles.demoBarExit}
              onClick={() => handleExitDemoTo('/demo')}
            >
              <LogOut size={14} aria-hidden="true" />
              Sair da demo
            </button>
          </span>
        </div>
      )}

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
          {TABS.filter((t) => !t.ownerOnly || isOwner).map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                data-tour-id={`nav-${t.key}`}
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
                  Use a navegação: <strong>Agenda</strong> e <strong>Pacientes</strong> para o
                  dia a dia; <strong>Financeiro</strong> e <strong>Relatórios</strong> para
                  cobranças e resultados; <strong>Convênios</strong>, <strong>Serviços</strong>{' '}
                  e <strong>Estoque</strong> para a gestão operacional; e{' '}
                  <strong>Importações</strong> para migrar dados do sistema anterior.
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
            <p className={styles.agendaHint}>
              Profissionais usados nos agendamentos são cadastrados em
              <strong> Equipe → Profissionais da agenda</strong>. Aqui você só
              consome os profissionais ativos da clínica.
            </p>
            <AdministrativeSchedulePanel onGoToFinanceiro={() => setTab('financeiro')} />
          </>
        )}

        {tab === 'financeiro' && (
          <FinancialPanel />
        )}

        {tab === 'relatorios' && (
          <ReportsPanel />
        )}

        {tab === 'servicos' && (
          <ServicesPanel />
        )}

        {tab === 'convenios' && (
          <InsurancePanel />
        )}

        {tab === 'estoque' && (
          <InventoryPanel />
        )}

        {tab === 'equipe' && isOwner && (
          <>
            <TeamManagementPanel />
            <ClinicProfessionalsPanel />
            <ClinicalRolesPanel />
          </>
        )}

        {tab === 'assinatura' && (
          <SubscriptionPanel />
        )}

        {tab === 'seguranca' && (
          <>
          <MfaSettings />
          {isOwner && <ClinicalReadAuditPanel />}
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
              <h3 className={styles.cardTitle}>Módulos disponíveis</h3>
              <ul className={styles.checklist}>
                <li className={styles.checkItem}>
                  <CheckCircle2 size={18} className={styles.iconDone} aria-hidden="true" />
                  <span>Autenticação, MFA e códigos de recuperação</span>
                </li>
                <li className={styles.checkItem}>
                  <CheckCircle2 size={18} className={styles.iconDone} aria-hidden="true" />
                  <span>Importação, pacientes, agenda, serviços e equipe</span>
                </li>
                <li className={styles.checkItem}>
                  <CheckCircle2 size={18} className={styles.iconDone} aria-hidden="true" />
                  <span>Financeiro, relatórios, convênios e estoque</span>
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
            ClinicBridge · Clinic OS
          </span>
          <p className={styles.footerNote}>
            Gestão clínica e administrativa para consultórios. Não substitui avaliação
            profissional, assinatura digital válida ou obrigações legais específicas.
          </p>
          <nav className={styles.footerLinks} aria-label="Links">
            <span>Segurança</span>
            <span>Privacidade</span>
            <span>Suporte</span>
            <span>Roadmap</span>
          </nav>
        </div>
      </footer>

      {isDemo && (
        <>
          <GuidedDemoTour
            step={tourStep}
            setStep={setTourStep}
            collapsed={tourCollapsed}
            setCollapsed={setTourCollapsed}
            onExitTo={handleExitDemoTo}
          />
          <DemoBlockedToast />
        </>
      )}
    </div>
  );
}
