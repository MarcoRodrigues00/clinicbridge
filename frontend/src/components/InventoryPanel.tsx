// InventoryPanel.tsx — Sprint 4.8C (ADR 0017)
//
// Estoque v0.1 — painel administrativo/operacional.
//
// INVARIANTES DE SEGURANÇA / LGPD:
// - Estoque é administrativo. notes (item) e reason (movimento) são texto livre
//   administrativo — NUNCA paciente, diagnóstico, prescrição, queixa ou CID.
// - current_quantity NUNCA é editado diretamente pela UI. Só muda via movimento
//   (transação no backend com SELECT FOR UPDATE). Não há campo de quantidade no
//   formulário de item.
// - Sem console.log de payload; sem localStorage/sessionStorage; sem PII/segredo
//   em URL. Sem dangerouslySetInnerHTML.
// - Escrita de item (criar/editar/desativar) restrita a dono_clinica. Movimentos
//   abertos a dono_clinica + secretaria. profissional_clinico recebe 403 do
//   backend em todos os endpoints → UI mostra card "Acesso restrito".
// - O backend é a defesa real; a UI apenas oculta controles por papel.

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Boxes,
  Loader2,
  Plus,
  Pencil,
  Power,
  Check,
  X,
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  History,
  PackagePlus,
  ShieldOff,
  HelpCircle,
} from 'lucide-react';
import {
  api,
  ApiError,
  type InventoryItem,
  type InventoryMovement,
  type InventoryMovementType,
} from '../services/api';
import { getToken } from '../services/authStorage';
import { useAuth } from '../services/AuthProvider';
import styles from './InventoryPanel.module.css';

const INVENTORY_KEY = ['inventory'] as const;

const MOVEMENT_LABELS: Record<InventoryMovementType, string> = {
  entry: 'Entrada',
  exit: 'Saída',
  adjustment: 'Ajuste',
  loss: 'Perda/descarte',
};

const MOVEMENT_OPTIONS: InventoryMovementType[] = ['entry', 'exit', 'adjustment', 'loss'];

type StatusFilter = 'active' | 'inactive' | 'all';

function is403(err: unknown): boolean {
  return err instanceof ApiError && err.status === 403;
}

// Maps backend error codes to friendly PT-BR messages. Falls back to the
// backend's own message (already user-safe) and then to a generic string.
function inventoryErrMsg(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'inventory_item_name_duplicated':
        return 'Já existe um item com esse nome.';
      case 'inventory_quantity_insufficient':
        return 'O movimento deixaria o estoque negativo.';
      case 'inventory_item_inactive':
        return 'Este item está inativo. Reative-o antes de registrar movimentação.';
      case 'inventory_movement_sign_invalid':
        return 'O tipo de movimento não combina com a quantidade informada.';
      case 'inventory_quantity_overflow':
        return 'Quantidade alta demais.';
      case 'forbidden_role':
        return 'Acesso restrito. Solicite permissão ao(à) dono(a) da clínica.';
      default:
        return err.message || fallback;
    }
  }
  return fallback;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(d);
}

