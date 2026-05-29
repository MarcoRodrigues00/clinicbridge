// ClinicalRolesPanel — Sprint 4.2C. Owner-only panel shown in the equipe tab
// for granting/revoking clinical roles (profissional_clinico, gestor_clinica)
// to clinic members. Backend enforces all access control; UI is informational.
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Stethoscope, UserCheck, UserX, Plus, Loader2 } from 'lucide-react';
import {
  api,
  ApiError,
  type ClinicalRoleName,
} from '../services/api';
import { getToken } from '../services/authStorage';
import { useAuth } from '../services/AuthProvider';
import styles from './ClinicalPatientPane.module.css';

const ROLE_LABELS: Record<ClinicalRoleName, string> = {
  profissional_clinico: 'Profissional clínico',
  gestor_clinica: 'Supervisor (lê toda a clínica)',
};

function clinicalError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return 'Operação não concluída. Tente novamente.';
}

export function ClinicalRolesPanel(): JSX.Element | null {
  const { user } = useAuth();
  const token = getToken();
  const queryClient = useQueryClient();

  const isOwner = user?.papel === 'dono_clinica';

  const { data: grantsData, isLoading: grantsLoading, error: grantsError } = useQuery({
    queryKey: ['clinicalRoles'],
    queryFn: () => api.listClinicalRoleGrants(token!),
    enabled: isOwner && !!token,
    staleTime: 30_000,
  });

  const { data: membersData } = useQuery({
    queryKey: ['clinicMembers'],
    queryFn: () => api.listClinicMembers(token!),
    enabled: isOwner && !!token,
    staleTime: 60_000,
  });

  const [grantUserId, setGrantUserId] = useState('');
  const [grantRole, setGrantRole] = useState<ClinicalRoleName>('profissional_clinico');
  const [grantError, setGrantError] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const grantMutation = useMutation({
    mutationFn: () =>
      api.grantClinicalRole(token!, { user_id: grantUserId, role: grantRole }),
    onSuccess: () => {
      setGrantUserId('');
      setGrantError(null);
      void queryClient.invalidateQueries({ queryKey: ['clinicalRoles'] });
    },
    onError: (err: unknown) => {
      setGrantError(clinicalError(err));
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (grantId: string) => api.revokeClinicalRole(token!, grantId),
    onMutate: (grantId: string) => {
      setRevokingId(grantId);
    },
    onSuccess: () => {
      setRevokingId(null);
      setRevokeError(null);
      void queryClient.invalidateQueries({ queryKey: ['clinicalRoles'] });
    },
    onError: (err: unknown) => {
      setRevokingId(null);
      setRevokeError(clinicalError(err));
    },
  });

  if (!isOwner) return null;

  const grants = grantsData?.grants ?? [];
  const memberMap = new Map(
    (membersData?.members ?? []).map((m) => [m.user_id, m]),
  );
  const activeMembers = (membersData?.members ?? []).filter((m) => m.ativo);

  return (
    <div className={styles.rolesPanel}>
      <div>
        <p className={styles.rolesPanelTitle}>
          <Stethoscope size={18} aria-hidden="true" />
          Acesso ao prontuário
        </p>
        <p className={styles.rolesPanelSubtitle}>
          Defina quem da sua equipe pode registrar e ver atendimentos no
          prontuário dos pacientes. Este acesso é separado do acesso
          administrativo (login na clínica) — um(a) funcionário(a) pode usar
          o sistema sem ver dados clínicos.
        </p>
      </div>

      {grantsLoading && (
        <p className={styles.stateMsg}>
          <Loader2 size={15} className={styles.spin} aria-hidden="true" />
          Carregando acessos…
        </p>
      )}

      {grantsError && (
        <p className={styles.errorMsg}>{clinicalError(grantsError)}</p>
      )}

      {revokeError && <p className={styles.errorMsg}>{revokeError}</p>}

      {!grantsLoading && !grantsError && grants.length === 0 && (
        <p className={styles.emptyMsg}>
          Nenhum membro tem acesso ao prontuário ainda.
        </p>
      )}

      {grants.length > 0 && (
        <ul className={styles.grantList}>
          {grants.map((grant) => {
            const member = memberMap.get(grant.user_id);
            const isRevoking =
              revokingId === grant.id && revokeMutation.isPending;
            return (
              <li key={grant.id} className={styles.grantRow}>
                <div className={styles.grantInfo}>
                  <p className={styles.grantName}>
                    {member?.nome ?? grant.user_id}
                  </p>
                  <p className={styles.grantRole}>
                    <UserCheck
                      size={12}
                      style={{ display: 'inline', marginRight: '0.25rem' }}
                      aria-hidden="true"
                    />
                    {ROLE_LABELS[grant.role] ?? grant.role}
                  </p>
                  <p className={styles.grantDate}>
                    Concedido em{' '}
                    {new Date(grant.granted_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <button
                  type="button"
                  className={styles.revokeBtn}
                  disabled={isRevoking || revokeMutation.isPending}
                  onClick={() => {
                    setRevokeError(null);
                    revokeMutation.mutate(grant.id);
                  }}
                >
                  {isRevoking ? (
                    <Loader2 size={12} className={styles.spin} aria-hidden="true" />
                  ) : (
                    <UserX size={12} aria-hidden="true" />
                  )}
                  Remover acesso
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className={styles.grantForm}>
        <p className={styles.formTitle} style={{ fontSize: '0.93rem' }}>
          <Plus
            size={14}
            style={{ display: 'inline', marginRight: '0.25rem' }}
            aria-hidden="true"
          />
          Liberar acesso ao prontuário
        </p>
        <div className={styles.grantFormRow}>
          <label className={styles.formField}>
            <span className={styles.formLabel}>Membro da equipe</span>
            <select
              className={styles.formSelect}
              value={grantUserId}
              onChange={(e) => setGrantUserId(e.target.value)}
              disabled={grantMutation.isPending}
            >
              <option value="">Selecione um membro…</option>
              {activeMembers.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.nome} ({m.email})
                </option>
              ))}
            </select>
          </label>
          <label className={styles.formField}>
            <span className={styles.formLabel}>Tipo de acesso</span>
            <select
              className={styles.formSelect}
              value={grantRole}
              onChange={(e) => setGrantRole(e.target.value as ClinicalRoleName)}
              disabled={grantMutation.isPending}
            >
              <option value="profissional_clinico">Profissional clínico</option>
              <option value="gestor_clinica">Supervisor</option>
            </select>
          </label>
          <button
            type="button"
            className={styles.submitBtn}
            disabled={!grantUserId || grantMutation.isPending}
            onClick={() => {
              setGrantError(null);
              grantMutation.mutate();
            }}
          >
            {grantMutation.isPending ? (
              <Loader2 size={14} className={styles.spin} aria-hidden="true" />
            ) : null}
            Liberar acesso
          </button>
        </div>
        {grantError && <p className={styles.formError}>{grantError}</p>}
      </div>
    </div>
  );
}
