import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { Logo } from '../components/Logo';
import { AuthAside } from '../components/AuthAside';
import { ApiError } from '../services/api';
import { useAuth } from '../services/AuthProvider';
import styles from './Auth.module.css';

export function LoginPage(): JSX.Element {
  const navigate = useNavigate();
  const { login, completeMfaLogin } = useAuth();

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [showSenha, setShowSenha] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // MFA step. The challenge token is kept ONLY in component state (never persisted).
  const [mfaChallenge, setMfaChallenge] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setFormError(null);

    if (!email.trim() || !senha) {
      setFormError('Informe e-mail e senha.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await login(email.trim(), senha);
      if (result.mfaRequired && result.challengeToken) {
        setMfaChallenge(result.challengeToken);
        setSubmitting(false);
        return;
      }
      navigate('/app', { replace: true });
    } catch (err) {
      // Keep the message generic to avoid account enumeration / leaking details.
      // Only a true connectivity failure gets its own (safe) message.
      if (err instanceof ApiError && err.status === 0) {
        setFormError(err.message);
      } else {
        setFormError('E-mail ou senha inválidos.');
      }
      setSubmitting(false);
    }
  }

  async function handleMfaSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setFormError(null);
    // Accept a 6-digit TOTP code OR a backup/recovery code. The backend normalizes
    // and decides; we only strip whitespace and enforce a minimum length.
    const code = mfaCode.trim();
    if (code.length < 6) {
      setFormError('Informe o código do app autenticador ou um código de recuperação.');
      return;
    }
    if (!mfaChallenge) return;
    setSubmitting(true);
    try {
      await completeMfaLogin(mfaChallenge, code);
      navigate('/app', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) {
        setFormError(err.message);
      } else {
        setFormError('Código inválido ou expirado.');
      }
      setSubmitting(false);
    }
  }

  function backToPassword(): void {
    setMfaChallenge(null);
    setMfaCode('');
    setFormError(null);
    setSubmitting(false);
  }

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <Link to="/" className={styles.brand} aria-label="ClinicBridge — início">
          <Logo size={38} />
          <span>ClinicBridge</span>
        </Link>

        <div className={styles.layout}>
          <div className={styles.card}>
        <span className={styles.eyebrow}>Entrar</span>
        <h1 className={styles.title}>Acesse sua conta</h1>
        <p className={styles.subtitle}>
          Entre para acessar o painel da clínica: pacientes, importação/exportação,
          duplicados, agenda administrativa e auditoria.
        </p>

        {formError ? (
          <div className={`${styles.alert} ${styles.alertError}`} role="alert">
            {formError}
          </div>
        ) : null}

        {!mfaChallenge ? (
          <>
            <form className={styles.form} onSubmit={handleSubmit} noValidate>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="login-email">
                  E-mail
                </label>
                <input
                  id="login-email"
                  className={styles.input}
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="login-senha">
                  Senha
                </label>
                <div className={styles.inputWrap}>
                  <input
                    id="login-senha"
                    className={`${styles.input} ${styles.inputToggle}`}
                    type={showSenha ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                  />
                  <button
                    type="button"
                    className={styles.toggle}
                    onClick={() => setShowSenha((v) => !v)}
                    aria-label={showSenha ? 'Ocultar senha' : 'Mostrar senha'}
                    aria-pressed={showSenha}
                  >
                    {showSenha ? (
                      <EyeOff size={18} aria-hidden="true" />
                    ) : (
                      <Eye size={18} aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <button className={styles.submit} type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 size={16} className="spin" aria-hidden="true" />
                    Entrando…
                  </>
                ) : (
                  'Entrar'
                )}
              </button>
            </form>

            <p className={styles.footer}>
              Ainda não tem conta?{' '}
              <Link to="/register" className={styles.link}>
                Cadastre sua clínica
              </Link>
            </p>
          </>
        ) : (
          <form className={styles.form} onSubmit={handleMfaSubmit} noValidate>
            <p className={styles.subtitle}>
              Verificação em duas etapas ativada. Informe o código de 6 dígitos do seu
              app autenticador ou um código de recuperação.
            </p>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="login-mfa-code">
                Código do app autenticador ou de recuperação
              </label>
              <input
                id="login-mfa-code"
                className={styles.input}
                type="text"
                autoComplete="one-time-code"
                maxLength={14}
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\s/g, ''))}
                autoFocus
              />
            </div>
            <button className={styles.submit} type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 size={16} className="spin" aria-hidden="true" />
                  Verificando…
                </>
              ) : (
                'Verificar código'
              )}
            </button>
            <p className={styles.footer}>
              <button type="button" className={styles.link} onClick={backToPassword}>
                Voltar para e-mail e senha
              </button>
            </p>
          </form>
        )}
          </div>

          <AuthAside />
        </div>

        <Link to="/" className={styles.backHome}>
          Voltar para a página inicial
        </Link>
      </div>
    </div>
  );
}
