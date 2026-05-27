// ClinicalPatientPane — Sprint 4.2C (ADR 0010).
// Full-screen right-side drawer showing the clinical timeline + detail for one
// patient. Uses TanStack Query for data fetching; all clinical content stays in
// memory only — never logged, never stored in localStorage/sessionStorage, never
// in URL params.
//
// SECURITY invariants:
//   - 403 from any clinical endpoint → friendly generic message; content never
//     assumed to exist or not exist based on the error alone.
//   - internal_note null → treated as "not visible"; no misleading placeholder.
//   - Text content rendered as plain text only (no dangerouslySetInnerHTML).
//   - No console.log calls with clinical data.
import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X,
  ChevronLeft,
  Eye,
  Plus,
  Ban,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  FileText,
} from 'lucide-react';
import {
  api,
  ApiError,
  type PublicPatient,
  type PublicClinicalEncounterListItem,
  type PublicClinicalEncounter,
  type PublicClinicalNote,
  type ClinicalCancelReasonCode,
  type ClinicalNoteRectifyCode,
} from '../services/api';
import { getToken } from '../services/authStorage';
import { useAuth } from '../services/AuthProvider';
import { ClinicalDocumentsPanel } from './ClinicalDocumentsPanel';
import styles from './ClinicalPatientPane.module.css';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function isClinicalForbidden(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 403 || err.status === 401);
}

function clinicalErrorMessage(err: unknown): string {
  if (isClinicalForbidden(err)) {
    return 'Você não tem permissão para acessar o prontuário deste paciente.';
  }
  if (err instanceof ApiError) return err.message;
  return 'Não foi possível carregar os dados clínicos. Tente novamente.';
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Ativo',
  canceled: 'Cancelado',
};

const CANCEL_REASONS: { value: ClinicalCancelReasonCode; label: string }[] = [
  { value: 'duplicated', label: 'Atendimento duplicado' },
  { value: 'wrong_patient', label: 'Paciente incorreto' },
  { value: 'data_error', label: 'Erro de dados' },
  { value: 'other', label: 'Outro' },
];

const RECTIFY_REASONS: { value: ClinicalNoteRectifyCode; label: string }[] = [
  { value: 'typo', label: 'Erro de digitação' },
  { value: 'clinical_correction', label: 'Correção do conteúdo clínico' },
  { value: 'add_info', label: 'Acrescentar informação' },
  { value: 'other', label: 'Outro' },
];

// ─── Sub-view types ───────────────────────────────────────────────────────────

type PaneView =
  | { kind: 'timeline' }
  | { kind: 'detail'; encounterId: string }
  | { kind: 'new-encounter' }
  | { kind: 'new-note'; encounterId: string; revisesNoteId: string | null };

// ─── ClinicalEncounterDetail ──────────────────────────────────────────────────

interface DetailProps {
  encounterId: string;
  currentUserId: string;
  onAddNote: (encounterId: string) => void;
  onRectifyNote: (encounterId: string, noteId: string) => void;
}

