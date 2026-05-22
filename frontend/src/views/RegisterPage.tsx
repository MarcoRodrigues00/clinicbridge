import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Loader2, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { Logo } from '../components/Logo';
import { AuthAside } from '../components/AuthAside';
import { api, ApiError } from '../services/api';
import styles from './Auth.module.css';

interface FieldErrors {
  nome?: string;
  email?: string;
  senha?: string;
  confirmar_senha?: string;
  nome_clinica?: string;
  consentimento_lgpd?: string;
}

function validate(values: {
  nome: string;
  email: string;
  senha: string;
  confirmar_senha: string;
  nome_clinica: string;
  consentimento_lgpd: boolean;
}): FieldErrors {
  const errors: FieldErrors = {};

  if (!values.nome.trim()) {
    errors.nome = 'Informe seu nome.';
  }
  if (!values.email.trim()) {
    errors.email = 'Informe seu e-mail.';
  } else if (!/.+@.+\..+/.test(values.email.trim())) {
    errors.email = 'Informe um e-mail válido.';
  }
  if (values.senha.length < 10) {
    errors.senha = 'A senha deve ter no mínimo 10 caracteres.';
  } else if (!/[A-Za-z]/.test(values.senha) || !/[0-9]/.test(values.senha)) {
    errors.senha = 'A senha deve conter ao menos uma letra e um número.';
  }
  if (!values.confirmar_senha) {
    errors.confirmar_senha = 'Confirme a senha.';
  } else if (values.senha !== values.confirmar_senha) {
    errors.confirmar_senha = 'As senhas não conferem.';
  }
  if (!values.nome_clinica.trim()) {
    errors.nome_clinica = 'Informe o nome da clínica.';
  }
  if (!values.consentimento_lgpd) {
    errors.consentimento_lgpd = 'É necessário aceitar o tratamento de dados (LGPD).';
  }

  return errors;
}

