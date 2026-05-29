// ServicesPanel.tsx — Sprint 4.6C (ADR 0015)
//
// Catálogo de Serviços v0.1 — painel administrativo/comercial.
//
// INVARIANTES DE SEGURANÇA:
// - Serviço é etiqueta administrativa, NUNCA dado clínico, NUNCA TUSS/CBHPM.
// - price_cents é referência visual — NUNCA auto-propaga para cobranças.
// - duration_minutes é sugestão — NUNCA auto-preenche agendamento.
// - Sem console.log de payload; sem localStorage/sessionStorage.
// - Escrita restrita a dono_clinica (backend é a defesa real; UI oculta controles).
// - Soft-delete apenas — desativação via PATCH /status, sem delete físico.
// - Nenhum campo contém diagnóstico, CID, queixa, prescrição ou dado clínico.
//
// AVISO EXPLÍCITO no formulário: impede que o usuário insira dados clínicos.

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Briefcase,
  Loader2,
  Plus,
  Pencil,
  Power,
  Check,
  X,
  Users,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from 'lucide-react';
import {
  api,
  ApiError,
  type ClinicService,
  type PublicClinicProfessional,
  type ProfessionalServiceLink,
} from '../services/api';
import { getToken } from '../services/authStorage';
import { useAuth } from '../services/AuthProvider';
import styles from './ServicesPanel.module.css';

const SERVICES_KEY = ['clinic-services'] as const;
const PROFESSIONALS_KEY = ['clinic-professionals'] as const;

function formatCents(cents: number | null): string {
  if (cents === null) return '—';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}

