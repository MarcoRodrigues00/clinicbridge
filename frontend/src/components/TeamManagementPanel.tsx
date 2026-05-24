import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  KeyRound,
  Copy,
  Check,
  Loader2,
  RefreshCw,
  RotateCw,
  UserCheck,
  UserX,
  UserMinus,
  Crown,
} from 'lucide-react';
import {
  api,
  ApiError,
  type ClinicMember,
  type PendingJoinRequest,
} from '../services/api';
import { getToken } from '../services/authStorage';
import { useAuth } from '../services/AuthProvider';
import { ConfirmDialog } from './ConfirmDialog';
import styles from './TeamManagementPanel.module.css';

// Owner-only panel (Sprint 3.24). Shows the clinic's invite code (to share
// out-of-band) and pending join requests from prospective staff. The backend
// gates writes with requireRole; the UI hides the panel for non-owners but the
// real defense is server-side. No public search — entry is invite-only.

type PendingAction =
  | { type: 'regenerate' }
  | { type: 'approve'; id: string; name: string; email: string }
  | { type: 'reject'; id: string; name: string }
  | { type: 'deactivate'; userId: string; name: string };

function errMsg(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR');
}

// Sprint 3.24.1: a role técnica continua sendo `secretaria` no backend, mas a
// UI mostra um rótulo neutro de produto. Outras roles podem entrar no futuro
// (recepção, financeiro, gestor) e ganhar entradas próprias aqui.
function requestedRoleLabel(role: string): string {
  if (role === 'secretaria') return 'funcionário(a) (acesso administrativo)';
  return role;
}

function memberRoleLabel(papel: ClinicMember['papel']): string {
  if (papel === 'dono_clinica') return 'Dono(a) da clínica';
  if (papel === 'secretaria') return 'Funcionário(a) (acesso administrativo)';
  return papel;
}

