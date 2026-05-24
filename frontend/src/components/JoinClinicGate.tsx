import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  KeyRound,
  Loader2,
  LogOut,
  Send,
  ShieldCheck,
  X as XIcon,
} from 'lucide-react';
import { Logo } from './Logo';
import { api, ApiError, type JoinRequestStatus, type MyJoinRequest } from '../services/api';
import { getToken } from '../services/authStorage';
import { useAuth } from '../services/AuthProvider';
import styles from './JoinClinicGate.module.css';

// Shown when the authenticated user has NO clinic yet (clinica_id = null) —
// typically a freshly-registered secretaria. They submit an invite code to
// request entry. Approval is owner-driven; there is no auto-join, no search,
// and no public clinic listing. Errors are generic to prevent enumeration.

const STATUS_LABELS: Record<JoinRequestStatus, string> = {
  pending: 'Aguardando aprovação',
  approved: 'Aprovada',
  rejected: 'Recusada',
  cancelled: 'Cancelada',
};

function errMsg(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR');
}

export function JoinClinicGate(): JSX.Element {
  const { user, logout, refreshMe } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const token = getToken();

  const [inviteCode, setInviteCode] = useState('');
  const [clinicNameConfirm, setClinicNameConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const myRequestsQuery = useQuery({
    queryKey: ['clinic-join-requests', 'me'],
    enabled: !!token,
    queryFn: async () => {
      const res = await api.listMyJoinRequests(token as string);
      return res.requests;
    },
    refetchInterval: 15_000,
  });

  const createMutation = useMutation({
    mutationFn: (payload: { invite_code: string; clinic_name?: string; message?: string }) =>
      api.createClinicJoinRequest(token as string, payload),
    onSuccess: () => {
      setNotice('Solicitação enviada. Aguarde a aprovação do(a) dono(a) da clínica.');
      setFormError(null);
      setInviteCode('');
      setClinicNameConfirm('');
      setMessage('');
      void queryClient.invalidateQueries({ queryKey: ['clinic-join-requests', 'me'] });
    },
    onError: (err) => {
      setNotice(null);
      setFormError(errMsg(err, 'Não foi possível enviar a solicitação.'));
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.cancelMyJoinRequest(token as string, id),
    onSuccess: () => {
      setNotice('Solicitação cancelada.');
      void queryClient.invalidateQueries({ queryKey: ['clinic-join-requests', 'me'] });
    },
    onError: (err) => setFormError(errMsg(err, 'Não foi possível cancelar a solicitação.')),
  });

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    setNotice(null);
    setFormError(null);

    const code = inviteCode.trim();
    if (code.length === 0) {
      setFormError('Informe o código de convite.');
      return;
    }
    const trimmedName = clinicNameConfirm.trim();
    const trimmedMessage = message.trim();
    createMutation.mutate({
      invite_code: code,
      clinic_name: trimmedName.length > 0 ? trimmedName : undefined,
      message: trimmedMessage.length > 0 ? trimmedMessage : undefined,
    });
  }

  function handleLogout(): void {
    logout();
    navigate('/login', { replace: true });
  }

  async function handleCheckAgain(): Promise<void> {
    try {
      await refreshMe();
    } catch {
      // ignored — refreshMe surfaces 401 via auth state
    }
  }

  const requests = myRequestsQuery.data ?? [];
  const hasPending = requests.some((r) => r.status === 'pending');

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
          <p className={styles.subtitle}>
            Sua conta de funcionário(a) foi criada. Para acessar a clínica, peça o código
            de convite ao(à) dono(a) e envie sua solicitação abaixo. O acesso só é liberado
            após aprovação do(a) dono(a) — não existe entrada automática.
          </p>
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>
            <KeyRound size={18} aria-hidden="true" />
            Solicitar entrada com código de convite
          </h2>
          {notice ? (
            <div className={`${styles.alert} ${styles.alertSuccess}`} role="status">
              {notice}
            </div>
          ) : null}
          {formError ? (
            <div className={`${styles.alert} ${styles.alertError}`} role="alert">
              {formError}
            </div>
          ) : null}

          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="join-code">
                Código de convite
              </label>
              <input
                id="join-code"
                className={styles.input}
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="Ex.: ABCD-1234"
                disabled={createMutation.isPending}
              />
              <span className={styles.hint}>
                O código é compartilhado fora do sistema pelo(a) dono(a) da clínica.
              </span>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="join-clinic-name">
                Nome da clínica (opcional)
              </label>
              <input
                id="join-clinic-name"
                className={styles.input}
                type="text"
                value={clinicNameConfirm}
                onChange={(e) => setClinicNameConfirm(e.target.value)}
                placeholder="Confirmação opcional"
                disabled={createMutation.isPending}
              />
              <span className={styles.hint}>
                Se preenchido, precisa bater exatamente com o nome cadastrado.
              </span>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="join-message">
                Mensagem para o(a) dono(a) (opcional)
              </label>
              <textarea
                id="join-message"
                className={styles.textarea}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={280}
                rows={3}
                placeholder="Ex.: Sou o(a) novo(a) funcionário(a) administrativo(a) do consultório."
                disabled={createMutation.isPending}
              />
            </div>

            <div className={styles.actionsRow}>
              <button
                type="submit"
                className={styles.primaryBtn}
                disabled={createMutation.isPending || hasPending}
                title={hasPending ? 'Você já tem uma solicitação pendente.' : undefined}
              >
                {createMutation.isPending ? (
                  <Loader2 size={16} className={styles.spin} aria-hidden="true" />
                ) : (
                  <Send size={16} aria-hidden="true" />
                )}
                Enviar solicitação
              </button>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => void handleCheckAgain()}
              >
                Já fui aprovado(a)? Recarregar sessão
              </button>
            </div>
          </form>
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Minhas solicitações</h2>
          {myRequestsQuery.isLoading ? (
            <div className={styles.muted}>
              <Loader2 size={16} className={styles.spin} aria-hidden="true" />
              Carregando…
            </div>
          ) : requests.length === 0 ? (
            <div className={styles.empty}>Nenhuma solicitação ainda.</div>
          ) : (
            <ul className={styles.list}>
              {requests.map((req: MyJoinRequest) => (
                <li key={req.id} className={styles.requestRow}>
                  <div className={styles.requestMain}>
                    <strong className={styles.clinicName}>
                      {req.clinic_name ?? 'Clínica'}
                    </strong>
                    <span
                      className={`${styles.statusBadge} ${
                        req.status === 'pending'
                          ? styles.statusPending
                          : req.status === 'approved'
                            ? styles.statusApproved
                            : styles.statusOther
                      }`}
                    >
                      {STATUS_LABELS[req.status]}
                    </span>
                  </div>
                  <div className={styles.requestMeta}>
                    Enviada em {formatDate(req.created_at)}
                    {req.decided_at ? ` · Decidida em ${formatDate(req.decided_at)}` : ''}
                  </div>
                  {req.message ? (
                    <div className={styles.requestMessage}>“{req.message}”</div>
                  ) : null}
                  {req.status === 'pending' ? (
                    <div className={styles.requestActions}>
                      <button
                        type="button"
                        className={styles.secondaryBtn}
                        onClick={() => cancelMutation.mutate(req.id)}
                        disabled={
                          cancelMutation.isPending && cancelMutation.variables === req.id
                        }
                      >
                        {cancelMutation.isPending && cancelMutation.variables === req.id ? (
                          <Loader2 size={14} className={styles.spin} aria-hidden="true" />
                        ) : (
                          <XIcon size={14} aria-hidden="true" />
                        )}
                        Cancelar solicitação
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <footer className={styles.footer}>
        <p className={styles.footerNote}>
          Ferramenta administrativa. Não substitui prontuário ou sistema clínico.
        </p>
      </footer>
    </div>
  );
}
