// GovernancePanel — Sprint 6.1C (ADR 0019). Owner/titular-only panel in the
// equipe tab. Shows the clinic's GOVERNANCE axis (Titular + Administradores) and
// lets the Titular promote an existing team member to Administrador da clínica.
//
// Hard separation reminders (ADR 0019 invariant):
//   - Being an Administrador grants NO clinical access (prontuário) and NO
//     billing power. Clinical access stays in "Acesso ao prontuário" below.
// Backend enforces everything (requireClinicGovernance / titular-only); the UI
// only avoids offering obviously-invalid options. Reuses ClinicalRolesPanel's
// stylesheet for visual consistency.
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Crown, UserPlus, Loader2, Info, HelpCircle } from 'lucide-react';
import {
  api,
  ApiError,
  type ClinicGovernanceRole,
  type GovernanceMember,
} from '../services/api';
import { getToken } from '../services/authStorage';
import { useAuth } from '../services/AuthProvider';
import styles from './ClinicalPatientPane.module.css';

const GOVERNANCE_LABELS: Record<ClinicGovernanceRole, string> = {
  titular: 'Titular da clínica',
  administrador: 'Administrador da clínica',
};

function governanceError(err: unknown): string {
  if (err instanceof ApiError) {
    // Human copy for the cases the backend can return.
    if (err.status === 403) return 'Apenas o titular da clínica pode promover administradores.';
    if (err.status === 404) return 'Esse membro não está disponível para promoção nesta clínica.';
    if (err.code === 'governance_member_exists') {
      return 'Esse membro já tem um papel de governança ativo.';
    }
    return err.message;
  }
  return 'Operação não concluída. Tente novamente.';
}