function errMsg(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

// ── Professional links sub-panel ──────────────────────────────────────────────

interface ProfLinksProps {
  service: ClinicService;
  token: string;
  allProfessionals: PublicClinicProfessional[];
  isOwner: boolean;
}

function ProfLinksSection({
  service,
  token,
  allProfessionals,
  isOwner,
}: ProfLinksProps): JSX.Element {
  const queryClient = useQueryClient();
  const [addProfId, setAddProfId] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);

  const linksKey = [...SERVICES_KEY, service.id, 'professionals'] as const;

  const linksQuery = useQuery({
    queryKey: linksKey,
    enabled: !!token,
    queryFn: async () => {
      const res = await api.listServiceProfessionals(token, service.id);
      return res.links;
    },
  });

  function invalidateLinks(): void {
    void queryClient.invalidateQueries({ queryKey: linksKey });
  }

  const linkMutation = useMutation({
    mutationFn: (profId: string) =>
      api.linkServiceProfessional(token, service.id, profId),
    onSuccess: () => {
      setAddProfId('');
      setLinkError(null);
      invalidateLinks();
    },
    onError: (err) => setLinkError(errMsg(err, 'Não foi possível vincular.')),
  });

  const unlinkMutation = useMutation({
    mutationFn: ({ profId, active }: { profId: string; active: boolean }) =>
      api.updateServiceProfessionalStatus(token, service.id, profId, active),
    onSuccess: () => {
      setLinkError(null);
      invalidateLinks();
    },
    onError: (err) => setLinkError(errMsg(err, 'Não foi possível alterar vínculo.')),
  });

  const links: ProfessionalServiceLink[] = linksQuery.data ?? [];
  const activeLinks = new Set(links.filter((l) => l.active).map((l) => l.professional_id));

  const availableToAdd = allProfessionals.filter(
    (p) => p.is_active && !activeLinks.has(p.id),
  );

  if (linksQuery.isLoading) {
    return (
      <div className={styles.linksLoading}>
        <Loader2 size={14} className={styles.spin} aria-hidden="true" />
        Carregando vínculos…
      </div>
    );
  }

  return (
    <div className={styles.linksSection}>
      {linkError && (
        <div className={styles.linkError}>
          <AlertCircle size={13} aria-hidden="true" />
          {linkError}
        </div>
      )}

      {links.filter((l) => l.active).length === 0 ? (
        <p className={styles.linksEmpty}>Nenhum profissional vinculado.</p>
      ) : (
        <ul className={styles.linksList}>
          {links
            .filter((l) => l.active)
            .map((link) => {
              const prof = allProfessionals.find((p) => p.id === link.professional_id);
              return (
                <li key={link.professional_id} className={styles.linkItem}>
                  <span className={styles.linkName}>
                    {prof?.name ?? link.professional_id.slice(0, 8) + '…'}
                    {prof?.specialty_label && (
                      <span className={styles.linkLabel}>{prof.specialty_label}</span>
                    )}
                  </span>
                  {isOwner && (
                    <button
                      type="button"
                      className={styles.linkRemoveBtn}
                      title="Desvincular"
                      disabled={unlinkMutation.isPending}
                      onClick={() =>
                        unlinkMutation.mutate({
                          profId: link.professional_id,
                          active: false,
                        })
                      }
                    >
                      <X size={13} aria-hidden="true" />
                    </button>
                  )}
                </li>
              );
            })}
        </ul>
      )}

      {isOwner && availableToAdd.length > 0 && (
        <div className={styles.linkAddRow}>
          <select
            className={styles.linkSelect}
            value={addProfId}
            onChange={(e) => setAddProfId(e.target.value)}
            disabled={linkMutation.isPending}
          >
            <option value="">Vincular profissional…</option>
            {availableToAdd.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.specialty_label ? ` — ${p.specialty_label}` : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={styles.linkAddBtn}
            disabled={!addProfId || linkMutation.isPending}
            onClick={() => {
              if (addProfId) linkMutation.mutate(addProfId);
            }}
          >
            <Check size={13} aria-hidden="true" />
            Vincular
          </button>
        </div>
      )}
    </div>
  );
}

// ── Service card ──────────────────────────────────────────────────────────────

interface ServiceCardProps {
  service: ClinicService;
  token: string;
  allProfessionals: PublicClinicProfessional[];
  isOwner: boolean;
  onMutated: () => void;
}

function ServiceCard({
  service,
  token,
  allProfessionals,
  isOwner,
  onMutated,
}: ServiceCardProps): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [showLinks, setShowLinks] = useState(false);
  const [editName, setEditName] = useState(service.name);
  const [editCategory, setEditCategory] = useState(service.category ?? '');
  const [editDescription, setEditDescription] = useState(service.description ?? '');
  const [editDuration, setEditDuration] = useState(
    service.duration_minutes !== null ? String(service.duration_minutes) : '',
  );
  const [editPrice, setEditPrice] = useState(
    service.price_cents !== null
      ? (service.price_cents / 100).toFixed(2).replace('.', ',')
      : '',
  );
  const [editError, setEditError] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: () => {
      const priceRaw = editPrice.trim().replace(',', '.');
      const price_cents =
        priceRaw === '' ? null : Math.round(parseFloat(priceRaw) * 100);
      const duration_minutes =
        editDuration.trim() === '' ? null : parseInt(editDuration.trim(), 10);
      return api.updateClinicService(token, service.id, {
        name: editName.trim(),
        category: editCategory.trim() || null,
        description: editDescription.trim() || null,
        duration_minutes: isNaN(duration_minutes as number) ? null : duration_minutes,
        price_cents: isNaN(price_cents as number) ? null : price_cents,
      });
    },
    onSuccess: () => {
      setEditing(false);
      setEditError(null);
      onMutated();
    },
    onError: (err) => setEditError(errMsg(err, 'Não foi possível salvar.')),
  });

  const statusMutation = useMutation({
    mutationFn: (active: boolean) =>
      api.updateClinicServiceStatus(token, service.id, active),
    onSuccess: () => onMutated(),
    onError: (err) => setEditError(errMsg(err, 'Não foi possível alterar status.')),
  });

  function cancelEdit(): void {
    setEditing(false);
    setEditError(null);
    setEditName(service.name);
    setEditCategory(service.category ?? '');
    setEditDescription(service.description ?? '');
    setEditDuration(
      service.duration_minutes !== null ? String(service.duration_minutes) : '',
    );
    setEditPrice(
      service.price_cents !== null
        ? (service.price_cents / 100).toFixed(2).replace('.', ',')
        : '',
    );
  }

  return (
    <li className={`${styles.card} ${!service.active ? styles.cardInactive : ''}`}>
      {!editing ? (
        <>
          <div className={styles.cardTop}>
            <div className={styles.cardInfo}>
              <span className={styles.cardName}>{service.name}</span>
              {service.category && (
                <span className={styles.chip}>{service.category}</span>
              )}
              {!service.active && (
                <span className={styles.inactiveChip}>Inativo</span>
              )}
            </div>
            <div className={styles.cardMeta}>
              {service.price_cents !== null && (
                <span className={styles.priceTag}>
                  {formatCents(service.price_cents)}
                </span>
              )}
              {service.duration_minutes !== null && (
                <span className={styles.durationTag}>
                  {service.duration_minutes} min
                </span>
              )}
            </div>
            {isOwner && (
              <div className={styles.cardActions}>
                <button
                  type="button"
                  className={styles.actionBtn}
                  title="Editar"
                  onClick={() => setEditing(true)}
                >
                  <Pencil size={13} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={styles.actionBtn}
                  title={service.active ? 'Desativar' : 'Reativar'}
                  disabled={statusMutation.isPending}
                  onClick={() => statusMutation.mutate(!service.active)}
                >
                  <Power size={13} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={styles.actionBtn}
                  title={showLinks ? 'Ocultar profissionais' : 'Gerenciar profissionais'}
                  onClick={() => setShowLinks((v) => !v)}
                >
                  <Users size={13} aria-hidden="true" />
                  {showLinks ? (
                    <ChevronUp size={11} aria-hidden="true" />
                  ) : (
                    <ChevronDown size={11} aria-hidden="true" />
                  )}
                </button>
              </div>
            )}
          </div>
          {service.description && (
            <p className={styles.cardDescription}>{service.description}</p>
          )}
          {editError && (
            <div className={styles.cardError}>
              <AlertCircle size={13} aria-hidden="true" />
              {editError}
            </div>
          )}
          {showLinks && (
            <ProfLinksSection
              service={service}
              token={token}
              allProfessionals={allProfessionals}
              isOwner={isOwner}
            />
          )}
        </>
      ) : (
        <div className={styles.editForm}>
          <div className={styles.editGrid}>
            <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
              <label className={styles.fieldLabel} htmlFor={`svc-name-${service.id}`}>
                Nome<span className={styles.required}>*</span>
              </label>
              <input
                id={`svc-name-${service.id}`}
                type="text"
                className={styles.input}
                value={editName}
                maxLength={120}
                onChange={(e) => setEditName(e.target.value)}
                disabled={updateMutation.isPending}
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor={`svc-cat-${service.id}`}>
                Categoria
              </label>
              <input
                id={`svc-cat-${service.id}`}
                type="text"
                className={styles.input}
                value={editCategory}
                maxLength={80}
                placeholder="Ex.: Consulta, Sessão, Procedimento…"
                onChange={(e) => setEditCategory(e.target.value)}
                disabled={updateMutation.isPending}
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor={`svc-price-${service.id}`}>
                Preço de tabela (R$)
              </label>
              <input
                id={`svc-price-${service.id}`}
                type="text"
                inputMode="decimal"
                className={styles.input}
                value={editPrice}
                placeholder="0,00"
                onChange={(e) => setEditPrice(e.target.value)}
                disabled={updateMutation.isPending}
              />
              <span className={styles.fieldHint}>Referência visual. Nunca auto-aplicado à cobrança.</span>
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor={`svc-dur-${service.id}`}>
                Duração sugerida (min)
              </label>
              <input
                id={`svc-dur-${service.id}`}
                type="number"
                min={5}
                max={720}
                className={styles.input}
                value={editDuration}
                placeholder="Ex.: 30"
                onChange={(e) => setEditDuration(e.target.value)}
                disabled={updateMutation.isPending}
              />
              <span className={styles.fieldHint}>Sugestão. Nunca preenche horário automaticamente.</span>
            </div>
            <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
              <label className={styles.fieldLabel} htmlFor={`svc-desc-${service.id}`}>
                Descrição
              </label>
              <textarea
                id={`svc-desc-${service.id}`}
                className={`${styles.input} ${styles.textarea}`}
                value={editDescription}
                maxLength={500}
                rows={2}
                placeholder="Descrição administrativa do serviço (sem dados clínicos)."
                onChange={(e) => setEditDescription(e.target.value)}
                disabled={updateMutation.isPending}
              />
            </div>
          </div>
          <div className={styles.editNote}>
            Não inclua diagnóstico, CID, queixa, prescrição ou informações clínicas.
          </div>
          {editError && (
            <div className={styles.cardError}>
              <AlertCircle size={13} aria-hidden="true" />
              {editError}
            </div>
          )}
          <div className={styles.editActions}>
            <button
              type="button"
              className={styles.primaryBtn}
              disabled={updateMutation.isPending || !editName.trim()}
              onClick={() => updateMutation.mutate()}
            >
              <Check size={14} aria-hidden="true" />
              Salvar
            </button>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={cancelEdit}
              disabled={updateMutation.isPending}
            >
              <X size={14} aria-hidden="true" />
              Cancelar
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function ServicesPanel(): JSX.Element {
  const { user } = useAuth();
  const isOwner = user?.papel === 'dono_clinica';
  const queryClient = useQueryClient();
  const token = getToken();

  const [showInactive, setShowInactive] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newDuration, setNewDuration] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: [...SERVICES_KEY, 'list', showInactive],
    enabled: !!token,
    queryFn: async () => {
      const res = await api.listClinicServices(token as string, {
        active: showInactive ? undefined : true,
        limit: 100,
      });
      return res.services;
    },
  });

  const professionalsQuery = useQuery({
    queryKey: [...PROFESSIONALS_KEY, 'all'],
    enabled: !!token && isOwner,
    queryFn: async () => {
      const res = await api.listClinicProfessionals(token as string);
      return res.professionals;
    },
  });

  function invalidateServices(): void {
    void queryClient.invalidateQueries({ queryKey: SERVICES_KEY });
  }

  const createMutation = useMutation({
    mutationFn: () => {
      const priceRaw = newPrice.trim().replace(',', '.');
      const price_cents =
        priceRaw === '' ? null : Math.round(parseFloat(priceRaw) * 100);
      const duration_minutes =
        newDuration.trim() === '' ? null : parseInt(newDuration.trim(), 10);
      return api.createClinicService(token as string, {
        name: newName.trim(),
        category: newCategory.trim() || null,
        description: newDescription.trim() || null,
        duration_minutes: isNaN(duration_minutes as number) ? null : duration_minutes,
        price_cents: isNaN(price_cents as number) ? null : price_cents,
      });
    },
    onSuccess: () => {
      setNotice('Serviço criado.');
      setNewName('');
      setNewCategory('');
      setNewDescription('');
      setNewDuration('');
      setNewPrice('');
      setShowCreateForm(false);
      setCreateError(null);
      invalidateServices();
    },
    onError: (err) => setCreateError(errMsg(err, 'Não foi possível criar o serviço.')),
  });

  const services: ClinicService[] = listQuery.data ?? [];
  const allProfessionals: PublicClinicProfessional[] =
    professionalsQuery.data ?? [];

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <h3 className={styles.title}>
          <Briefcase size={18} aria-hidden="true" />
          Serviços
          <span className={styles.categoryChip}>Catálogo comercial</span>
        </h3>
        <div className={styles.headActions}>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => setShowInactive((v) => !v)}
          >
            {showInactive ? 'Ocultar inativos' : 'Mostrar inativos'}
          </button>
          {isOwner && !showCreateForm && (
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => {
                setShowCreateForm(true);
                setCreateError(null);
              }}
            >
              <Plus size={15} aria-hidden="true" />
              Novo serviço
            </button>
          )}
        </div>
      </div>

      <p className={styles.subtitle}>
        Cadastre os tipos de atendimento da clínica, como consulta, retorno, sessão ou
        avaliação. Eles aparecem no seletor da agenda e das cobranças e ajudam nos relatórios.
      </p>

      {notice && <div className={styles.notice}>{notice}</div>}

      {listQuery.isError && (
        <div className={styles.fetchError}>
          <AlertCircle size={15} aria-hidden="true" />
          Não foi possível carregar os serviços.
          <button
            type="button"
            className={styles.refetchBtn}
            onClick={() => void listQuery.refetch()}
          >
            Tentar novamente
          </button>
        </div>
      )}

      {showCreateForm && (
        <div className={styles.createCard}>
          <div className={styles.createGrid}>
            <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
              <label className={styles.fieldLabel} htmlFor="svc-new-name">
                Nome<span className={styles.required}>*</span>
              </label>
              <input
                id="svc-new-name"
                type="text"
                className={styles.input}
                value={newName}
                maxLength={120}
                placeholder="Ex.: Consulta inicial, Sessão de fisio, Retorno…"
                onChange={(e) => setNewName(e.target.value)}
                disabled={createMutation.isPending}
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="svc-new-cat">
                Categoria
              </label>
              <input
                id="svc-new-cat"
                type="text"
                className={styles.input}
                value={newCategory}
                maxLength={80}
                placeholder="Ex.: Consulta, Sessão, Procedimento, Exame, Outro"
                onChange={(e) => setNewCategory(e.target.value)}
                disabled={createMutation.isPending}
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="svc-new-price">
                Preço de tabela (R$)
              </label>
              <input
                id="svc-new-price"
                type="text"
                inputMode="decimal"
                className={styles.input}
                value={newPrice}
                placeholder="0,00"
                onChange={(e) => setNewPrice(e.target.value)}
                disabled={createMutation.isPending}
              />
              <span className={styles.fieldHint}>Referência visual. Nunca auto-aplicado à cobrança.</span>
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="svc-new-duration">
                Duração sugerida (min)
              </label>
              <input
                id="svc-new-duration"
                type="number"
                min={5}
                max={720}
                className={styles.input}
                value={newDuration}
                placeholder="Ex.: 30"
                onChange={(e) => setNewDuration(e.target.value)}
                disabled={createMutation.isPending}
              />
              <span className={styles.fieldHint}>Sugestão. Nunca preenche horário automaticamente.</span>
            </div>
            <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
              <label className={styles.fieldLabel} htmlFor="svc-new-desc">
                Descrição
              </label>
              <textarea
                id="svc-new-desc"
                className={`${styles.input} ${styles.textarea}`}
                value={newDescription}
                maxLength={500}
                rows={2}
                placeholder="Descrição administrativa do serviço (sem dados clínicos)."
                onChange={(e) => setNewDescription(e.target.value)}
                disabled={createMutation.isPending}
              />
            </div>
          </div>
          <div className={styles.editNote}>
            Não inclua diagnóstico, CID, queixa, prescrição ou informações clínicas.
          </div>
          {createError && (
            <div className={styles.createError}>
              <AlertCircle size={14} aria-hidden="true" />
              {createError}
            </div>
          )}
          <div className={styles.createActions}>
            <button
              type="button"
              className={styles.primaryBtn}
              disabled={createMutation.isPending || !newName.trim()}
              onClick={() => createMutation.mutate()}
            >
              <Check size={14} aria-hidden="true" />
              Criar serviço
            </button>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => {
                setShowCreateForm(false);
                setCreateError(null);
              }}
              disabled={createMutation.isPending}
            >
              <X size={14} aria-hidden="true" />
              Cancelar
            </button>
          </div>
        </div>
      )}

      {listQuery.isLoading && (
        <div className={styles.loading}>
          <Loader2 size={16} className={styles.spin} aria-hidden="true" />
          Carregando serviços…
        </div>
      )}

      {!listQuery.isLoading && !listQuery.isError && services.length === 0 && (
        <div className={styles.empty}>
          {showInactive
            ? 'Nenhum serviço cadastrado.'
            : 'Nenhum serviço ativo. Clique em "Novo serviço" para cadastrar.'}
        </div>
      )}

      {services.length > 0 && (
        <ul className={styles.list} data-tour-id="services-list">
          {services.map((svc) => (
            <ServiceCard
              key={svc.id}
              service={svc}
              token={token as string}
              allProfessionals={allProfessionals}
              isOwner={isOwner}
              onMutated={invalidateServices}
            />
          ))}
        </ul>
      )}

      {!isOwner && (
        <p className={styles.roleNote}>
          Apenas o(a) dono(a) da clínica pode criar ou editar serviços.
        </p>
      )}
    </div>
  );
}
