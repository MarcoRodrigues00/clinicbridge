import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import styles from './ConfirmDialog.module.css';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger';
  isBusy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'default',
  isBusy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): JSX.Element {
  const ref = useRef<HTMLDialogElement>(null);

  // Sync React open state with the native dialog open/close
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  // Intercept native ESC so React state stays authoritative
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handleCancel = (e: Event) => {
      e.preventDefault();
      if (!isBusy) onCancel();
    };
    el.addEventListener('cancel', handleCancel);
    return () => el.removeEventListener('cancel', handleCancel);
  }, [isBusy, onCancel]);

  // Clicking the native backdrop (event target is the <dialog> itself)
  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>): void {
    if (e.target === ref.current && !isBusy) onCancel();
  }

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="confirm-dialog-title"
      aria-modal="true"
      onClick={handleBackdropClick}
    >
      <div className={styles.content}>
        <h2 id="confirm-dialog-title" className={styles.title}>
          {title}
        </h2>
        <p className={styles.description}>{description}</p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={onCancel}
            disabled={isBusy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`${styles.confirmBtn} ${variant === 'danger' ? styles.confirmDanger : styles.confirmDefault}`}
            onClick={onConfirm}
            disabled={isBusy}
          >
            {isBusy && <Loader2 size={14} className={styles.spin} aria-hidden="true" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