export function TeamManagementPanel(): JSX.Element | null {
  const { user } = useAuth();
  const isOwner = user?.papel === 'dono_clinica';
  const queryClient = useQueryClient();
  const token = getToken();

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Sprint 3.28 — modal de confirmação para ações sensíveis
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const inviteCodeQuery = useQuery({
    queryKey: ['clinic-invite-code'],
    enabled: !!token && isOwner,
    queryFn: async () => api.getClinicInviteCode(token as string),
  });

  const pendingQuery = useQuery({
    queryKey: ['clinic-join-requests', 'pending'],
    enabled: !!token && isOwner,
    queryFn: async () => {
      const res = await api.listPendingJoinRequests(token as string);
      return res.requests;
    },
    refetchInterval: 20_000,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.approveJoinRequest(token as string, id),
    onSuccess: () => {
      setPendingAction(null);
      setNotice('Solicitação aprovada. O acesso foi liberado.');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['clinic-join-requests', 'pending'] });
    },
    onError: (err) => {
      setPendingAction(null);
      setError(errMsg(err, 'Não foi possível aprovar a solicitação.'));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.rejectJoinRequest(token as string, id),
    onSuccess: () => {
      setPendingAction(null);
      setNotice('Solicitação recusada.');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['clinic-join-requests', 'pending'] });
    },
    onError: (err) => {
      setPendingAction(null);
      setError(errMsg(err, 'Não foi possível recusar a solicitação.'));
    },
  });

  // Sprint 3.25 — team members (active + removed).
  const [showRemoved, setShowRemoved] = useState(false);

  const membersQuery = useQuery({
    queryKey: ['clinic-members'],
    enabled: !!token && isOwner,
    queryFn: async () => {
      const res = await api.listClinicMembers(token as string);
      return res.members;
    },
    refetchInterval: 30_000,
  });

  const deactivateMutation = useMutation({
    mutationFn: (userId: string) => api.deactivateClinicMember(token as string, userId),
    onSuccess: () => {
      setPendingAction(null);
      setNotice('Acesso desativado. O histórico do(a) funcionário(a) foi mantido.');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['clinic-members'] });
    },
    onError: (err) => {
      setPendingAction(null);
      setError(errMsg(err, 'Não foi possível desativar o acesso.'));
    },
  });

  // Sprint 3.26 — rotate the clinic's invite code. The previous code stops
  // working for new join requests as soon as the mutation succeeds; pending
  // requests submitted with the old code are intentionally preserved.
  const regenerateInviteMutation = useMutation({
    mutationFn: () => api.regenerateClinicInviteCode(token as string),
    onSuccess: (data) => {
      setPendingAction(null);
      setNotice(
        `Novo código gerado: ${data.invite_code}. O código antigo não funciona mais para novas solicitações.`,
      );
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['clinic-invite-code'] });
    },
    onError: (err) => {
      setPendingAction(null);
      setError(errMsg(err, 'Não foi possível regenerar o código.'));
    },
  });

  if (!isOwner) return null;

  async function copyCode(): Promise<void> {
    const code = inviteCodeQuery.data?.invite_code;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard may be unavailable on insecure contexts — silently ignore.
    }
  }

  function handleDialogConfirm(): void {
    if (!pendingAction) return;
    switch (pendingAction.type) {
      case 'regenerate':
        regenerateInviteMutation.mutate();
        break;
      case 'approve':
        approveMutation.mutate(pendingAction.id);
        break;
      case 'reject':
        rejectMutation.mutate(pendingAction.id);
        break;
      case 'deactivate':
        deactivateMutation.mutate(pendingAction.userId);
        break;
    }
  }

  // Compute which mutation (if any) is currently running for the open dialog
  const dialogIsBusy =
    pendingAction !== null &&
    ((pendingAction.type === 'regenerate' && regenerateInviteMutation.isPending) ||
      (pendingAction.type === 'approve' && approveMutation.isPending) ||
      (pendingAction.type === 'reject' && rejectMutation.isPending) ||
      (pendingAction.type === 'deactivate' && deactivateMutation.isPending));

  // Config for each action variant
  type DialogConfig = {
    title: string;
    description: string;
    confirmLabel: string;
    variant: 'default' | 'danger';
  };

  let dialogConfig: DialogConfig | null = null;
  if (pendingAction) {
    switch (pendingAction.type) {
      case 'regenerate':
        dialogConfig = {
          title: 'Gerar um novo código de convite?',
          description:
            'O código atual deixará de aceitar novas solicitações. Membros atuais e pedidos pendentes continuam intactos.',
          confirmLabel: 'Regenerar código',
          variant: 'default',
        };
        break;
      case 'approve':
        dialogConfig = {
          title: 'Aprovar entrada na equipe?',
          description: `${pendingAction.name} (${pendingAction.email}) entrará como funcionário(a) com acesso administrativo. Poderá usar as áreas de pacientes, agenda e importações.`,
          confirmLabel: 'Aprovar entrada',
          variant: 'default',
        };
        break;
      case 'reject':
        dialogConfig = {
          title: 'Recusar solicitação?',
          description: `A solicitação de ${pendingAction.name} será recusada. A pessoa pode pedir entrada novamente com o código de convite.`,
          confirmLabel: 'Recusar solicitação',
          variant: 'default',
        };
        break;
      case 'deactivate':
        dialogConfig = {
          title: 'Desativar acesso?',
          description: `O acesso de ${pendingAction.name} será removido imediatamente. O histórico e os dados continuam preservados. A pessoa pode pedir entrada de novo com o código de convite.`,
          confirmLabel: 'Desativar acesso',
          variant: 'danger',
        };
        break;
    }
  }

  const pending = pendingQuery.data ?? [];
  const busyId =
    approveMutation.isPending || rejectMutation.isPending
      ? (approveMutation.variables ?? rejectMutation.variables ?? null)
      : null;

  return (
    <>
      <section className={styles.panel}>
        <div className={styles.head}>
          <h2 className={styles.title}>
            <Users size={20} aria-hidden="true" />
            Equipe da clínica
            <span className={styles.categoryChip}>Acesso ao sistema</span>
          </h2>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => {
              void queryClient.invalidateQueries({ queryKey: ['clinic-invite-code'] });
              void queryClient.invalidateQueries({ queryKey: ['clinic-join-requests', 'pending'] });
              void queryClient.invalidateQueries({ queryKey: ['clinic-members'] });
            }}
          >
            <RefreshCw size={14} aria-hidden="true" />
            Atualizar
          </button>
        </div>
        <p className={styles.subtitle}>
          Pessoas com login no sistema (você + funcionários(as) aprovados(as)).
          Compartilhe o código de convite por um canal seguro; cada solicitação
          precisa ser aprovada por você — não existe entrada automática.
        </p>

        <div className={styles.inviteRow}>
          <div className={styles.inviteLabel}>
            <KeyRound size={16} aria-hidden="true" />
            Código de convite
          </div>
          {inviteCodeQuery.isLoading ? (
            <div className={styles.muted}>
              <Loader2 size={14} className={styles.spin} aria-hidden="true" />
              Carregando…
            </div>
          ) : inviteCodeQuery.isError ? (
            <span className={styles.error}>Não foi possível carregar o código.</span>
          ) : inviteCodeQuery.data ? (
            <>
              <code className={styles.inviteCode} aria-label="Código de convite">
                {inviteCodeQuery.data.invite_code}
              </code>
              <button type="button" className={styles.copyBtn} onClick={() => void copyCode()}>
                {copied ? (
                  <Check size={14} aria-hidden="true" />
                ) : (
                  <Copy size={14} aria-hidden="true" />
                )}
                {copied ? 'Copiado' : 'Copiar'}
              </button>
              <button
                type="button"
                className={styles.ghostBtn}
                disabled={regenerateInviteMutation.isPending}
                onClick={() => setPendingAction({ type: 'regenerate' })}
              >
                {regenerateInviteMutation.isPending ? (
                  <Loader2 size={14} className={styles.spin} aria-hidden="true" />
                ) : (
                  <RotateCw size={14} aria-hidden="true" />
                )}
                Regenerar
              </button>
              <span className={styles.clinicName}>
                {inviteCodeQuery.data.clinic_name}
              </span>
            </>
          ) : null}
        </div>
        <p className={styles.helperText}>
          Ao regenerar, o código antigo deixará de funcionar para novas solicitações.
          Solicitações pendentes e membros atuais não são alterados.
        </p>

        {notice ? <div className={styles.notice}>{notice}</div> : null}
        {error ? <div className={styles.error}>{error}</div> : null}

        <h3 className={styles.subTitle}>Solicitações pendentes</h3>
        {pendingQuery.isLoading ? (
          <div className={styles.muted}>
            <Loader2 size={14} className={styles.spin} aria-hidden="true" />
            Carregando solicitações…
          </div>
        ) : pending.length === 0 ? (
          <div className={styles.empty}>
            Sem solicitações no momento. Compartilhe o código de convite por um
            canal seguro para receber pedidos de entrada.
          </div>
        ) : (
          <ul className={styles.list}>
            {pending.map((req: PendingJoinRequest) => (
              <li key={req.id} className={styles.card}>
                <div className={styles.cardMain}>
                  <div className={styles.applicant}>
                    <strong className={styles.applicantName}>{req.applicant_name}</strong>
                    <span className={styles.applicantEmail}>{req.applicant_email}</span>
                  </div>
                  <div className={styles.meta}>
                    Solicitado em {formatDate(req.created_at)} · Papel: {requestedRoleLabel(req.requested_role)}
                  </div>
                  {req.message ? (
                    <div className={styles.message}>"{req.message}"</div>
                  ) : null}
                </div>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.primaryBtn}
                    onClick={() =>
                      setPendingAction({
                        type: 'approve',
                        id: req.id,
                        name: req.applicant_name,
                        email: req.applicant_email,
                      })
                    }
                    disabled={busyId === req.id}
                  >
                    {busyId === req.id && approveMutation.isPending ? (
                      <Loader2 size={14} className={styles.spin} aria-hidden="true" />
                    ) : (
                      <UserCheck size={14} aria-hidden="true" />
                    )}
                    Aprovar
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    onClick={() =>
                      setPendingAction({
                        type: 'reject',
                        id: req.id,
                        name: req.applicant_name,
                      })
                    }
                    disabled={busyId === req.id}
                  >
                    {busyId === req.id && rejectMutation.isPending ? (
                      <Loader2 size={14} className={styles.spin} aria-hidden="true" />
                    ) : (
                      <UserX size={14} aria-hidden="true" />
                    )}
                    Recusar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className={styles.membersHeader}>
          <h3 className={styles.subTitle}>Membros da equipe</h3>
          <label className={styles.toggleRow}>
            <input
              type="checkbox"
              checked={showRemoved}
              onChange={(e) => setShowRemoved(e.target.checked)}
            />
            Mostrar inativos
          </label>
        </div>
        <p className={styles.helperText}>
          Desativar acesso não apaga o(a) usuário(a) nem o histórico; apenas remove o
          acesso à clínica. A pessoa pode pedir entrada de novo com o código de convite.
        </p>

        {membersQuery.isLoading ? (
          <div className={styles.muted}>
            <Loader2 size={14} className={styles.spin} aria-hidden="true" />
            Carregando membros…
          </div>
        ) : membersQuery.isError ? (
          <div className={styles.error}>Não foi possível carregar os membros.</div>
        ) : (
          (() => {
            const all = membersQuery.data ?? [];
            const filtered = showRemoved ? all : all.filter((m) => m.status === 'active');
            if (filtered.length === 0) {
              return (
                <div className={styles.empty}>
                  {showRemoved
                    ? 'Nenhum membro registrado nesta clínica ainda.'
                    : 'Só você por enquanto. Quando alguém entrar com o código, vai aparecer aqui.'}
                </div>
              );
            }
            return (
              <ul className={styles.list}>
                {filtered.map((m: ClinicMember) => {
                  const canDeactivate =
                    m.status === 'active' && !m.is_owner && m.user_id !== user?.id;
                  const isBusy =
                    deactivateMutation.isPending && deactivateMutation.variables === m.user_id;
                  return (
                    <li
                      key={m.user_id}
                      className={`${styles.card} ${
                        m.status === 'removed' ? styles.cardInactive : ''
                      }`}
                    >
                      <div className={styles.cardMain}>
                        <div className={styles.applicant}>
                          <strong className={styles.applicantName}>
                            {m.nome}
                            {m.is_owner ? (
                              <span className={styles.ownerBadge} title="Dono(a) da clínica">
                                <Crown size={12} aria-hidden="true" /> Dono(a)
                              </span>
                            ) : null}
                          </strong>
                          <span className={styles.applicantEmail}>{m.email}</span>
                        </div>
                        <div className={styles.meta}>
                          Papel: {memberRoleLabel(m.papel)}
                          {m.joined_at ? ` · Entrou em ${formatDate(m.joined_at)}` : ''}
                          {m.status === 'removed' && m.removed_at
                            ? ` · Desativado(a) em ${formatDate(m.removed_at)}`
                            : ''}
                        </div>
                        <div className={styles.statusRow}>
                          <span
                            className={`${styles.statusBadge} ${
                              m.status === 'active' ? styles.statusActive : styles.statusInactive
                            }`}
                          >
                            {m.status === 'active' ? 'Ativo(a)' : 'Inativo(a)'}
                          </span>
                        </div>
                      </div>
                      <div className={styles.actions}>
                        {canDeactivate ? (
                          <button
                            type="button"
                            className={styles.dangerBtn}
                            onClick={() =>
                              setPendingAction({
                                type: 'deactivate',
                                userId: m.user_id,
                                name: m.nome,
                              })
                            }
                            disabled={isBusy}
                          >
                            {isBusy ? (
                              <Loader2 size={14} className={styles.spin} aria-hidden="true" />
                            ) : (
                              <UserMinus size={14} aria-hidden="true" />
                            )}
                            Desativar acesso
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            );
          })()
        )}
      </section>

      <ConfirmDialog
        open={pendingAction !== null}
        title={dialogConfig?.title ?? ''}
        description={dialogConfig?.description ?? ''}
        confirmLabel={dialogConfig?.confirmLabel}
        variant={dialogConfig?.variant}
        isBusy={dialogIsBusy}
        onConfirm={handleDialogConfirm}
        onCancel={() => setPendingAction(null)}
      />
    </>
  );
}
