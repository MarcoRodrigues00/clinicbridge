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
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [showSenha, setShowSenha] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setFormError(null);

    if (!email.trim() || !senha) {
      setFormError('Informe e-mail e senha.');
      return;
    }

    setSubmitting(true);
    try {
      await login(email.trim(), senha);
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
          Entre para acessar o painel da clínica e acompanhar a migração de dados.
        </p>

        {formError ? (
          <div className={`${styles.alert} ${styles.alertError}`} role="alert">
            {formError}
          </div>
        ) : null}

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