function ClinicalEncounterDetail({
  encounterId,
  currentUserId,
  onAddNote,
  onRectifyNote,
}: DetailProps): JSX.Element {
  const token = getToken();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['clinicalEncounterDetail', encounterId],
    queryFn: () => api.getClinicalEncounterDetail(token!, encounterId),
    enabled: !!token,
    staleTime: 0,
  });

  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelCode, setCancelCode] = useState<ClinicalCancelReasonCode>('data_error');
  const [cancelText, setCancelText] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);

  const cancelMutation = useMutation({
    mutationFn: (payload: { reason_code: ClinicalCancelReasonCode; reason_text?: string | null }) =>
      api.cancelClinicalEncounter(token!, encounterId, payload),
    onSuccess: () => {
      setShowCancelForm(false);
      setCancelText('');
      setCancelError(null);
      void queryClient.invalidateQueries({ queryKey: ['clinicalEncounterDetail', encounterId] });
      void queryClient.invalidateQueries({ queryKey: ['clinicalTimeline'] });
    },
    onError: (err: unknown) => {
      setCancelError(clinicalErrorMessage(err));
    },
  });

  if (isLoading) {
    return (
      <p className={styles.stateMsg}>
        <Loader2 size={16} className={styles.spin} aria-hidden="true" />
        Carregando atendimento…
      </p>
    );
  }

  if (error) {
    return <p className={styles.errorMsg}>{clinicalErrorMessage(error)}</p>;
  }

  if (!data) return <p className={styles.stateMsg}>Atendimento não encontrado.</p>;

  const { encounter, notes } = data;
  const isActive = encounter.status === 'active';
  const isAuthor = encounter.attending_user_id === currentUserId;

  return (
    <div className={styles.form}>
      <div className={styles.detailHeader}>
        <div className={styles.detailMeta}>
          <p className={styles.detailDate}>
            {formatDateTime(encounter.started_at)}
          </p>
          <p className={styles.detailSubMeta}>
            <span
              className={`${styles.statusBadge} ${isActive ? styles.statusActive : styles.statusCanceled}`}
            >
              {STATUS_LABELS[encounter.status] ?? encounter.status}
            </span>
            {encounter.ended_at && (
              <> · Término: {formatDateTime(encounter.ended_at)}</>
            )}
          </p>
        </div>

        {isActive && isAuthor && !showCancelForm && (
          <div className={styles.detailActions}>
            <button
              type="button"
              className={styles.addNoteBtn}
              onClick={() => onAddNote(encounterId)}
            >
              <Plus size={14} aria-hidden="true" />
              Adicionar anotação
            </button>
            <button
              type="button"
              className={styles.cancelEncBtn}
              onClick={() => { setShowCancelForm(true); setCancelError(null); }}
            >
              <Ban size={14} aria-hidden="true" />
              Cancelar atendimento
            </button>
          </div>
        )}
      </div>

      {encounter.cancel_reason_code && (
        <p className={styles.errorMsg} role="status">
          Motivo de cancelamento:{' '}
          {CANCEL_REASONS.find((r) => r.value === encounter.cancel_reason_code)?.label ??
            encounter.cancel_reason_code}
        </p>
      )}

      <hr className={styles.notesDivider} />

      <p className={styles.sectionLabel}>
        Anotações do atendimento ({notes.length})
      </p>

      {notes.length === 0 ? (
        <p className={styles.emptyMsg}>
          Nenhuma anotação registrada neste atendimento.
        </p>
      ) : (
        <ul className={styles.encounterList}>
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              currentUserId={currentUserId}
              isEncounterActive={isActive}
              onRectify={(noteId) => onRectifyNote(encounterId, noteId)}
            />
          ))}
        </ul>
      )}

      {/* Inline cancel form — shown in-place; no modal needed */}
      {showCancelForm && (
        <div className={styles.cancelSection}>
          <p className={styles.formTitle}>Cancelar atendimento</p>
          <p className={styles.cancelWarning}>
            Atendimentos cancelados não podem ser reabertos. Selecione o motivo abaixo.
          </p>
          <label className={styles.formField}>
            <span className={styles.formLabel}>Motivo *</span>
            <select
              className={styles.formSelect}
              value={cancelCode}
              onChange={(e) => setCancelCode(e.target.value as ClinicalCancelReasonCode)}
              disabled={cancelMutation.isPending}
            >
              {CANCEL_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.formField}>
            <span className={styles.formLabel}>Observação (opcional, máx. 200 caracteres)</span>
            <textarea
              className={styles.formTextarea}
              value={cancelText}
              onChange={(e) => setCancelText(e.target.value)}
              maxLength={200}
              rows={2}
              disabled={cancelMutation.isPending}
              placeholder="Detalhe opcional sobre o cancelamento"
            />
          </label>
          {cancelError && <p className={styles.formError}>{cancelError}</p>}
          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.cancelEncBtn}
              style={{ padding: '0.55rem 1.1rem' }}
              disabled={cancelMutation.isPending}
              onClick={() =>
                cancelMutation.mutate({
                  reason_code: cancelCode,
                  reason_text: cancelText.trim() || null,
                })
              }
            >
              {cancelMutation.isPending && (
                <Loader2 size={14} className={styles.spin} aria-hidden="true" />
              )}
              Confirmar cancelamento
            </button>
            <button
              type="button"
              className={styles.cancelFormBtn}
              disabled={cancelMutation.isPending}
              onClick={() => {
                if (!cancelMutation.isPending) {
                  setShowCancelForm(false);
                  setCancelError(null);
                }
              }}
            >
              Voltar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── NoteCard ─────────────────────────────────────────────────────────────────

interface NoteCardProps {
  note: PublicClinicalNote;
  currentUserId: string;
  isEncounterActive: boolean;
  onRectify: (noteId: string) => void;
}

function NoteCard({ note, currentUserId, isEncounterActive, onRectify }: NoteCardProps): JSX.Element {
  const isAuthor = note.author_user_id === currentUserId;
  const isRectification = note.revises_note_id !== null;

  return (
    <li className={styles.noteCard}>
      <div className={styles.noteCardHead}>
        <span className={styles.noteAuthor}>
          {isAuthor ? 'Você' : 'Outro profissional'}
          {isRectification && (
            <span className={styles.rectifyBadge} style={{ marginLeft: '0.4rem' }}>
              Correção
            </span>
          )}
        </span>
        <span className={styles.noteDate}>{formatDateTime(note.created_at)}</span>
      </div>

      {note.chief_complaint && (
        <div className={styles.noteField}>
          <span className={styles.noteFieldLabel}>Queixa principal</span>
          <span className={styles.noteFieldValue}>{note.chief_complaint}</span>
        </div>
      )}
      {note.anamnesis && (
        <div className={styles.noteField}>
          <span className={styles.noteFieldLabel}>Anamnese / histórico do paciente</span>
          <span className={styles.noteFieldValue}>{note.anamnesis}</span>
        </div>
      )}
      {note.evolution && (
        <div className={styles.noteField}>
          <span className={styles.noteFieldLabel}>Evolução / Observações</span>
          <span className={styles.noteFieldValue}>{note.evolution}</span>
        </div>
      )}
      {note.plan && (
        <div className={styles.noteField}>
          <span className={styles.noteFieldLabel}>Conduta / Orientações</span>
          <span className={styles.noteFieldValue}>{note.plan}</span>
        </div>
      )}
      {note.internal_note !== null && (
        <div className={styles.noteField}>
          <span className={styles.noteFieldLabel}>Nota privada (só você e supervisores)</span>
          <span className={styles.noteFieldValue}>{note.internal_note}</span>
        </div>
      )}

      {isEncounterActive && isAuthor && (
        <div>
          <button
            type="button"
            className={styles.detailBtn}
            onClick={() => onRectify(note.id)}
          >
            Corrigir anotação
          </button>
        </div>
      )}
    </li>
  );
}

// ─── ClinicalEncounterForm ────────────────────────────────────────────────────

interface EncounterFormProps {
  patientId: string;
  onCreated: (enc: PublicClinicalEncounter) => void;
  onCancel: () => void;
}

function ClinicalEncounterForm({ patientId, onCreated, onCancel }: EncounterFormProps): JSX.Element {
  const token = getToken();
  const queryClient = useQueryClient();

  const nowLocal = (): string => {
    const d = new Date();
    d.setSeconds(0, 0);
    return d.toISOString().slice(0, 16);
  };

  const [startedAt, setStartedAt] = useState(nowLocal);
  const [endedAt, setEndedAt] = useState('');
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [anamnesis, setAnamnesis] = useState('');
  const [evolution, setEvolution] = useState('');
  const [plan, setPlan] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const hasInitialNote =
        chiefComplaint.trim() ||
        anamnesis.trim() ||
        evolution.trim() ||
        plan.trim() ||
        internalNote.trim();

      return api.createClinicalEncounter(token!, {
        patient_id: patientId,
        started_at: new Date(startedAt).toISOString(),
        ended_at: endedAt ? new Date(endedAt).toISOString() : null,
        initial_note: hasInitialNote
          ? {
              chief_complaint: chiefComplaint.trim() || null,
              anamnesis: anamnesis.trim() || null,
              evolution: evolution.trim() || null,
              plan: plan.trim() || null,
              internal_note: internalNote.trim() || null,
            }
          : null,
      });
    },
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['clinicalTimeline'] });
      onCreated(res.encounter);
    },
    onError: (err: unknown) => {
      setFormError(clinicalErrorMessage(err));
    },
  });

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (!startedAt) {
      setFormError('Informe a data/hora de início do atendimento.');
      return;
    }
    setFormError(null);
    mutation.mutate();
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <p className={styles.formTitle}>Novo atendimento</p>

      <div className={styles.formRow}>
        <label className={styles.formField}>
          <span className={styles.formLabel}>Data/hora de início *</span>
          <input
            type="datetime-local"
            className={styles.formInput}
            value={startedAt}
            onChange={(e) => setStartedAt(e.target.value)}
            required
            disabled={mutation.isPending}
          />
        </label>
        <label className={styles.formField}>
          <span className={styles.formLabel}>Data/hora de término</span>
          <input
            type="datetime-local"
            className={styles.formInput}
            value={endedAt}
            onChange={(e) => setEndedAt(e.target.value)}
            disabled={mutation.isPending}
          />
        </label>
      </div>

      <p className={styles.sectionLabel} style={{ marginTop: '0.25rem' }}>
        Anotação inicial — opcional
      </p>
      <p className={styles.formHint}>
        Você pode salvar o atendimento agora e preencher as anotações depois.
      </p>

      <label className={styles.formField}>
        <span className={styles.formLabel}>Queixa principal</span>
        <textarea
          className={styles.formTextarea}
          value={chiefComplaint}
          onChange={(e) => setChiefComplaint(e.target.value)}
          maxLength={2000}
          rows={2}
          disabled={mutation.isPending}
          placeholder="Motivo da consulta relatado pelo paciente"
        />
      </label>

      <label className={styles.formField}>
        <span className={styles.formLabel}>Anamnese / histórico do paciente</span>
        <textarea
          className={styles.formTextarea}
          value={anamnesis}
          onChange={(e) => setAnamnesis(e.target.value)}
          maxLength={8000}
          rows={3}
          disabled={mutation.isPending}
          placeholder="História clínica relevante"
        />
      </label>

      <label className={styles.formField}>
        <span className={styles.formLabel}>Evolução / Observações</span>
        <textarea
          className={styles.formTextarea}
          value={evolution}
          onChange={(e) => setEvolution(e.target.value)}
          maxLength={8000}
          rows={3}
          disabled={mutation.isPending}
          placeholder="Evolução do quadro clínico"
        />
      </label>

      <label className={styles.formField}>
        <span className={styles.formLabel}>Conduta / Orientações</span>
        <textarea
          className={styles.formTextarea}
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          maxLength={4000}
          rows={3}
          disabled={mutation.isPending}
          placeholder="Condutas tomadas e orientações ao paciente"
        />
      </label>

      <label className={styles.formField}>
        <span className={styles.formLabel}>Nota privada (só você e supervisores)</span>
        <textarea
          className={styles.formTextarea}
          value={internalNote}
          onChange={(e) => setInternalNote(e.target.value)}
          maxLength={2000}
          rows={2}
          disabled={mutation.isPending}
          placeholder="Anotação privada. Não é visível a outros profissionais."
        />
      </label>

      {formError && <p className={styles.formError}>{formError}</p>}

      <div className={styles.formActions}>
        <button type="submit" className={styles.submitBtn} disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 size={14} className={styles.spin} aria-hidden="true" />}
          Criar atendimento
        </button>
        <button
          type="button"
          className={styles.cancelFormBtn}
          onClick={onCancel}
          disabled={mutation.isPending}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ─── ClinicalNoteForm ─────────────────────────────────────────────────────────