export function GovernancePanel({ onAuriTour }: { onAuriTour?: () => void } = {}): JSX.Element | null {
  const { user } = useAuth();
  const token = getToken();
  const queryClient = useQueryClient();

  const isOwner = user?.papel === 'dono_clinica';

  const governanceQuery = useQuery({
    queryKey: ['clinic-governance'],
    queryFn: () => api.listClinicGovernance(token!),
    enabled: isOwner && !!token,
    staleTime: 30_000,
  });

  // NOTE: key ['clinicMembers'] (object shape {members}) — shared with
  // ClinicalRolesPanel. Do NOT use ['clinic-members']: TeamManagementPanel
  // caches THAT key as the bare array (return res.members), so reading
  // `.members` off it here would yield undefined (shape collision).
  const membersQuery = useQuery({
    queryKey: ['clinicMembers'],
    queryFn: () => api.listClinicMembers(token!),
    enabled: isOwner && !!token,
    staleTime: 60_000,
  });

  const [promoteUserId, setPromoteUserId] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [promoteError, setPromoteError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const promoteMutation = useMutation({
    mutationFn: () => api.promoteClinicAdministrator(token!, { user_id: promoteUserId }),
    onSuccess: (res) => {
      setNotice(`${res.member.nome} agora é Administrador(a) da clínica.`);
      setPromoteUserId('');
      setConfirming(false);
      setPromoteError(null);
      void queryClient.invalidateQueries({ queryKey: ['clinic-governance'] });
    },
    onError: (err: unknown) => {
      setConfirming(false);
      setPromoteError(governanceError(err));
    },
  });

  const members = useMemo(() => governanceQuery.data?.members ?? [], [governanceQuery.data]);
  const titular = members.find((m) => m.governance_role === 'titular');
  const administradores = members.filter((m) => m.governance_role === 'administrador');

  // Eligible = active team members not already in governance, never admin_sistema.
  // The titular is already in `members`, so it is filtered out automatically.
  const governanceIds = useMemo(
    () => new Set(members.map((m: GovernanceMember) => m.user_id)),
    [members],
  );
  const eligible = (membersQuery.data?.members ?? []).filter(
    (m) => m.ativo && m.papel !== 'admin_sistema' && !governanceIds.has(m.user_id),
  );

  if (!isOwner) return null;

  // Defensive: the equipe tab is already owner-only, but if the backend denies
  // the governance read (403), show a calm restricted state instead of an error.
  if (governanceQuery.error instanceof ApiError && governanceQuery.error.status === 403) {
    return (
      <div className={styles.rolesPanel}>
        <p className={styles.rolesPanelTitle}>
          <ShieldCheck size={18} aria-hidden="true" />
          Governança da clínica
        </p>
        <p className={styles.emptyMsg}>
          Apenas o titular da clínica vê e gerencia a governança.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.rolesPanel} data-tour-id="governance-panel">
      <div>
        <div className={styles.governanceHeader}>
          <p className={styles.rolesPanelTitle}>
            <ShieldCheck size={18} aria-hidden="true" />
            Governança da clínica
          </p>
          {onAuriTour && (
            <button
              type="button"
              className={styles.auriBtn}
              onClick={onAuriTour}
              title="Auri explica este módulo"
            >
              <HelpCircle size={14} aria-hidden="true" />
              Auri explica
            </button>
          )}
        </div>
        <p className={styles.rolesPanelSubtitle}>
          Quem responde pela conta. O <strong>Titular</strong> é o responsável
          principal; <strong>Administradores</strong> ajudam na gestão. Ser
          Administrador(a) <strong>não</strong> dá acesso ao prontuário nem ao
          financeiro/assinatura — o acesso clínico continua separado, em{' '}
          <em>Acesso ao prontuário</em>, logo abaixo.
        </p>
      </div>

      {governanceQuery.isLoading && (
        <p className={styles.stateMsg}>
          <Loader2 size={15} className={styles.spin} aria-hidden="true" />
          Carregando governança…
        </p>
      )}

      {governanceQuery.error && !(governanceQuery.error instanceof ApiError && governanceQuery.error.status === 403) && (
        <p className={styles.errorMsg}>{governanceError(governanceQuery.error)}</p>
      )}

      {!governanceQuery.isLoading && !governanceQuery.error && (
        <ul className={styles.grantList}>
          {titular && (
            <li className={styles.grantRow}>
              <div className={styles.grantInfo}>
                <p className={styles.grantName}>{titular.nome}</p>
                <p className={styles.grantRole}>
                  <Crown
                    size={12}
                    style={{ display: 'inline', marginRight: '0.25rem' }}
                    aria-hidden="true"
                  />
                  {GOVERNANCE_LABELS.titular}
                </p>
              </div>
            </li>
          )}
          {administradores.map((m) => (
            <li key={m.user_id} className={styles.grantRow}>
              <div className={styles.grantInfo}>
                <p className={styles.grantName}>{m.nome}</p>
                <p className={styles.grantRole}>
                  <ShieldCheck
                    size={12}
                    style={{ display: 'inline', marginRight: '0.25rem' }}
                    aria-hidden="true"
                  />
                  {GOVERNANCE_LABELS.administrador}
                </p>
              </div>
            </li>
          ))}
          {administradores.length === 0 && (
            <li className={styles.grantRow}>
              <p className={styles.grantDate}>
                Nenhum administrador ainda — a clínica é gerida só pelo titular.
              </p>
            </li>
          )}
        </ul>
      )}

      {notice && (
        <p className={styles.stateMsg}>
          <Info size={14} aria-hidden="true" /> {notice}
        </p>
      )}

      <div className={styles.grantForm}>
        <p className={styles.formTitle} style={{ fontSize: '0.93rem' }}>
          <UserPlus
            size={14}
            style={{ display: 'inline', marginRight: '0.25rem' }}
            aria-hidden="true"
          />
          Promover membro a Administrador(a)
        </p>
        <div className={styles.grantFormRow}>
          <label className={styles.formField}>
            <span className={styles.formLabel}>Membro da equipe</span>
            <select
              className={styles.formSelect}
              value={promoteUserId}
              onChange={(e) => {
                setPromoteUserId(e.target.value);
                setConfirming(false);
                setPromoteError(null);
                setNotice(null);
              }}
              disabled={promoteMutation.isPending}
            >
              <option value="">Selecione um membro…</option>
              {eligible.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.nome} ({m.email})
                </option>
              ))}
            </select>
          </label>
          {!confirming ? (
            <button
              type="button"
              className={styles.submitBtn}
              disabled={!promoteUserId || promoteMutation.isPending}
              onClick={() => {
                setPromoteError(null);
                setConfirming(true);
              }}
            >
              Promover
            </button>
          ) : (
            <button
              type="button"
              className={styles.submitBtn}
              disabled={promoteMutation.isPending}
              onClick={() => {
                setPromoteError(null);
                promoteMutation.mutate();
              }}
            >
              {promoteMutation.isPending ? (
                <Loader2 size={14} className={styles.spin} aria-hidden="true" />
              ) : null}
              Confirmar promoção
            </button>
          )}
        </div>
        {confirming && !promoteMutation.isPending && (
          <p className={styles.grantDate}>
            Confirmar dá poderes administrativos altos (não clínicos). Para
            reverter será preciso um fluxo de remoção (ainda não disponível).
          </p>
        )}
        {eligible.length === 0 && (
          <p className={styles.grantDate}>
            Não há membros elegíveis. Convide ou aprove um(a) funcionário(a) na
            lista de equipe acima para poder promovê-lo(a).
          </p>
        )}
        {promoteError && <p className={styles.formError}>{promoteError}</p>}
      </div>
    </div>
  );
}
