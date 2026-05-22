import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LogOut,
  UploadCloud,
  ShieldCheck,
  ListChecks,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { Logo } from '../components/Logo';
import { UploadPanel } from '../components/UploadPanel';
import { ImportSessionsList } from '../components/ImportSessionsList';
import { PatientsList } from '../components/PatientsList';
import { DuplicatesList } from '../components/DuplicatesList';
import { ImportFileRetentionPanel } from '../components/ImportFileRetentionPanel';
import { useAuth } from '../services/AuthProvider';
import type { SafeUser } from '../services/api';
import styles from './Dashboard.module.css';

const ROLE_LABELS: Record<SafeUser['papel'], string> = {
  admin_sistema: 'Administrador do sistema',
  dono_clinica: 'Dono(a) da clínica',
  secretaria: 'Secretaria',
};

export function Dashboard(): JSX.Element {
  const navigate = useNavigate();
  const { user, clinic, logout, refreshMe } = useAuth();
  const [sessionsRefresh, setSessionsRefresh] = useState(0);

  // Sprint 3.1: only the clinic owner can run sensitive administrative actions.
  // The retention panel exposes administrative file metadata and is the future
  // basis for real cleanup, so it is hidden (not just disabled) for operators.
  const isOwner = user?.papel === 'dono_clinica';

  // Re-validate the session on entry. If the token is rejected (401), the
  // provider clears it and RequireAuth sends the user back to /login.
  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  function handleLogout(): void {
    logout();
    navigate('/login', { replace: true });
  }

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

        <div className={styles.identity}>
          <div className={styles.identityItem}>
            <span className={styles.identityLabel}>E-mail</span>
            <span className={styles.identityValue}>{user?.email ?? '—'}</span>
          </div>
          <div className={styles.identityItem}>
            <span className={styles.identityLabel}>Papel</span>
            <span className={styles.identityValue}>
              {user ? ROLE_LABELS[user.papel] : '—'}
            </span>
          </div>
          <div className={styles.identityItem}>
            <span className={styles.identityLabel}>Clínica</span>
            <span className={styles.identityValue}>{clinic?.nome ?? '—'}</span>
          </div>
        </div>

        <UploadPanel onSessionSaved={() => setSessionsRefresh((n) => n + 1)} />

        <ImportSessionsList refreshKey={sessionsRefresh} />

        <PatientsList />

        <DuplicatesList />

        {isOwner && <ImportFileRetentionPanel />}

        <div className={styles.grid}>
          <section className={styles.card}>
            <span className={`${styles.cardBadge} ${styles.cardBadgeOk}`}>
              <ShieldCheck size={14} aria-hidden="true" />
              Ativo
            </span>
            <h2 className={styles.cardTitle}>Autenticação e sessão</h2>
            <p className={styles.cardText}>
              Nesta etapa, o ClinicBridge já valida autenticação e sessão com isolamento por
              clínica. A migração de arquivos entra na próxima sprint.
            </p>
          </section>

          <section className={styles.card}>
            <span className={`${styles.cardBadge} ${styles.cardBadgeInfo}`}>
              <UploadCloud size={14} aria-hidden="true" />
              Em breve
            </span>
            <h2 className={styles.cardTitle}>Próximas etapas</h2>
            <ol className={styles.steps}>
              <li className={styles.step}>
                <span className={styles.stepNum}>1</span>
                <span>Enviar arquivo CSV/XLSX</span>
              </li>
              <li className={styles.step}>
                <span className={styles.stepNum}>2</span>
                <span>Mapear colunas e validar dados</span>
              </li>
              <li className={styles.step}>
                <span className={styles.stepNum}>3</span>
                <span>Revisar duplicados e exportar</span>
              </li>
            </ol>
            <p className={styles.cardText}>
              O envio de arquivos já está disponível acima. O processamento dessas etapas
              entra nas próximas sprints.
            </p>
          </section>

          <section className={styles.card}>
            <span className={`${styles.cardBadge} ${styles.cardBadgeInfo}`}>
              <ListChecks size={14} aria-hidden="true" />
              Resumo
            </span>
            <h2 className={styles.cardTitle}>Checklist do MVP</h2>
            <ul className={styles.checklist}>
              <li className={styles.checkItem}>
                <CheckCircle2 size={18} className={styles.iconDone} aria-hidden="true" />
                <span>Conta criada</span>
              </li>
              <li className={styles.checkItem}>
                <CheckCircle2 size={18} className={styles.iconDone} aria-hidden="true" />
                <span>Sessão validada</span>
              </li>
              <li className={styles.checkItem}>
                <CheckCircle2 size={18} className={styles.iconDone} aria-hidden="true" />
                <span>Upload de arquivo CSV/XLSX (seguro)</span>
              </li>
              <li className={styles.checkItem}>
                <Clock size={18} className={styles.iconPending} aria-hidden="true" />
                <span>Processamento/migração em breve</span>
              </li>
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