// Parses a positive integer magnitude from a text input. Returns null if empty
// or invalid. Movements use a magnitude + direction model so the user never has
// to type a minus sign (except the explicit Ajuste direction toggle).
function parseMagnitude(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

// ── Movement form (inline, owner + secretaria) ──────────────────────────────────

interface MovementFormProps {
  item: InventoryItem;
  token: string;
  onDone: () => void;
  onCancel: () => void;
}

function MovementForm({ item, token, onDone, onCancel }: MovementFormProps): JSX.Element {
  const [type, setType] = useState<InventoryMovementType>('entry');
  const [magnitude, setMagnitude] = useState('');
  // Direction only matters for "adjustment"; entry is always +, exit/loss are -.
  const [adjustDirection, setAdjustDirection] = useState<'up' | 'down'>('up');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const magnitudeValue = parseMagnitude(magnitude);

  // Signed delta derived from type + direction. null when magnitude invalid.
  const delta = useMemo<number | null>(() => {
    if (magnitudeValue === null) return null;
    if (type === 'entry') return magnitudeValue;
    if (type === 'exit' || type === 'loss') return -magnitudeValue;
    // adjustment
    return adjustDirection === 'up' ? magnitudeValue : -magnitudeValue;
  }, [magnitudeValue, type, adjustDirection]);

  const projected = delta === null ? null : item.current_quantity + delta;
  const wouldGoNegative = projected !== null && projected < 0;

  const mutation = useMutation({
    mutationFn: () => {
      if (delta === null) {
        throw new ApiError(400, {
          code: 'validation',
          message: 'Informe uma quantidade válida (número inteiro positivo).',
        });
      }
      return api.createInventoryMovement(token, item.id, {
        movement_type: type,
        quantity_delta: delta,
        reason: reason.trim() || null,
      });
    },
    onSuccess: () => {
      setError(null);
      onDone();
    },
    onError: (err) => setError(inventoryErrMsg(err, 'Não foi possível registrar o movimento.')),
  });

  const reducesStock =
    type === 'exit' || type === 'loss' || (type === 'adjustment' && adjustDirection === 'down');

  return (
    <div className={styles.movementForm}>
      <div className={styles.movementGrid}>
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel} htmlFor={`mv-type-${item.id}`}>
            Tipo de movimento
          </label>
          <select
            id={`mv-type-${item.id}`}
            className={styles.input}
            value={type}
            disabled={mutation.isPending}
            onChange={(e) => {
              setType(e.target.value as InventoryMovementType);
              setError(null);
            }}
          >
            {MOVEMENT_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {MOVEMENT_LABELS[opt]}
              </option>
            ))}
          </select>
        </div>

        {type === 'adjustment' && (
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel} htmlFor={`mv-dir-${item.id}`}>
              Direção do ajuste
            </label>
            <select
              id={`mv-dir-${item.id}`}
              className={styles.input}
              value={adjustDirection}
              disabled={mutation.isPending}
              onChange={(e) => setAdjustDirection(e.target.value as 'up' | 'down')}
            >
              <option value="up">Aumentar estoque</option>
              <option value="down">Reduzir estoque</option>
            </select>
          </div>
        )}

        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel} htmlFor={`mv-qty-${item.id}`}>
            Quantidade<span className={styles.required}>*</span>
          </label>
          <input
            id={`mv-qty-${item.id}`}
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            className={styles.input}
            value={magnitude}
            placeholder="Ex.: 10"
            disabled={mutation.isPending}
            onChange={(e) => {
              setMagnitude(e.target.value);
              setError(null);
            }}
          />
          <span className={styles.fieldHint}>
            {reducesStock
              ? 'Vamos reduzir o estoque com essa quantidade.'
              : 'Vamos aumentar o estoque com essa quantidade.'}
          </span>
        </div>

        <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
          <label className={styles.fieldLabel} htmlFor={`mv-reason-${item.id}`}>
            Observação administrativa
          </label>
          <input
            id={`mv-reason-${item.id}`}
            type="text"
            className={styles.input}
            value={reason}
            maxLength={300}
            placeholder="Opcional. Ex.: compra, contagem, vencimento."
            disabled={mutation.isPending}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.movementPreview}>
        <span>
          Estoque atual: <strong>{item.current_quantity}</strong> {item.unit}
        </span>
        <span>
          Após o movimento:{' '}
          <strong className={wouldGoNegative ? styles.previewNegative : undefined}>
            {projected === null ? '—' : projected}
          </strong>{' '}
          {item.unit}
        </span>
      </div>

      <div className={styles.movementNote}>
        Use apenas informações administrativas. Não coloque nome de paciente,
        diagnóstico, prescrição, queixa ou detalhes clínicos.
      </div>

      {wouldGoNegative && (
        <div className={styles.cardError}>
          <AlertTriangle size={13} aria-hidden="true" />
          O movimento deixaria o estoque negativo. Ajuste a quantidade.
        </div>
      )}

      {error && (
        <div className={styles.cardError}>
          <AlertCircle size={13} aria-hidden="true" />
          {error}
        </div>
      )}

      <div className={styles.editActions}>
        <button
          type="button"
          className={styles.primaryBtn}
          disabled={mutation.isPending || delta === null || wouldGoNegative}
          onClick={() => mutation.mutate()}
        >
          <Check size={14} aria-hidden="true" />
          Registrar movimento
        </button>
        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={onCancel}
          disabled={mutation.isPending}
        >
          <X size={14} aria-hidden="true" />
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ── Movement history (inline, per item) ─────────────────────────────────────────