interface NoteFormProps {
  encounterId: string;
  revisesNoteId: string | null;
  onCreated: () => void;
  onCancel: () => void;
}

function ClinicalNoteForm({ encounterId, revisesNoteId, onCreated, onCancel }: NoteFormProps): JSX.Element {
  const token = getToken();
  const queryClient = useQueryClient();

  const [chiefComplaint, setChiefComplaint] = useState('');
  const [anamnesis, setAnamnesis] = useState('');
  const [evolution, setEvolution] = useState('');
  const [plan, setPlan] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [rectifyCode, setRectifyCode] = useState<ClinicalNoteRectifyCode>('clinical_correction');
  const [formError, setFormError] = useState<string | null>(null);

  const isRectify = revisesNoteId !== null;

  const mutation = useMutation({
    mutationFn: () => {
      const hasContent =
        chiefComplaint.trim() ||
        anamnesis.trim() ||
        evolution.trim() ||
        plan.trim() ||
        internalNote.trim();

      if (!hasContent) {
        throw new Error('Preencha ao menos um dos campos da anotação.');
      }

      return api.addClinicalNote(token!, encounterId, {
        chief_complaint: chiefComplaint.trim() || null,
        anamnesis: anamnesis.trim() || null,
        evolution: evolution.trim() || null,
        plan: plan.trim() || null,
        internal_note: internalNote.trim() || null,
        revises_note_id: revisesNoteId,
        rectification_reason_code: isRectify ? rectifyCode : null,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['clinicalEncounterDetail', encounterId] });
      onCreated();
    },
    onError: (err: unknown) => {
      if (err instanceof Error && !(err instanceof ApiError)) {
        setFormError(err.message);
      } else {
        setFormError(clinicalErrorMessage(err));
      }
    },
  });

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    setFormError(null);
    mutation.mutate();
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <p className={styles.formTitle}>
        {isRectify ? 'Corrigir anotação' : 'Adicionar anotação'}
      </p>

      {isRectify && (
        <label className={styles.formField}>
          <span className={styles.formLabel}>Motivo da correção *</span>
          <select
            className={styles.formSelect}
            value={rectifyCode}
            onChange={(e) => setRectifyCode(e.target.value as ClinicalNoteRectifyCode)}
            disabled={mutation.isPending}
          >
            {RECTIFY_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className={styles.formField}>
        <span className={styles.formLabel}>Queixa principal</span>
        <textarea
          className={styles.formTextarea}
          value={chiefComplaint}
          onChange={(e) => setChiefComplaint(e.target.value)}
          maxLength={2000}
          rows={2}
          disabled={mutation.isPending}
          placeholder="Motivo da consulta relatado pelo paciente"
        />
      </label>

      <label className={styles.formField}>
        <span className={styles.formLabel}>Anamnese / histórico do paciente</span>
        <textarea
          className={styles.formTextarea}
          value={anamnesis}
          onChange={(e) => setAnamnesis(e.target.value)}
          maxLength={8000}
          rows={3}
          disabled={mutation.isPending}
          placeholder="História clínica relevante"
        />
      </label>

      <label className={styles.formField}>
        <span className={styles.formLabel}>Evolução / Observações</span>
        <textarea
          className={styles.formTextarea}
          value={evolution}
          onChange={(e) => setEvolution(e.target.value)}
          maxLength={8000}
          rows={3}
          disabled={mutation.isPending}
          placeholder="Evolução do quadro clínico"
        />
      </label>

      <label className={styles.formField}>
        <span className={styles.formLabel}>Conduta / Orientações</span>
        <textarea
          className={styles.formTextarea}
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          maxLength={4000}
          rows={3}
          disabled={mutation.isPending}
          placeholder="Condutas tomadas e orientações ao paciente"
        />
      </label>

      <label className={styles.formField}>
        <span className={styles.formLabel}>Nota privada (só você e supervisores)</span>
        <textarea
          className={styles.formTextarea}
          value={internalNote}
          onChange={(e) => setInternalNote(e.target.value)}
          maxLength={2000}
          rows={2}
          disabled={mutation.isPending}
          placeholder="Anotação privada. Não é visível a outros profissionais."
        />
      </label>

      <p className={styles.formHint}>
        Pelo menos um dos campos acima precisa estar preenchido.
      </p>

      {formError && <p className={styles.formError}>{formError}</p>}

      <div className={styles.formActions}>
        <button type="submit" className={styles.submitBtn} disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 size={14} className={styles.spin} aria-hidden="true" />}
          {isRectify ? 'Salvar correção' : 'Salvar anotação'}
        </button>
        <button
          type="button"
          className={styles.cancelFormBtn}
          onClick={onCancel}
          disabled={mutation.isPending}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ─── ClinicalPatientPane (main) ───────────────────────────────────────────────

export interface ClinicalPatientPaneProps {
  patient: PublicPatient;
  open: boolean;
  onClose: () => void;
}

export function ClinicalPatientPane({ patient, open, onClose }: ClinicalPatientPaneProps): JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { user } = useAuth();
  const token = getToken();

  const [view, setView] = useState<PaneView>({ kind: 'timeline' });
  const [activeTab, setActiveTab] = useState<'encounters' | 'documents'>('encounters');

  // Sync open state with the native <dialog>
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      setView({ kind: 'timeline' });
      setActiveTab('encounters');
    }
    if (!open && el.open) {
      el.close();
    }
  }, [open]);

  // ESC key — let native dialog handle it, then call onClose
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const handler = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    el.addEventListener('cancel', handler);
    return () => el.removeEventListener('cancel', handler);
  }, [onClose]);

  const timelineQuery = useQuery({
    queryKey: ['clinicalTimeline', patient.id],
    queryFn: () => api.listClinicalTimeline(token!, patient.id),
    enabled: open && !!token,
    staleTime: 0,
  });

  function goTimeline(): void {
    setView({ kind: 'timeline' });
  }

  function handleEncounterCreated(enc: PublicClinicalEncounter): void {
    setView({ kind: 'detail', encounterId: enc.id });
  }

  // Header title / back button per view
  function viewTitle(): string {
    switch (view.kind) {
      case 'timeline': return 'Prontuário';
      case 'detail': return 'Detalhe do atendimento';
      case 'new-encounter': return 'Novo atendimento';
      case 'new-note': return view.revisesNoteId ? 'Corrigir anotação' : 'Adicionar anotação';
    }
  }

  const showBack = view.kind !== 'timeline';

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-label={`Prontuário — ${patient.nome}`}
      aria-modal="true"
    >
      <div className={styles.pane}>
        {/* Header */}
        <div className={styles.paneHeader}>
          {showBack && (
            <button type="button" className={styles.backBtn} onClick={goTimeline}>
              <ChevronLeft size={15} aria-hidden="true" />
              Voltar
            </button>
          )}
          <div className={styles.paneTitle}>
            <p className={styles.paneTitleMain}>{viewTitle()}</p>
            <p className={styles.paneTitleSub}>{patient.nome}</p>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Fechar painel clínico"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className={styles.paneBody}>
          {/* Audit notice — always visible. Protective tone (ShieldCheck), not alarming. */}
          <p className={styles.auditNotice}>
            <ShieldCheck size={15} aria-hidden="true" />
            Acessos ao prontuário são registrados para conformidade com a LGPD.
          </p>

          {/* Tab switcher — only visible in the top-level (timeline) view */}
          {view.kind === 'timeline' && (
            <div className={styles.tabBar}>
              <button
                type="button"
                className={`${styles.tabBtn} ${activeTab === 'encounters' ? styles.tabBtnActive : ''}`}
                onClick={() => setActiveTab('encounters')}
              >
                Atendimentos
              </button>
              <button
                type="button"
                className={`${styles.tabBtn} ${activeTab === 'documents' ? styles.tabBtnActive : ''}`}
                onClick={() => setActiveTab('documents')}
              >
                Documentos
              </button>
            </div>
          )}

          {view.kind === 'timeline' && activeTab === 'encounters' && (
            <TimelineView
              encounters={timelineQuery.data?.encounters ?? []}
              isLoading={timelineQuery.isLoading}
              error={timelineQuery.error}
              onOpenDetail={(id) => setView({ kind: 'detail', encounterId: id })}
              onNewEncounter={() => setView({ kind: 'new-encounter' })}
            />
          )}

          {view.kind === 'timeline' && activeTab === 'documents' && (
            <ClinicalDocumentsPanel patientId={patient.id} />
          )}

          {view.kind === 'new-encounter' && (
            <ClinicalEncounterForm
              patientId={patient.id}
              onCreated={handleEncounterCreated}
              onCancel={goTimeline}
            />
          )}

          {view.kind === 'detail' && (
            <ClinicalEncounterDetail
              encounterId={view.encounterId}
              currentUserId={user?.id ?? ''}
              onAddNote={(encId) =>
                setView({ kind: 'new-note', encounterId: encId, revisesNoteId: null })
              }
              onRectifyNote={(encId, noteId) =>
                setView({ kind: 'new-note', encounterId: encId, revisesNoteId: noteId })
              }
            />
          )}

          {view.kind === 'new-note' && (
            <ClinicalNoteForm
              encounterId={view.encounterId}
              revisesNoteId={view.revisesNoteId}
              onCreated={() => setView({ kind: 'detail', encounterId: view.encounterId })}
              onCancel={() => setView({ kind: 'detail', encounterId: view.encounterId })}
            />
          )}
        </div>
      </div>
    </dialog>
  );
}