export function RegisterPage(): JSX.Element {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [nomeClinica, setNomeClinica] = useState('');
  const [consent, setConsent] = useState(false);

  const [showSenha, setShowSenha] = useState(false);
  const [showConfirmar, setShowConfirmar] = useState(false);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setFormError(null);

    const values = {
      nome,
      email,
      senha,
      confirmar_senha: confirmarSenha,
      nome_clinica: nomeClinica,
      consentimento_lgpd: consent,
    };
    const nextErrors = validate(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setSubmitting(true);
    try {
      await api.register({
        nome: nome.trim(),
        email: email.trim(),
        senha,
        nome_clinica: nomeClinica.trim(),
        consentimento_lgpd: true,
      });
      setSuccess(true);
    } catch (err) {
      // Backend messages are produced safely; fall back to a generic message.
      setFormError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível concluir o cadastro. Tente novamente.',
      );
    } finally {
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
        <span className={styles.eyebrow}>Criar conta</span>
        <h1 className={styles.title}>Cadastre sua clínica</h1>
        <p className={styles.subtitle}>
          Crie o acesso de administrador da clínica para começar a organizar a migração de
          dados administrativos.
        </p>

        {success ? (
          <>
            <div className={`${styles.alert} ${styles.alertSuccess}`} role="status">
              <CheckCircle2 size={18} aria-hidden="true" />
              <span>Cadastro realizado com sucesso. Faça login para continuar.</span>
            </div>
            <div className={styles.successActions}>
              <Link to="/login" className={styles.successLink}>
                Ir para o login
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </>
        ) : (
          <>
            {formError ? (
              <div className={`${styles.alert} ${styles.alertError}`} role="alert">
                {formError}
              </div>
            ) : null}

            <form className={styles.form} onSubmit={handleSubmit} noValidate>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="reg-nome">
                  Nome
                </label>
                <input
                  id="reg-nome"
                  className={`${styles.input} ${errors.nome ? styles.inputError : ''}`}
                  type="text"
                  autoComplete="name"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  aria-invalid={errors.nome ? true : undefined}
                  aria-describedby={errors.nome ? 'reg-nome-error' : undefined}
                />
                {errors.nome ? (
                  <span id="reg-nome-error" className={styles.fieldError}>
                    {errors.nome}
                  </span>
                ) : null}
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="reg-email">
                  E-mail
                </label>
                <input
                  id="reg-email"
                  className={`${styles.input} ${errors.email ? styles.inputError : ''}`}
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={errors.email ? true : undefined}
                  aria-describedby={errors.email ? 'reg-email-error' : undefined}
                />
                {errors.email ? (
                  <span id="reg-email-error" className={styles.fieldError}>
                    {errors.email}
                  </span>
                ) : null}
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="reg-senha">
                  Senha
                </label>
                <div className={styles.inputWrap}>
                  <input
                    id="reg-senha"
                    className={`${styles.input} ${styles.inputToggle} ${
                      errors.senha ? styles.inputError : ''
                    }`}
                    type={showSenha ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    aria-invalid={errors.senha ? true : undefined}
                    aria-describedby={errors.senha ? 'reg-senha-error' : 'reg-senha-hint'}
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
                {errors.senha ? (
                  <span id="reg-senha-error" className={styles.fieldError}>
                    {errors.senha}
                  </span>
                ) : (
                  <span id="reg-senha-hint" className={styles.hint}>
                    Mínimo de 10 caracteres, com ao menos uma letra e um número.
                  </span>
                )}
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="reg-confirmar">
                  Confirmar senha
                </label>
                <div className={styles.inputWrap}>
                  <input
                    id="reg-confirmar"
                    className={`${styles.input} ${styles.inputToggle} ${
                      errors.confirmar_senha ? styles.inputError : ''
                    }`}
                    type={showConfirmar ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmarSenha}
                    onChange={(e) => setConfirmarSenha(e.target.value)}
                    aria-invalid={errors.confirmar_senha ? true : undefined}
                    aria-describedby={
                      errors.confirmar_senha ? 'reg-confirmar-error' : undefined
                    }
                  />
                  <button
                    type="button"
                    className={styles.toggle}
                    onClick={() => setShowConfirmar((v) => !v)}
                    aria-label={showConfirmar ? 'Ocultar confirmação de senha' : 'Mostrar confirmação de senha'}
                    aria-pressed={showConfirmar}
                  >
                    {showConfirmar ? (
                      <EyeOff size={18} aria-hidden="true" />
                    ) : (
                      <Eye size={18} aria-hidden="true" />
                    )}
                  </button>
                </div>
                {errors.confirmar_senha ? (
                  <span id="reg-confirmar-error" className={styles.fieldError}>
                    {errors.confirmar_senha}
                  </span>
                ) : null}
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="reg-clinica">
                  Nome da clínica
                </label>
                <input
                  id="reg-clinica"
                  className={`${styles.input} ${errors.nome_clinica ? styles.inputError : ''}`}
                  type="text"
                  autoComplete="organization"
                  value={nomeClinica}
                  onChange={(e) => setNomeClinica(e.target.value)}
                  aria-invalid={errors.nome_clinica ? true : undefined}
                  aria-describedby={errors.nome_clinica ? 'reg-clinica-error' : undefined}
                />
                {errors.nome_clinica ? (
                  <span id="reg-clinica-error" className={styles.fieldError}>
                    {errors.nome_clinica}
                  </span>
                ) : null}
              </div>

              <div className={styles.field}>
                <label
                  className={`${styles.consent} ${consent ? styles.consentChecked : ''}`}
                  htmlFor="reg-consent"
                >
                  <input
                    id="reg-consent"
                    className={styles.checkbox}
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    aria-invalid={errors.consentimento_lgpd ? true : undefined}
                    aria-describedby={
                      errors.consentimento_lgpd ? 'reg-consent-error' : undefined
                    }
                  />
                  <span className={styles.consentLabel}>
                    Autorizo o tratamento dos dados administrativos da clínica conforme a LGPD.
                  </span>
                </label>
                {errors.consentimento_lgpd ? (
                  <span id="reg-consent-error" className={styles.fieldError}>
                    {errors.consentimento_lgpd}
                  </span>
                ) : null}
              </div>

              <button className={styles.submit} type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 size={16} className="spin" aria-hidden="true" />
                    Cadastrando…
                  </>
                ) : (
                  'Criar conta'
                )}
              </button>

              <p className={styles.hint}>
                A validação principal acontece no servidor; as checagens aqui apenas evitam
                erros simples antes do envio.
              </p>
            </form>

            <p className={styles.footer}>
              Já tem conta?{' '}
              <Link to="/login" className={styles.link}>
                Entrar
              </Link>
            </p>
          </>
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
