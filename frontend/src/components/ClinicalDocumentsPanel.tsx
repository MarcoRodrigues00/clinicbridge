// ClinicalDocumentsPanel — Sprint 4.3C (ADR 0011).
// Self-contained panel for listing, creating, viewing, and managing clinical
// documents within the ClinicalPatientPane drawer.
//
// SECURITY invariants:
//   - body/metadata_json never logged, never in localStorage/sessionStorage,
//     never in URL params.
//   - staleTime: 0 for all clinical content queries.
//   - PDF downloaded via Authorization header; token never in URL.
//   - 401/403 shown as generic message; no dangerouslySetInnerHTML.
//   - Backend is the security boundary; frontend only improves UX.
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Plus, Eye, Loader2, Download, HelpCircle } from 'lucide-react';
import { GuidedDemoTour, DOCUMENTS_TOUR_STEPS } from './GuidedDemoTour';
import { useAuth } from '../services/AuthProvider';
import {
  api,
  ApiError,
  type ClinicalDocumentType,
  type ClinicalDocumentStatus,
  type ClinicalDocumentCancelReasonCode,
  type PublicClinicalDocumentListItem,
  type PublicClinicalDocument,
} from '../services/api';
import { getToken } from '../services/authStorage';
import styles from './ClinicalDocumentsPanel.module.css';

// ─── Constants ────────────────────────────────────────────────────────────────

const DOC_TYPE_LABELS: Record<ClinicalDocumentType, string> = {
  receipt_simple: 'Receita simples',
  attestation: 'Atestado médico',
  declaration: 'Declaração de comparecimento',
  exam_request: 'Solicitação de exame',
  orientation: 'Orientação',
};

const DOC_STATUS_LABELS: Record<ClinicalDocumentStatus, string> = {
  draft: 'Rascunho',
  finalized: 'Finalizado',
  canceled: 'Cancelado',
};

const CANCEL_REASONS: { value: ClinicalDocumentCancelReasonCode; label: string }[] = [
  { value: 'error', label: 'Erro de preenchimento' },
  { value: 'duplicate', label: 'Documento duplicado' },
  { value: 'patient_request', label: 'Solicitação do paciente' },
  { value: 'other', label: 'Outro' },
];

const DOC_TYPES: ClinicalDocumentType[] = [
  'receipt_simple',
  'attestation',
  'declaration',
  'exam_request',
  'orientation',
];

// ADR 0011 §10.2 — updated copy Sprint 4.3C final.
const LEGAL_DISCLAIMER =
  'Baixe o PDF e assine externamente com certificado digital ICP-Brasil/GOV.BR ou ' +
  'ferramenta compatível. Depois, valide o arquivo assinado no VALIDAR oficial Gov.br/ITI. ' +
  'O ClinicBridge ainda não realiza assinatura digital dentro do sistema.';

const PDF_UNSIGNED_NOTE = 'O PDF baixado ainda não sai assinado pelo ClinicBridge.';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function docErrorMessage(err: unknown): string {
  if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
    return 'Você não tem permissão para acessar documentos deste paciente.';
  }
  if (err instanceof ApiError) return err.message;
  return 'Não foi possível carregar os dados. Tente novamente.';
}

// ─── SignGuide ────────────────────────────────────────────────────────────────