// ─── TimelineView (inline sub-component) ─────────────────────────────────────

interface TimelineViewProps {
  encounters: PublicClinicalEncounterListItem[];
  isLoading: boolean;
  error: unknown;
  onOpenDetail: (id: string) => void;
  onNewEncounter: () => void;
}

function TimelineView({
  encounters,
  isLoading,
  error,
  onOpenDetail,
  onNewEncounter,
}: TimelineViewProps): JSX.Element {
  if (isLoading) {
    return (
      <p className={styles.stateMsg}>
        <Loader2 size={16} className={styles.spin} aria-hidden="true" />
        Carregando histórico de atendimentos…
      </p>
    );
  }

  if (error) {
    if (isClinicalForbidden(error)) {
      return (
        <div className={styles.forbiddenMsg} role="status">
          <p>
            <ShieldAlert size={16} style={{ display: 'inline', marginRight: '0.4rem' }} aria-hidden="true" />
            Você não tem permissão para acessar o prontuário deste paciente.
          </p>
        </div>
      );
    }
    return <p className={styles.errorMsg}>{clinicalErrorMessage(error)}</p>;
  }

  return (
    <>
      <div className={styles.timelineHead}>
        <span className={styles.sectionLabel}>
          <FileText size={13} style={{ display: 'inline', marginRight: '0.3rem' }} aria-hidden="true" />
          Atendimentos ({encounters.length})
        </span>
        {/* Show "Novo atendimento" for dono_clinica (needs explicit grant)
            and for all other users — backend decides access */}
        <button type="button" className={styles.newBtn} onClick={onNewEncounter}>
          <Plus size={14} aria-hidden="true" />
          Novo atendimento
        </button>
      </div>

      {encounters.length === 0 ? (
        <p className={styles.emptyMsg}>
          Este paciente ainda não tem atendimentos registrados.
        </p>
      ) : (
        <ul className={styles.encounterList}>
          {encounters.map((enc) => (
            <li key={enc.id} className={styles.encounterCard}>
              <div className={styles.encounterMeta}>
                <p className={styles.encounterDate}>{formatDate(enc.started_at)}</p>
                <p className={styles.encounterTime}>{new Date(enc.started_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                <span
                  className={`${styles.statusBadge} ${enc.status === 'active' ? styles.statusActive : styles.statusCanceled}`}
                >
                  {STATUS_LABELS[enc.status] ?? enc.status}
                </span>
              </div>
              <button
                type="button"
                className={styles.detailBtn}
                onClick={() => onOpenDetail(enc.id)}
              >
                <Eye size={13} aria-hidden="true" />
                Ver detalhes
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
