import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stethoscope, Loader2, RefreshCw, Plus, Power, Pencil, Check, X } from 'lucide-react';
import { api, ApiError, type PublicClinicProfessional } from '../services/api';
import { getToken } from '../services/authStorage';
import { useAuth } from '../services/AuthProvider';
import styles from './ClinicProfessionalsPanel.module.css';

// Shared cache key prefix. Invalidating ['clinic-professionals'] refreshes BOTH
// this panel and the agenda's professional selects (fixes the QA sync bug).
const PROFESSIONALS_KEY = ['clinic-professionals'] as const;

function errMsg(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

export function ClinicProfessionalsPanel(): JSX.Element {
  const { user } = useAuth();
  // Writes are owner-only (backend gates with requireRole). The UI hides the
  // management controls for non-owners; the backend remains the real defense.
  const isOwner = user?.papel === 'dono_clinica';
  const queryClient = useQueryClient();
  const token = getToken();

  const [newName, setNewName] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editLabel, setEditLabel] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: [...PROFESSIONALS_KEY, 'all'],
    enabled: !!token,
    queryFn: async () => {
      const res = await api.listClinicProfessionals(token as string);
      return res.professionals;
    },
  });

  function invalidateProfessionals(): void {
    void queryClient.invalidateQueries({ queryKey: PROFESSIONALS_KEY });
  }

  const createMutation = useMutation({
    mutationFn: (input: { name: string; specialty_label: string | null }) =>
      api.createClinicProfessional(token as string, input),
    onSuccess: () => {
      setNotice('Profissional criado.');
      setNewName('');
      setNewLabel('');
      invalidateProfessionals();
    },
    onError: (err) => setError(errMsg(err, 'Não foi possível criar o profissional.')),
  });

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; name: string; specialty_label: string | null }) =>
      api.updateClinicProfessional(token as string, input.id, {
        name: input.name,
        specialty_label: input.specialty_label,
      }),
    onSuccess: () => {
      setNotice('Profissional atualizado.');
      setEditId(null);
      invalidateProfessionals();
    },
    onError: (err) => setError(errMsg(err, 'Não foi possível atualizar.')),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => api.deactivateClinicProfessional(token as string, id),
    onSuccess: () => {
      setNotice('Profissional desativado.');
      invalidateProfessionals();
    },
    onError: (err) => setError(errMsg(err, 'Não foi possível desativar.')),
  });

  const busyId =
    updateMutation.isPending || deactivateMutation.isPending
      ? (updateMutation.variables?.id ?? (deactivateMutation.variables as string | undefined) ?? null)
      : null;

  function handleCreate(e: React.FormEvent): void {
    e.preventDefault();
    setNotice(null);
    setError(null);
    if (!newName.trim()) {
      setError('Informe o nome do profissional.');
      return;
    }
    createMutation.mutate({ name: newName.trim(), specialty_label: newLabel.trim() || null });
  }

  function openEdit(p: PublicClinicProfessional): void {
    setEditId(p.id);
    setEditName(p.name);
    setEditLabel(p.specialty_label ?? '');
  }

  const professionals = listQuery.data ?? [];

  return (
    <section className={styles.panel}>
      <div className={styles.head}>
        <h2 className={styles.title}>
          <Stethoscope size={22} aria-hidden="true" />
          Profissionais da clínica
        </h2>
        <button type="button" className={styles.secondaryBtn} onClick={() => void listQuery.refetch()}>
          <RefreshCw size={16} aria-hidden="true" />
          Atualizar
        </button>
      </div>
      <p className={styles.subtitle}>
        Profissionais da agenda — pessoas que aparecem como responsável do
        agendamento e alimentam o seletor da aba <strong>Agenda</strong>. Podem
        ou não ter login no sistema (diferente de "Membros da equipe", acima,
        que são contas com acesso). Função/rótulo é administrativo opcional;
        não é prontuário nem dado clínico.
      </p>

      {isOwner ? (
        <form className={styles.createForm} onSubmit={handleCreate}>
          <input
            type="text"
            className={styles.input}
            placeholder="Nome do profissional"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <input
            type="text"
            className={styles.input}
            placeholder="Função/rótulo interno (opcional)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
          />
          <button type="submit" className={styles.primaryBtn} disabled={createMutation.isPending}>
            {createMutation.isPending ? <Loader2 size={16} className={styles.spin} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
            Adicionar
          </button>
        </form>
      ) : (
        <p className={styles.roleNote}>
          A gestão de profissionais é feita pelo dono(a) da clínica. Você pode
          visualizar a lista e usar os profissionais na agenda.
        </p>
      )}

      {notice && <p className={styles.notice}>{notice}</p>}
      {(error || listQuery.isError) && (
        <p className={styles.error}>
          {error ?? errMsg(listQuery.error, 'Não foi possível carregar os profissionais.')}
        </p>
      )}

      {listQuery.isLoading ? (
        <p className={styles.muted}><Loader2 size={16} className={styles.spin} aria-hidden="true" /> Carregando…</p>
      ) : professionals.length === 0 ? (
        <p className={styles.empty}>Nenhum profissional cadastrado.</p>
      ) : (
        <ul className={styles.list}>
          {professionals.map((p) => (
            <li key={p.id} className={styles.card}>
              {editId === p.id ? (
                <div className={styles.editRow}>
                  <input className={styles.input} value={editName} onChange={(e) => setEditName(e.target.value)} />
                  <input className={styles.input} value={editLabel} onChange={(e) => setEditLabel(e.target.value)} placeholder="Rótulo (opcional)" />
                  <button
                    type="button"
                    className={styles.actionBtn}
                    disabled={updateMutation.isPending}
                    onClick={() => {
                      setNotice(null);
                      setError(null);
                      updateMutation.mutate({ id: p.id, name: editName.trim(), specialty_label: editLabel.trim() || null });
                    }}
                  >
                    <Check size={14} aria-hidden="true" /> Salvar
                  </button>
                  <button type="button" className={styles.actionBtn} onClick={() => setEditId(null)}>
                    <X size={14} aria-hidden="true" /> Cancelar
                  </button>
                </div>
              ) : (
                <>
                  <div className={styles.info}>
                    <span className={styles.name}>{p.name}</span>
                    {p.specialty_label && <span className={styles.label}>{p.specialty_label}</span>}
                    {!p.is_active && <span className={styles.inactive}>Inativo</span>}
                  </div>
                  {isOwner && p.is_active && (
                    <div className={styles.actions}>
                      <button type="button" className={styles.actionBtn} disabled={busyId === p.id} onClick={() => openEdit(p)}>
                        <Pencil size={14} aria-hidden="true" /> Editar
                      </button>
                      <button
                        type="button"
                        className={styles.actionBtn}
                        disabled={busyId === p.id}
                        onClick={() => {
                          setNotice(null);
                          setError(null);
                          deactivateMutation.mutate(p.id);
                        }}
                      >
                        <Power size={14} aria-hidden="true" /> Desativar
                      </button>
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