// Passo a passo para assinar externamente e validar no Gov.br/ITI.
// Sem integração de assinatura; sem QR Code; sem upload de PDF assinado.
// Guia visual com prints: futuro (depende de capturas oficiais/ambiente).
function SignGuide({ onClose }: { onClose: () => void }): JSX.Element {
  return (
    <div className={styles.signGuide}>
      <div className={styles.signGuideHeader}>
        <span className={styles.signGuideTitle}>Como assinar e validar este documento</span>
        <button type="button" className={styles.signGuideClose} onClick={onClose} aria-label="Fechar guia">
          ✕
        </button>
      </div>

      <ol className={styles.signGuideSteps}>
        <li>
          <strong>Baixe o PDF</strong> gerado pelo ClinicBridge usando o botão "Baixar PDF".
        </li>
        <li>
          <strong>Assine fora do ClinicBridge</strong> usando certificado digital ICP-Brasil,
          assinatura GOV.BR ou ferramenta compatível aceita pela sua rotina profissional.
        </li>
        <li>
          <strong>Guarde o arquivo PDF assinado digitalmente</strong> — não apenas uma versão
          impressa ou print de tela.
        </li>
        <li>
          <strong>Acesse o VALIDAR</strong> — serviço oficial Gov.br/ITI disponível em{' '}
          <span className={styles.signGuideUrl}>validar.iti.gov.br</span>.
        </li>
        <li>
          <strong>Envie o PDF assinado</strong> ao VALIDAR e confira o relatório de
          conformidade.
        </li>
        <li>
          Se o resultado for <strong>indeterminado ou reprovado</strong>, revise o
          certificado, o padrão de assinatura ou a ferramenta usada.
        </li>
      </ol>

      <div className={styles.signGuideNote}>
        <p>O ClinicBridge ainda não assina digitalmente este documento.</p>
        <p>
          A assinatura manual/impressa pode ser usada conforme responsabilidade do
          profissional, mas a validação digital depende do arquivo assinado digitalmente.
        </p>
        <p>Não altere o PDF depois de assinar digitalmente.</p>
      </div>

      <p className={styles.signGuideFuture}>Guia visual com prints: futuro.</p>
    </div>
  );
}

// ─── Panel view type ──────────────────────────────────────────────────────────

type DocPanelView =
  | { kind: 'list' }
  | { kind: 'new' }
  | { kind: 'detail'; docId: string };

// ─── DocumentList ─────────────────────────────────────────────────────────────

interface DocumentListProps {
  patientId: string;
  onNewDoc: () => void;
  onOpenDetail: (docId: string) => void;
  onAuriTour?: () => void;
}

function DocumentList({ patientId, onNewDoc, onOpenDetail, onAuriTour }: DocumentListProps): JSX.Element {
  const token = getToken();

  const { data, isLoading, error } = useQuery({
    queryKey: ['clinicalDocuments', patientId],
    queryFn: () => api.listPatientDocuments(token!, patientId),
    enabled: !!token,
    staleTime: 0,
  });

  if (isLoading) {
    return (
      <p className={styles.stateMsg}>
        <Loader2 size={16} className={styles.spin} aria-hidden="true" />
        Carregando documentos…
      </p>
    );
  }

  if (error) {
    return <p className={styles.errorMsg}>{docErrorMessage(error)}</p>;
  }

  const docs = data?.documents ?? [];

  return (
    <>
      <div className={styles.listHead}>
        <span className={styles.sectionLabel}>
          <FileText size={13} style={{ display: 'inline', marginRight: '0.3rem' }} aria-hidden="true" />
          Documentos ({docs.length})
        </span>
        <span className={styles.listHeadActions}>
          {onAuriTour && (
            <button type="button" className={styles.auriBtn} onClick={onAuriTour} title="Auri explica este módulo">
              <HelpCircle size={13} aria-hidden="true" />
              Auri explica
            </button>
          )}
          <button type="button" className={styles.newBtn} onClick={onNewDoc} data-tour-id="docs-create">
            <Plus size={14} aria-hidden="true" />
            Novo documento
          </button>
        </span>
      </div>

      {docs.length === 0 ? (
        <p className={styles.emptyMsg}>
          Este paciente ainda não tem documentos registrados.
        </p>
      ) : (
        <ul className={styles.docList} data-tour-id="docs-list">
          {docs.map((doc) => (
            <DocumentListItem key={doc.id} doc={doc} onOpenDetail={onOpenDetail} />
          ))}
        </ul>
      )}
    </>
  );
}

