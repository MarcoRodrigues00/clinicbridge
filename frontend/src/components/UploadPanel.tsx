import { useCallback, useEffect, useRef, useState } from 'react';
import { UploadCloud, Loader2, FileSpreadsheet, AlertTriangle, Eye } from 'lucide-react';
import { api, ApiError, type PublicImportFile, type ImportPreviewResponse } from '../services/api';
import { getToken } from '../services/authStorage';
import { ImportPreviewPanel } from './ImportPreviewPanel';
import styles from './UploadPanel.module.css';

const ACCEPT = '.csv,.xlsx';
const ALLOWED_EXT = ['.csv', '.xlsx'];

// MVP: the backend (UPLOAD_MAX_BYTES) is the authoritative limit. We mirror the
// default 5 MB here only for a friendlier pre-flight check before uploading.
const MAX_BYTES = 5 * 1024 * 1024;

const STATUS_LABELS: Record<string, string> = {
  uploaded: 'Enviado',
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

function hasAllowedExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return ALLOWED_EXT.some((ext) => lower.endsWith(ext));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR');
}

type Message = { type: 'success' | 'error'; text: string } | null;

export function UploadPanel({
  onSessionSaved,
}: {
  onSessionSaved?: () => void;
}): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<PublicImportFile[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [selected, setSelected] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const refreshList = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setLoadingList(false);
      return;
    }
    try {
      const res = await api.listImportFiles(token);
      setFiles(res.files);
      setListError(null);
    } catch {
      setListError('Não foi possível carregar os arquivos enviados.');
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  async function handlePreview(fileId: string): Promise<void> {
    const token = getToken();
    if (!token) {
      setPreviewError('Sessão expirada. Faça login novamente.');
      return;
    }
    setPreviewError(null);
    setPreview(null);
    setPreviewLoadingId(fileId);
    try {
      const res = await api.getImportFilePreview(token, fileId);
      setPreview(res);
    } catch (err) {
      setPreviewError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível pré-visualizar o arquivo.',
      );
    } finally {
      setPreviewLoadingId(null);
    }
  }

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setMessage(null);

    const token = getToken();
    if (!token) {
      setMessage({ type: 'error', text: 'Sessão expirada. Faça login novamente.' });
      return;
    }
    if (!selected) {
      setMessage({ type: 'error', text: 'Selecione um arquivo .csv ou .xlsx.' });
      return;
    }
    if (!hasAllowedExtension(selected.name)) {
      setMessage({ type: 'error', text: 'Formato inválido. Envie apenas CSV ou XLSX.' });
      return;
    }
    if (selected.size > MAX_BYTES) {
      setMessage({ type: 'error', text: 'Arquivo muito grande. O limite atual é de 5 MB.' });
      return;
    }

    setUploading(true);
    try {
      const res = await api.uploadImportFile(token, selected);
      setFiles((prev) => [res.file, ...prev]);
      setMessage({
        type: 'success',
        text: 'Arquivo enviado com sucesso. O processamento será implementado na próxima etapa.',
      });
      setSelected(null);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    } catch (err) {
      setMessage({
        type: 'error',
        text:
          err instanceof ApiError
            ? err.message
            : 'Não foi possível enviar o arquivo. Tente novamente.',
      });
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="upload-heading">
      <div className={styles.head}>
        <span className={styles.badge}>
          <UploadCloud size={14} aria-hidden="true" />
          Disponível
        </span>
        <h2 id="upload-heading" className={styles.title}>
          Enviar arquivo (CSV/XLSX)
        </h2>
        <p className={styles.note}>
          O upload é seguro e o arquivo fica isolado por clínica. O
          processamento/migração dos dados ainda não foi implementado — esta etapa
          apenas armazena o arquivo e seus metadados.
        </p>
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.fileLabel} htmlFor="import-file">
          Arquivo
        </label>
        <div className={styles.row}>
          <input
            ref={inputRef}
            id="import-file"
            className={styles.fileInput}
            type="file"
            accept={ACCEPT}
            onChange={(e) => {
              setSelected(e.target.files?.[0] ?? null);
              setMessage(null);
            }}
          />
          <button className={styles.submit} type="submit" disabled={uploading}>
            {uploading ? (
              <>
                <Loader2 size={16} className="spin" aria-hidden="true" />
                Enviando…
              </>
            ) : (
              <>
                <UploadCloud size={16} aria-hidden="true" />
                Enviar arquivo
              </>
            )}
          </button>
        </div>

        {message ? (
          <div
            className={`${styles.message} ${
              message.type === 'success' ? styles.msgSuccess : styles.msgError
            }`}
            role={message.type === 'error' ? 'alert' : 'status'}
          >
            {message.type === 'error' ? (
              <AlertTriangle size={16} aria-hidden="true" />
            ) : (
              <FileSpreadsheet size={16} aria-hidden="true" />
            )}
            <span>{message.text}</span>
          </div>
        ) : null}
      </form>

      <div className={styles.listWrap}>
        <h3 className={styles.listTitle}>Arquivos enviados</h3>
        {loadingList ? (
          <p className={styles.empty}>Carregando…</p>
        ) : listError ? (
          <p className={styles.empty}>{listError}</p>
        ) : files.length === 0 ? (
          <p className={styles.empty}>Nenhum arquivo enviado ainda.</p>
        ) : (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Arquivo</th>
                  <th>Tipo</th>
                  <th>Tamanho</th>
                  <th>Status</th>
                  <th>Enviado em</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.id}>
                    <td className={styles.name} title={f.nome_original}>
                      {f.nome_original}
                    </td>
                    <td>
                      <span className={styles.ext}>{f.extensao.toUpperCase()}</span>
                    </td>
                    <td>{formatBytes(f.tamanho_bytes)}</td>
                    <td>
                      <span className={styles.status}>{statusLabel(f.status)}</span>
                    </td>
                    <td>{formatDate(f.criado_em)}</td>
                    <td>
                      <button
                        type="button"
                        className={styles.previewBtn}
                        onClick={() => handlePreview(f.id)}
                        disabled={previewLoadingId === f.id}
                      >
                        {previewLoadingId === f.id ? (
                          <>
                            <Loader2 size={14} className="spin" aria-hidden="true" />
                            Carregando…
                          </>
                        ) : (
                          <>
                            <Eye size={14} aria-hidden="true" />
                            Pré-visualizar
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {previewError ? (
        <div className={`${styles.message} ${styles.msgError}`} role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{previewError}</span>
        </div>
      ) : null}

      {preview ? (
        <ImportPreviewPanel
          key={preview.file.id}
          preview={preview}
          onClose={() => setPreview(null)}
          onSessionSaved={onSessionSaved}
        />
      ) : null}
    </section>
  );
}