interface HistoryProps {
  item: InventoryItem;
  token: string;
}

function MovementHistory({ item, token }: HistoryProps): JSX.Element {
  const historyKey = [...INVENTORY_KEY, 'item', item.id, 'movements'] as const;

  const query = useQuery({
    queryKey: historyKey,
    enabled: !!token,
    queryFn: async () => {
      const res = await api.listInventoryItemMovements(token, item.id, { limit: 50 });
      return res.movements;
    },
  });

  if (query.isLoading) {
    return (
      <div className={styles.historyLoading}>
        <Loader2 size={14} className={styles.spin} aria-hidden="true" />
        Carregando histórico…
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className={styles.cardError}>
        <AlertCircle size={13} aria-hidden="true" />
        Não foi possível carregar o histórico.
        <button
          type="button"
          className={styles.refetchBtn}
          onClick={() => void query.refetch()}
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const movements: InventoryMovement[] = query.data ?? [];

  if (movements.length === 0) {
    return <p className={styles.historyEmpty}>Nenhuma movimentação registrada ainda.</p>;
  }

  return (
    <ul className={styles.historyList}>
      {movements.map((mv) => {
        const positive = mv.quantity_delta > 0;
        return (
          <li key={mv.id} className={styles.historyItem}>
            <span className={styles.historyDate}>{formatDateTime(mv.created_at)}</span>
            <span className={styles.historyType}>{MOVEMENT_LABELS[mv.movement_type]}</span>
            <span
              className={`${styles.historyDelta} ${positive ? styles.deltaUp : styles.deltaDown}`}
            >
              {positive ? '+' : ''}
              {mv.quantity_delta} {item.unit}
            </span>
            {mv.reason && (
              <span className={styles.historyReason} title="Observação administrativa">
                {mv.reason}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ── Item card ────────────────────────────────────────────────────────────────

interface ItemCardProps {
  item: InventoryItem;
  token: string;
  isOwner: boolean;
  canMove: boolean;
  onMutated: () => void;
}

function ItemCard({ item, token, isOwner, canMove, onMutated }: ItemCardProps): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showMovement, setShowMovement] = useState(false);

  const [editName, setEditName] = useState(item.name);
  const [editCategory, setEditCategory] = useState(item.category ?? '');
  const [editUnit, setEditUnit] = useState(item.unit);
  const [editMinimum, setEditMinimum] = useState(String(item.minimum_quantity));
  const [editLocation, setEditLocation] = useState(item.location ?? '');
  const [editNotes, setEditNotes] = useState(item.notes ?? '');
  const [editError, setEditError] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: () => {
      const min = editMinimum.trim() === '' ? 0 : parseInt(editMinimum.trim(), 10);
      return api.updateInventoryItem(token, item.id, {
        name: editName.trim(),
        category: editCategory.trim() || null,
        unit: editUnit.trim(),
        minimum_quantity: Number.isNaN(min) ? 0 : min,
        location: editLocation.trim() || null,
        notes: editNotes.trim() || null,
      });
    },
    onSuccess: () => {
      setEditing(false);
      setEditError(null);
      onMutated();
    },
    onError: (err) => setEditError(inventoryErrMsg(err, 'Não foi possível salvar.')),
  });

  const statusMutation = useMutation({
    mutationFn: (active: boolean) => api.updateInventoryItemStatus(token, item.id, active),
    onSuccess: () => {
      setEditError(null);
      onMutated();
    },
    onError: (err) => setEditError(inventoryErrMsg(err, 'Não foi possível alterar o status.')),
  });

  function cancelEdit(): void {
    setEditing(false);
    setEditError(null);
    setEditName(item.name);
    setEditCategory(item.category ?? '');
    setEditUnit(item.unit);
    setEditMinimum(String(item.minimum_quantity));
    setEditLocation(item.location ?? '');
    setEditNotes(item.notes ?? '');
  }

  return (
    <li className={`${styles.card} ${!item.active ? styles.cardInactive : ''}`}>
      {!editing ? (
        <>
          <div className={styles.cardTop}>
            <div className={styles.cardInfo}>
              <span className={styles.cardName}>{item.name}</span>
              {item.category && <span className={styles.chip}>{item.category}</span>}
              {item.low_stock && item.active && (
                <span className={styles.lowStockChip}>
                  <AlertTriangle size={12} aria-hidden="true" />
                  Estoque baixo
                </span>
              )}
              {!item.active && <span className={styles.inactiveChip}>Inativo</span>}
            </div>
            <div className={styles.cardMeta}>
              <span className={styles.qtyTag}>
                {item.current_quantity} {item.unit}
              </span>
              <span className={styles.minTag}>mín. {item.minimum_quantity}</span>
              {item.location && <span className={styles.locTag}>{item.location}</span>}
            </div>
          </div>

          {item.notes && <p className={styles.cardNotes}>{item.notes}</p>}

          <div className={styles.cardActions}>
            {canMove && item.active && (
              <button
                type="button"
                className={styles.actionBtn}
                onClick={() => {
                  setShowMovement((v) => !v);
                  setShowHistory(false);
                }}
              >
                <PackagePlus size={13} aria-hidden="true" />
                Registrar movimento
              </button>
            )}
            <button
              type="button"
              className={styles.actionBtn}
              onClick={() => {
                setShowHistory((v) => !v);
                setShowMovement(false);
              }}
            >
              <History size={13} aria-hidden="true" />
              Histórico
              {showHistory ? (
                <ChevronUp size={11} aria-hidden="true" />
              ) : (
                <ChevronDown size={11} aria-hidden="true" />
              )}
            </button>
            {isOwner && (
              <>
                <button
                  type="button"
                  className={styles.actionBtn}
                  title="Editar"
                  onClick={() => setEditing(true)}
                >
                  <Pencil size={13} aria-hidden="true" />
                  Editar
                </button>
                <button
                  type="button"
                  className={styles.actionBtn}
                  title={item.active ? 'Desativar' : 'Reativar'}
                  disabled={statusMutation.isPending}
                  onClick={() => statusMutation.mutate(!item.active)}
                >
                  <Power size={13} aria-hidden="true" />
                  {item.active ? 'Desativar' : 'Reativar'}
                </button>
              </>
            )}
          </div>

          {!item.active && canMove && (
            <p className={styles.cardHint}>
              Reative o item para registrar movimentações.
            </p>
          )}

          {editError && (
            <div className={styles.cardError}>
              <AlertCircle size={13} aria-hidden="true" />
              {editError}
            </div>
          )}

          {showMovement && canMove && item.active && (
            <MovementForm
              item={item}
              token={token}
              onDone={() => {
                setShowMovement(false);
                onMutated();
              }}
              onCancel={() => setShowMovement(false)}
            />
          )}

          {showHistory && <MovementHistory item={item} token={token} />}
        </>
      ) : (
        <div className={styles.editForm}>
          <div className={styles.editGrid}>
            <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
              <label className={styles.fieldLabel} htmlFor={`inv-name-${item.id}`}>
                Nome<span className={styles.required}>*</span>
              </label>
              <input
                id={`inv-name-${item.id}`}
                type="text"
                className={styles.input}
                value={editName}
                maxLength={120}
                disabled={updateMutation.isPending}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor={`inv-cat-${item.id}`}>
                Categoria
              </label>
              <input
                id={`inv-cat-${item.id}`}
                type="text"
                className={styles.input}
                value={editCategory}
                maxLength={80}
                placeholder="Ex.: Material, Insumo, Limpeza…"
                disabled={updateMutation.isPending}
                onChange={(e) => setEditCategory(e.target.value)}
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor={`inv-unit-${item.id}`}>
                Unidade<span className={styles.required}>*</span>
              </label>
              <input
                id={`inv-unit-${item.id}`}
                type="text"
                className={styles.input}
                value={editUnit}
                maxLength={40}
                placeholder="Ex.: caixa, unidade, frasco"
                disabled={updateMutation.isPending}
                onChange={(e) => setEditUnit(e.target.value)}
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor={`inv-min-${item.id}`}>
                Estoque mínimo
              </label>
              <input
                id={`inv-min-${item.id}`}
                type="number"
                min={0}
                step={1}
                className={styles.input}
                value={editMinimum}
                disabled={updateMutation.isPending}
                onChange={(e) => setEditMinimum(e.target.value)}
              />
              <span className={styles.fieldHint}>0 = sem alerta de estoque baixo.</span>
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor={`inv-loc-${item.id}`}>
                Local
              </label>
              <input
                id={`inv-loc-${item.id}`}
                type="text"
                className={styles.input}
                value={editLocation}
                maxLength={120}
                placeholder="Ex.: Armário 1, Sala 2"
                disabled={updateMutation.isPending}
                onChange={(e) => setEditLocation(e.target.value)}
              />
            </div>
            <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
              <label className={styles.fieldLabel} htmlFor={`inv-notes-${item.id}`}>
                Observação administrativa
              </label>
              <textarea
                id={`inv-notes-${item.id}`}
                className={`${styles.input} ${styles.textarea}`}
                value={editNotes}
                maxLength={500}
                rows={2}
                placeholder="Observação administrativa (sem dados clínicos)."
                disabled={updateMutation.isPending}
                onChange={(e) => setEditNotes(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.editNote}>
            A quantidade atual só muda por movimentações. Não inclua nome de
            paciente, diagnóstico, prescrição ou informações clínicas.
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
              disabled={updateMutation.isPending || !editName.trim() || !editUnit.trim()}
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

// ── Create form ────────────────────────────────────────────────────────────────

interface CreateFormProps {
  token: string;
  onCreated: () => void;
  onCancel: () => void;
}

function CreateItemForm({ token, onCreated, onCancel }: CreateFormProps): JSX.Element {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [unit, setUnit] = useState('');
  const [minimum, setMinimum] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const min = minimum.trim() === '' ? 0 : parseInt(minimum.trim(), 10);
      return api.createInventoryItem(token, {
        name: name.trim(),
        category: category.trim() || null,
        unit: unit.trim(),
        minimum_quantity: Number.isNaN(min) ? 0 : min,
        location: location.trim() || null,
        notes: notes.trim() || null,
      });
    },
    onSuccess: () => {
      setError(null);
      onCreated();
    },
    onError: (err) => setError(inventoryErrMsg(err, 'Não foi possível criar o item.')),
  });

  return (
    <div className={styles.createCard}>
      <div className={styles.createGrid}>
        <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
          <label className={styles.fieldLabel} htmlFor="inv-new-name">
            Nome<span className={styles.required}>*</span>
          </label>
          <input
            id="inv-new-name"
            type="text"
            className={styles.input}
            value={name}
            maxLength={120}
            placeholder="Ex.: Luva de procedimento M, Álcool 70%…"
            disabled={mutation.isPending}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel} htmlFor="inv-new-cat">
            Categoria
          </label>
          <input
            id="inv-new-cat"
            type="text"
            className={styles.input}
            value={category}
            maxLength={80}
            placeholder="Ex.: Material, Insumo, Limpeza, Escritório"
            disabled={mutation.isPending}
            onChange={(e) => setCategory(e.target.value)}
          />
        </div>
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel} htmlFor="inv-new-unit">
            Unidade<span className={styles.required}>*</span>
          </label>
          <input
            id="inv-new-unit"
            type="text"
            className={styles.input}
            value={unit}
            maxLength={40}
            placeholder="Ex.: caixa, unidade, frasco"
            disabled={mutation.isPending}
            onChange={(e) => setUnit(e.target.value)}
          />
        </div>
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel} htmlFor="inv-new-min">
            Estoque mínimo
          </label>
          <input
            id="inv-new-min"
            type="number"
            min={0}
            step={1}
            className={styles.input}
            value={minimum}
            placeholder="0"
            disabled={mutation.isPending}
            onChange={(e) => setMinimum(e.target.value)}
          />
          <span className={styles.fieldHint}>0 = sem alerta de estoque baixo.</span>
        </div>
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel} htmlFor="inv-new-loc">
            Local
          </label>
          <input
            id="inv-new-loc"
            type="text"
            className={styles.input}
            value={location}
            maxLength={120}
            placeholder="Ex.: Armário 1, Sala 2"
            disabled={mutation.isPending}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>
        <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
          <label className={styles.fieldLabel} htmlFor="inv-new-notes">
            Observação administrativa
          </label>
          <textarea
            id="inv-new-notes"
            className={`${styles.input} ${styles.textarea}`}
            value={notes}
            maxLength={500}
            rows={2}
            placeholder="Observação administrativa (sem dados clínicos)."
            disabled={mutation.isPending}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.editNote}>
        O item começa com quantidade 0. A quantidade só muda por movimentações.
        Não inclua nome de paciente, diagnóstico, prescrição ou dados clínicos.
      </div>

      {error && (
        <div className={styles.createError}>
          <AlertCircle size={14} aria-hidden="true" />
          {error}
        </div>
      )}

      <div className={styles.createActions}>
        <button
          type="button"
          className={styles.primaryBtn}
          disabled={mutation.isPending || !name.trim() || !unit.trim()}
          onClick={() => mutation.mutate()}
        >
          <Check size={14} aria-hidden="true" />
          Criar item
        </button>
        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={onCancel}
          disabled={mutation.isPending}
        >
          <X size={14} aria-hidden="true" />
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function InventoryPanel({ onAuriTour }: { onAuriTour?: () => void } = {}): JSX.Element {
  const { user } = useAuth();
  const isOwner = user?.papel === 'dono_clinica';
  // Reads + movements are open to dono_clinica + secretaria. profissional_clinico
  // carries papel='secretaria' but the backend 403s every endpoint, so the
  // restricted card below takes over before any control is shown.
  const canMove = isOwner || user?.papel === 'secretaria';
  const queryClient = useQueryClient();
  const token = getToken();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const activeParam = statusFilter === 'all' ? undefined : statusFilter === 'active';

  const listQuery = useQuery({
    queryKey: [
      ...INVENTORY_KEY,
      'items',
      { search, category, statusFilter, lowStockOnly },
    ],
    enabled: !!token,
    queryFn: async () => {
      const res = await api.listInventoryItems(token as string, {
        active: activeParam,
        low_stock: lowStockOnly ? true : undefined,
        query: search.trim() || undefined,
        category: category.trim() || undefined,
        limit: 100,
      });
      return res.items;
    },
  });

  // Independent summary of the whole active inventory (not affected by filters).
  const summaryQuery = useQuery({
    queryKey: [...INVENTORY_KEY, 'items', 'summary'],
    enabled: !!token,
    queryFn: async () => {
      const res = await api.listInventoryItems(token as string, {
        active: true,
        limit: 100,
      });
      return res.items;
    },
  });

  function invalidateInventory(): void {
    void queryClient.invalidateQueries({ queryKey: INVENTORY_KEY });
  }

  // 403 → profissional_clinico (or any role the backend rejects). Show a calm
  // restricted card instead of an error, and never reveal the exact reason.
  if (listQuery.isError && is403(listQuery.error)) {
    return (
      <div className={styles.panel}>
        <div className={styles.restrictedCard}>
          <ShieldOff size={20} className={styles.restrictedIcon} aria-hidden="true" />
          <p className={styles.restrictedText}>
            Acesso restrito ao estoque. Solicite permissão ao(à) dono(a) da clínica.
          </p>
        </div>
      </div>
    );
  }

  const items: InventoryItem[] = listQuery.data ?? [];
  const summaryItems: InventoryItem[] = summaryQuery.data ?? [];
  const activeCount = summaryItems.length;
  const lowStockCount = summaryItems.filter((i) => i.low_stock).length;

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <h3 className={styles.title}>
          <Boxes size={18} aria-hidden="true" />
          Estoque
          <span className={styles.categoryChip}>Materiais e insumos</span>
        </h3>
        <div className={styles.headActions}>
          {onAuriTour && (
            <button type="button" className={styles.secondaryBtn} onClick={onAuriTour} title="Auri explica este módulo">
              <HelpCircle size={15} aria-hidden="true" />
              Auri explica
            </button>
          )}
          {isOwner && !showCreate && (
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => {
                setShowCreate(true);
                setNotice(null);
              }}
            >
              <Plus size={15} aria-hidden="true" />
              Novo item
            </button>
          )}
        </div>
      </div>

      <p className={styles.subtitle}>
        Controle materiais e insumos da clínica com entradas, saídas e alertas de
        estoque baixo. Use apenas informações administrativas — sem dados clínicos.
      </p>

      {/* Hero summary */}
      <div className={styles.summary} data-tour-id="inventory-summary">
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>Itens ativos</span>
          <span className={styles.summaryValue}>
            {summaryQuery.isLoading ? '—' : activeCount}
          </span>
        </div>
        <div className={`${styles.summaryCard} ${lowStockCount > 0 ? styles.summaryAlert : ''}`}>
          <span className={styles.summaryLabel}>Estoque baixo</span>
          <span className={styles.summaryValue}>
            {summaryQuery.isLoading ? '—' : lowStockCount}
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className={styles.filters} data-tour-id="inventory-filters">
        <input
          type="search"
          className={styles.filterInput}
          value={search}
          maxLength={120}
          placeholder="Buscar por nome…"
          aria-label="Buscar item por nome"
          onChange={(e) => setSearch(e.target.value)}
        />
        <input
          type="text"
          className={styles.filterInput}
          value={category}
          maxLength={80}
          placeholder="Categoria…"
          aria-label="Filtrar por categoria"
          onChange={(e) => setCategory(e.target.value)}
        />
        <select
          className={styles.filterSelect}
          value={statusFilter}
          aria-label="Filtrar por status"
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
        >
          <option value="active">Ativos</option>
          <option value="inactive">Inativos</option>
          <option value="all">Todos</option>
        </select>
        <label className={styles.filterCheck}>
          <input
            type="checkbox"
            checked={lowStockOnly}
            onChange={(e) => setLowStockOnly(e.target.checked)}
          />
          Apenas estoque baixo
        </label>
      </div>

      {notice && <div className={styles.notice}>{notice}</div>}

      {listQuery.isError && !is403(listQuery.error) && (
        <div className={styles.fetchError}>
          <AlertCircle size={15} aria-hidden="true" />
          Não foi possível carregar o estoque.
          <button
            type="button"
            className={styles.refetchBtn}
            onClick={() => void listQuery.refetch()}
          >
            Tentar novamente
          </button>
        </div>
      )}

      {showCreate && isOwner && (
        <CreateItemForm
          token={token as string}
          onCreated={() => {
            setShowCreate(false);
            setNotice('Item criado.');
            invalidateInventory();
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {listQuery.isLoading && (
        <div className={styles.loading}>
          <Loader2 size={16} className={styles.spin} aria-hidden="true" />
          Carregando estoque…
        </div>
      )}

      {!listQuery.isLoading && !listQuery.isError && items.length === 0 && (
        <div className={styles.empty}>
          {lowStockOnly
            ? 'Nenhum item com estoque baixo.'
            : statusFilter === 'inactive'
              ? 'Nenhum item inativo.'
              : search.trim() || category.trim()
                ? 'Nenhum item encontrado com esses filtros.'
                : isOwner
                  ? 'Nenhum item cadastrado. Clique em "Novo item" para começar.'
                  : 'Nenhum item cadastrado ainda.'}
        </div>
      )}

      {items.length > 0 && (
        <ul className={styles.list} data-tour-id="inventory-list">
          {items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              token={token as string}
              isOwner={isOwner}
              canMove={canMove}
              onMutated={() => {
                setNotice(null);
                invalidateInventory();
              }}
            />
          ))}
        </ul>
      )}

      {!isOwner && (
        <p className={styles.roleNote}>
          Você pode registrar movimentações e consultar o estoque. Apenas o(a)
          dono(a) da clínica pode criar, editar ou desativar itens.
        </p>
      )}
    </div>
  );
}