interface DocumentListItemProps {
  doc: PublicClinicalDocumentListItem;
  onOpenDetail: (docId: string) => void;
}

function DocumentListItem({ doc, onOpenDetail }: DocumentListItemProps): JSX.Element {
  return (
    <li className={styles.docCard}>
      <div className={styles.docMeta}>
        <p className={styles.docTitle}>{doc.title}</p>
        <p className={styles.docSub}>
          {DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}
          {' · '}
          {formatDate(doc.created_at)}
        </p>
        <span
          className={`${styles.statusBadge} ${
            doc.status === 'finalized'
              ? styles.statusFinalized
              : doc.status === 'canceled'
              ? styles.statusCanceled
              : styles.statusDraft
          }`}
        >
          {DOC_STATUS_LABELS[doc.status] ?? doc.status}
        </span>
      </div>
      <button
        type="button"
        className={styles.detailBtn}
        onClick={() => onOpenDetail(doc.id)}
      >
        <Eye size={13} aria-hidden="true" />
        Ver
      </button>
    </li>
  );
}

// ─── CreateDocumentForm ───────────────────────────────────────────────────────

interface CreateDocumentFormProps {
  patientId: string;
  onCreated: (doc: PublicClinicalDocument) => void;
  onCancel: () => void;
}

function CreateDocumentForm({ patientId, onCreated, onCancel }: CreateDocumentFormProps): JSX.Element {
  const token = getToken();
  const queryClient = useQueryClient();

  const [docType, setDocType] = useState<ClinicalDocumentType>('receipt_simple');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [showSignGuide, setShowSignGuide] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      api.createClinicalDocument(token!, {
        patient_id: patientId,
        doc_type: docType,
        title: title.trim() || undefined,
        body: body.trim() || null,
      }),
    onSuccess: ({ document }) => {
      void queryClient.invalidateQueries({ queryKey: ['clinicalDocuments', patientId] });
      onCreated(document);
    },
    onError: (err: unknown) => {
      setFormError(docErrorMessage(err));
    },
  });

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    setFormError(null);
    mutation.mutate();
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <div className={styles.disclaimer}>
        {LEGAL_DISCLAIMER}
      </div>

      <button
        type="button"
        className={styles.signGuideToggle}
        onClick={() => setShowSignGuide((s) => !s)}
      >
        <HelpCircle size={13} aria-hidden="true" />
        {showSignGuide ? 'Fechar guia' : 'Como assinar e validar →'}
      </button>

      {showSignGuide && (
        <SignGuide onClose={() => setShowSignGuide(false)} />
      )}

      <label className={styles.formField}>
        <span className={styles.formLabel}>Tipo de documento *</span>
        <select
          className={styles.formSelect}
          value={docType}
          onChange={(e) => setDocType(e.target.value as ClinicalDocumentType)}
          disabled={mutation.isPending}
        >
          {DOC_TYPES.map((t) => (
            <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>
          ))}
        </select>
      </label>

      <label className={styles.formField}>
        <span className={styles.formLabel}>Título (opcional — gerado automaticamente)</span>
        <input
          type="text"
          className={styles.formInput}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          disabled={mutation.isPending}
          placeholder="Deixe vazio para usar o título padrão"
        />
      </label>

      <label className={styles.formField}>
        <span className={styles.formLabel}>Conteúdo (rascunho)</span>
        <textarea
          className={styles.formTextarea}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={10000}
          rows={6}
          disabled={mutation.isPending}
          placeholder="Texto do documento. Pode ser preenchido agora ou editado antes de finalizar."
        />
      </label>

      {formError && <p className={styles.formError}>{formError}</p>}

      <div className={styles.formActions}>
        <button type="submit" className={styles.submitBtn} disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 size={14} className={styles.spin} aria-hidden="true" />}
          Criar rascunho
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

// ─── DocumentDetail ───────────────────────────────────────────────────────────

interface DocumentDetailProps {
  docId: string;
  patientId: string;
}

