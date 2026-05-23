import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, ShieldAlert, Loader2, KeyRound, Copy, Check } from 'lucide-react';
import { api, ApiError, type MfaSetupResponse } from '../services/api';
import { getToken } from '../services/authStorage';
import styles from './MfaSettings.module.css';

function errMsg(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR');
}

export function MfaSettings(): JSX.Element {
  const queryClient = useQueryClient();
  const token = getToken();

  // Setup material lives ONLY in component state (never localStorage). Includes the
  // secret/otpauth shown during activation — discarded after confirm/cancel.
  const [setup, setSetup] = useState<MfaSetupResponse | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Backup codes are shown ONCE, right after confirm or regenerate. Kept only in
  // component state and cleared once the user confirms they saved them.
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [savedAck, setSavedAck] = useState(false);
  const [copied, setCopied] = useState(false);

  // Regeneration (when MFA is already enabled): requires a current TOTP code.
  const [showRegen, setShowRegen] = useState(false);
  const [regenCode, setRegenCode] = useState('');

  const statusQuery = useQuery({
    queryKey: ['mfa-status'],
    enabled: !!token,
    queryFn: async () => api.getMfaStatus(token as string),
  });

  function reset(): void {
    setSetup(null);
    setCode('');
    setError(null);
  }

  async function startSetup(): Promise<void> {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await api.setupMfa(token as string);
      setSetup(res);
      setCode('');
    } catch (err) {
      setError(errMsg(err, 'Não foi possível iniciar a ativação do MFA.'));
    } finally {
      setBusy(false);
    }
  }

  async function confirmSetup(): Promise<void> {
    setError(null);
    setNotice(null);
    const digits = code.replace(/\D/g, '');
    if (digits.length < 6) {
      setError('Informe o código de 6 dígitos do autenticador.');
      return;
    }
    setBusy(true);
    try {
      const res = await api.confirmMfa(token as string, digits);
      reset();
      setBackupCodes(res.backup_codes);
      setSavedAck(false);
      setCopied(false);
      setNotice('MFA ativado com sucesso. Guarde seus códigos de recuperação.');
      void queryClient.invalidateQueries({ queryKey: ['mfa-status'] });
    } catch (err) {
      setError(errMsg(err, 'Código inválido ou expirado.'));
    } finally {
      setBusy(false);
    }
  }

  async function disable(): Promise<void> {
    setError(null);
    setNotice(null);
    const digits = code.replace(/\D/g, '');
    if (digits.length < 6) {
      setError('Informe o código de 6 dígitos para desativar.');
      return;
    }
    setBusy(true);
    try {
      await api.disableMfa(token as string, digits);
      setNotice('MFA desativado.');
      setCode('');
      setBackupCodes(null);
      void queryClient.invalidateQueries({ queryKey: ['mfa-status'] });
    } catch (err) {
      setError(errMsg(err, 'Código inválido. Não foi possível desativar.'));
    } finally {
      setBusy(false);
    }
  }

  async function regenerate(): Promise<void> {
    setError(null);
    setNotice(null);
    const digits = regenCode.replace(/\D/g, '');
    if (digits.length < 6) {
      setError('Informe o código de 6 dígitos do autenticador para gerar novos códigos.');
      return;
    }
    setBusy(true);
    try {
      const res = await api.regenerateMfaBackupCodes(token as string, digits);
      setBackupCodes(res.backup_codes);
      setSavedAck(false);
      setCopied(false);
      setShowRegen(false);
      setRegenCode('');
      setNotice('Novos códigos de recuperação gerados. Os anteriores foram invalidados.');
      void queryClient.invalidateQueries({ queryKey: ['mfa-status'] });
    } catch (err) {
      setError(errMsg(err, 'Não foi possível gerar novos códigos.'));
    } finally {
      setBusy(false);
    }
  }

  async function copyCodes(): Promise<void> {
    if (!backupCodes) return;
    try {
      await navigator.clipboard.writeText(backupCodes.join('\n'));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Não foi possível copiar. Selecione e copie os códigos manualmente.');
    }
  }

  function dismissBackupCodes(): void {
    setBackupCodes(null);
    setSavedAck(false);
    setCopied(false);
  }

  const enabled = statusQuery.data?.mfa_enabled ?? false;
  const remaining = statusQuery.data?.backup_codes_remaining ?? 0;

  return (
    <section className={styles.card}>
      <span className={`${styles.badge} ${enabled ? styles.badgeOk : styles.badgeWarn}`}>
        {enabled ? <ShieldCheck size={14} aria-hidden="true" /> : <ShieldAlert size={14} aria-hidden="true" />}
        {enabled ? 'MFA ativado' : 'MFA desativado'}
      </span>
      <h3 className={styles.title}>Verificação em duas etapas (MFA)</h3>
      <p className={styles.text}>
        Use um app autenticador (TOTP) para proteger o acesso à clínica. Ao ativar,
        você recebe códigos de recuperação para entrar caso perca o acesso ao app.
      </p>

      {notice && <p className={styles.notice}>{notice}</p>}
      {(error || statusQuery.isError) && (
        <p className={styles.error}>{error ?? errMsg(statusQuery.error, 'Não foi possível carregar o status do MFA.')}</p>
      )}

      {/* Backup codes: shown ONCE, right after confirm/regenerate. */}
      {backupCodes && (
        <div className={styles.codesBox}>
          <p className={styles.codesTitle}><KeyRound size={16} aria-hidden="true" /> Códigos de recuperação</p>
          <ul className={styles.codesList}>
            {backupCodes.map((c) => (
              <li key={c} className={styles.codeItem}><code>{c}</code></li>
            ))}
          </ul>
          <ul className={styles.warnList}>
            <li>Guarde estes códigos em local seguro (gerenciador de senhas, papel).</li>
            <li>Cada código só pode ser usado uma vez.</li>
            <li>Eles não serão exibidos novamente.</li>
          </ul>
          <div className={styles.codesActions}>
            <button type="button" className={styles.secondaryBtn} onClick={() => void copyCodes()}>
              {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
              {copied ? 'Copiado!' : 'Copiar todos'}
            </button>
          </div>
          <label className={styles.ackRow}>
            <input type="checkbox" checked={savedAck} onChange={(e) => setSavedAck(e.target.checked)} />
            <span>Eu salvei meus códigos de recuperação.</span>
          </label>
          <button type="button" className={styles.primaryBtn} disabled={!savedAck} onClick={dismissBackupCodes}>
            Concluir
          </button>
        </div>
      )}

      {statusQuery.isLoading ? (
        <p className={styles.muted}><Loader2 size={16} className={styles.spin} aria-hidden="true" /> Carregando…</p>
      ) : enabled ? (
        <div className={styles.block}>
          <p className={styles.meta}>Ativado em {formatDate(statusQuery.data?.mfa_enabled_at ?? null)}.</p>
          <p className={styles.meta}>Códigos de recuperação restantes: <strong>{remaining}</strong>.</p>

          {/* Regenerate backup codes */}
          {!showRegen ? (
            <button type="button" className={styles.secondaryBtn} onClick={() => { setShowRegen(true); setError(null); setNotice(null); }}>
              <KeyRound size={16} aria-hidden="true" /> Gerar novos códigos de recuperação
            </button>
          ) : (
            <div className={styles.subBlock}>
              <p className={styles.warnText}>Gerar novos códigos <strong>invalida os anteriores</strong>.</p>
              <label className={styles.label} htmlFor="mfa-regen-code">Código do autenticador</label>
              <div className={styles.row}>
                <input
                  id="mfa-regen-code"
                  className={styles.input}
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={regenCode}
                  onChange={(e) => setRegenCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                />
                <button type="button" className={styles.primaryBtn} disabled={busy} onClick={() => void regenerate()}>
                  {busy ? <Loader2 size={16} className={styles.spin} aria-hidden="true" /> : null}
                  Gerar novos códigos
                </button>
                <button type="button" className={styles.secondaryBtn} onClick={() => { setShowRegen(false); setRegenCode(''); }}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          <label className={styles.label} htmlFor="mfa-disable-code">Código do autenticador para desativar</label>
          <div className={styles.row}>
            <input
              id="mfa-disable-code"
              className={styles.input}
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
            />
            <button type="button" className={styles.dangerBtn} disabled={busy} onClick={() => void disable()}>
              Desativar MFA
            </button>
          </div>
        </div>
      ) : setup ? (
        <div className={styles.block}>
          <p className={styles.text}>1) Escaneie o QR code no seu app autenticador (ou use a chave manual):</p>
          <img className={styles.qr} src={setup.qr_data_url} alt="QR code para configurar o MFA" />
          <p className={styles.manual}><KeyRound size={14} aria-hidden="true" /> Chave manual: <code>{setup.manual_key}</code></p>
          <label className={styles.label} htmlFor="mfa-confirm-code">2) Informe o código gerado pelo app</label>
          <div className={styles.row}>
            <input
              id="mfa-confirm-code"
              className={styles.input}
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
            />
            <button type="button" className={styles.primaryBtn} disabled={busy} onClick={() => void confirmSetup()}>
              {busy ? <Loader2 size={16} className={styles.spin} aria-hidden="true" /> : null}
              Confirmar ativação
            </button>
            <button type="button" className={styles.secondaryBtn} onClick={reset}>Cancelar</button>
          </div>
        </div>
      ) : (
        <button type="button" className={styles.primaryBtn} disabled={busy} onClick={() => void startSetup()}>
          {busy ? <Loader2 size={16} className={styles.spin} aria-hidden="true" /> : <ShieldCheck size={16} aria-hidden="true" />}
          Ativar MFA
        </button>
      )}
    </section>
  );
}