function DocumentDetail({ docId, patientId }: DocumentDetailProps): JSX.Element {
  const token = getToken();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['clinicalDocumentDetail', docId],
    queryFn: () => api.getClinicalDocument(token!, docId),
    enabled: !!token,
    staleTime: 0,
  });

  const [editMode, setEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelCode, setCancelCode] = useState<ClinicalDocumentCancelReasonCode>('error');
  const [cancelText, setCancelText] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);

  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showSignGuide, setShowSignGuide] = useState(false);

  const updateMutation = useMutation({
    mutationFn: () =>
      api.updateClinicalDocument(token!, docId, {
        title: editTitle.trim() || undefined,
        body: editBody.trim() || null,
      }),
    onSuccess: () => {
      setEditMode(false);
      setEditError(null);
      void queryClient.invalidateQueries({ queryKey: ['clinicalDocumentDetail', docId] });
      void queryClient.invalidateQueries({ queryKey: ['clinicalDocuments', patientId] });
    },
    onError: (err: unknown) => {
      setEditError(docErrorMessage(err));
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: () => api.finalizeClinicalDocument(token!, docId),
    onSuccess: () => {
      setEditError(null);
      void queryClient.invalidateQueries({ queryKey: ['clinicalDocumentDetail', docId] });
      void queryClient.invalidateQueries({ queryKey: ['clinicalDocuments', patientId] });
    },
    onError: (err: unknown) => {
      setEditError(docErrorMessage(err));
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () =>
      api.cancelClinicalDocument(token!, docId, {
        reason_code: cancelCode,
        reason_text: cancelText.trim() || null,
      }),
    onSuccess: () => {
      setShowCancelForm(false);
      setCancelText('');
      setCancelError(null);
      void queryClient.invalidateQueries({ queryKey: ['clinicalDocumentDetail', docId] });
      void queryClient.invalidateQueries({ queryKey: ['clinicalDocuments', patientId] });
    },
    onError: (err: unknown) => {
      setCancelError(docErrorMessage(err));
    },
  });

  async function handleDownloadPdf(): Promise<void> {
    if (!token) return;
    setIsDownloading(true);
    setDownloadError(null);
    try {
      const { blob, filename } = await api.downloadClinicalDocumentPdf(token, docId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(docErrorMessage(err));
    } finally {
      setIsDownloading(false);
    }
  }

  function enterEditMode(doc: PublicClinicalDocument): void {
    setEditTitle(doc.title);
    setEditBody(doc.body ?? '');
    setEditError(null);
    setEditMode(true);
  }

  if (isLoading) {
    return (
      <p className={styles.stateMsg}>
        <Loader2 size={16} className={styles.spin} aria-hidden="true" />
        Carregando documento…
      </p>
    );
  }

  if (error) {
    return <p className={styles.errorMsg}>{docErrorMessage(error)}</p>;
  }

  if (!data) return <p className={styles.stateMsg}>Documento não encontrado.</p>;

  const { document: doc } = data;
  const isDraft = doc.status === 'draft';
  const isFinalized = doc.status === 'finalized';
  const isCanceled = doc.status === 'canceled';
  const anyPending = updateMutation.isPending || finalizeMutation.isPending || cancelMutation.isPending;

  return (
    <div className={styles.detailWrap}>
      {/* Header row */}
      <div className={styles.detailHeader}>
        <div>
          <p className={styles.detailTitle}>{doc.title}</p>
          <p className={styles.detailSub}>
            {DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}
            {' · '}
            {formatDate(doc.created_at)}
          </p>
        </div>
        <span
          className={`${styles.statusBadge} ${
            isFinalized
              ? styles.statusFinalized
              : isCanceled
              ? styles.statusCanceled
              : styles.statusDraft
          }`}
        >
          {DOC_STATUS_LABELS[doc.status] ?? doc.status}
        </span>
      </div>

      {/* Legal disclaimer for active documents */}
      {!isCanceled && (
        <p className={styles.disclaimer}>{LEGAL_DISCLAIMER}</p>
      )}

      {/* Content / edit form */}
      {editMode ? (
        <div className={styles.editSection}>
          <label className={styles.formField}>
            <span className={styles.formLabel}>Título</span>
            <input
              type="text"
              className={styles.formInput}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              maxLength={200}
              disabled={updateMutation.isPending}
            />
          </label>
          <label className={styles.formField}>
            <span className={styles.formLabel}>Conteúdo</span>
            <textarea
              className={styles.formTextarea}
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              maxLength={10000}
              rows={8}
              disabled={updateMutation.isPending}
            />
          </label>
          {editError && <p className={styles.formError}>{editError}</p>}
          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.submitBtn}
              onClick={() => updateMutation.mutate()}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending && <Loader2 size={14} className={styles.spin} aria-hidden="true" />}
              Salvar
            </button>
            <button
              type="button"
              className={styles.cancelFormBtn}
              onClick={() => { setEditMode(false); setEditError(null); }}
              disabled={updateMutation.isPending}
            >
              Cancelar edição
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.bodySection}>
          {doc.body ? (
            <pre className={styles.bodyText}>{doc.body}</pre>
          ) : (
            <p className={styles.emptyMsg}>
              {isDraft ? 'Rascunho sem conteúdo. Edite para adicionar o texto.' : 'Sem conteúdo registrado.'}
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      {!editMode && (
        <div className={styles.actionsRow}>
          {isDraft && (
            <>
              <button
                type="button"
                className={styles.editBtn}
                onClick={() => enterEditMode(doc)}
                disabled={anyPending}
              >
                Editar rascunho
              </button>
              <button
                type="button"
                className={styles.finalizeBtn}
                onClick={() => finalizeMutation.mutate()}
                disabled={anyPending || !doc.body}
                title={!doc.body ? 'Adicione conteúdo antes de finalizar' : undefined}
              >
                {finalizeMutation.isPending && <Loader2 size={14} className={styles.spin} aria-hidden="true" />}
                Finalizar
              </button>
            </>
          )}

          {(isDraft || isFinalized) && !showCancelForm && (
            <button
              type="button"
              className={styles.cancelDocBtn}
              onClick={() => setShowCancelForm(true)}
              disabled={anyPending}
            >
              Cancelar documento
            </button>
          )}

          {isFinalized && (
            <button
              type="button"
              className={styles.pdfBtn}
              onClick={() => void handleDownloadPdf()}
              disabled={isDownloading}
            >
              {isDownloading ? (
                <Loader2 size={14} className={styles.spin} aria-hidden="true" />
              ) : (
                <Download size={14} aria-hidden="true" />
              )}
              Baixar PDF
            </button>
          )}
        </div>
      )}

      {/* PDF note + sign guide (finalized, outside edit/cancel forms) */}
      {isFinalized && !editMode && !showCancelForm && (
        <div className={styles.pdfNoteRow}>
          <p className={styles.pdfUnsignedNote}>{PDF_UNSIGNED_NOTE}</p>
          <button
            type="button"
            className={styles.signGuideToggle}
            onClick={() => setShowSignGuide((s) => !s)}
          >
            <HelpCircle size={13} aria-hidden="true" />
            {showSignGuide ? 'Fechar guia' : 'Como assinar e validar →'}
          </button>
        </div>
      )}

      {isFinalized && !editMode && !showCancelForm && showSignGuide && (
        <SignGuide onClose={() => setShowSignGuide(false)} />
      )}

      {editError && !editMode && <p className={styles.formError}>{editError}</p>}
      {downloadError && <p className={styles.formError}>{downloadError}</p>}

      {/* Cancel form */}
      {showCancelForm && (
        <div className={styles.cancelForm}>
          <p className={styles.cancelFormTitle}>Confirmar cancelamento</p>

          <label className={styles.formField}>
            <span className={styles.formLabel}>Motivo *</span>
            <select
              className={styles.formSelect}
              value={cancelCode}
              onChange={(e) => setCancelCode(e.target.value as ClinicalDocumentCancelReasonCode)}
              disabled={cancelMutation.isPending}
            >
              {CANCEL_REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </label>

          <label className={styles.formField}>
            <span className={styles.formLabel}>Observação (opcional)</span>
            <textarea
              className={styles.formTextarea}
              value={cancelText}
              onChange={(e) => setCancelText(e.target.value)}
              maxLength={200}
              rows={2}
              disabled={cancelMutation.isPending}
              placeholder="Detalhes adicionais sobre o cancelamento"
            />
          </label>

          {cancelError && <p className={styles.formError}>{cancelError}</p>}

          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.cancelDocBtn}
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending && <Loader2 size={14} className={styles.spin} aria-hidden="true" />}
              Confirmar cancelamento
            </button>
            <button
              type="button"
              className={styles.cancelFormBtn}
              onClick={() => { setShowCancelForm(false); setCancelText(''); setCancelError(null); }}
              disabled={cancelMutation.isPending}
            >
              Voltar
            </button>
          </div>
        </div>
      )}

      {/* Supersedes info */}
      {doc.supersedes_document_id && (
        <p className={styles.supersedesNote}>
          Este documento substitui um documento anterior.
        </p>
      )}

      {isCanceled && doc.cancel_reason_code && (
        <div className={styles.cancelInfo}>
          <p>
            Cancelado em {doc.canceled_at ? formatDate(doc.canceled_at) : '—'}
            {' · '}
            {CANCEL_REASONS.find((r) => r.value === doc.cancel_reason_code)?.label ?? doc.cancel_reason_code}
          </p>
          {doc.cancel_reason_text && <p className={styles.cancelReasonText}>{doc.cancel_reason_text}</p>}
        </div>
      )}
    </div>
  );
}

// ─── ClinicalDocumentsPanel (main export) ─────────────────────────────────────

export interface ClinicalDocumentsPanelProps {
  patientId: string;
}

export function ClinicalDocumentsPanel({ patientId }: ClinicalDocumentsPanelProps): JSX.Element {
  const { isDemo } = useAuth();
  const [view, setView] = useState<DocPanelView>({ kind: 'list' });
  const [showBack, setShowBack] = useState(false);
  const [docTourOpen, setDocTourOpen] = useState(false);
  const [docTourStep, setDocTourStep] = useState(0);

  function goList(): void {
    setView({ kind: 'list' });
    setShowBack(false);
  }

  function goNew(): void {
    setView({ kind: 'new' });
    setShowBack(true);
  }

  function goDetail(docId: string): void {
    setView({ kind: 'detail', docId });
    setShowBack(true);
  }

  return (
    <div className={styles.panel}>
      {showBack && (
        <button type="button" className={styles.backBtn} onClick={goList}>
          ← Voltar à lista
        </button>
      )}

      {view.kind === 'list' && (
        <DocumentList
          patientId={patientId}
          onNewDoc={goNew}
          onOpenDetail={goDetail}
          onAuriTour={!isDemo ? () => { setDocTourStep(0); setDocTourOpen(true); } : undefined}
        />
      )}

      {view.kind === 'new' && (
        <CreateDocumentForm
          patientId={patientId}
          onCreated={(doc) => goDetail(doc.id)}
          onCancel={goList}
        />
      )}

      {view.kind === 'detail' && (
        <DocumentDetail
          docId={view.docId}
          patientId={patientId}
        />
      )}

      {docTourOpen && (
        <GuidedDemoTour
          steps={DOCUMENTS_TOUR_STEPS}
          step={docTourStep}
          setStep={setDocTourStep}
          collapsed={false}
          setCollapsed={() => { /* no-op */ }}
          onClose={() => setDocTourOpen(false)}
          roleLabel="Auri explica"
        />
      )}
    </div>
  );
}
