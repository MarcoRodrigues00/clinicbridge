import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { api, ApiError, type PatientWritePayload, type PublicPatient } from '../services/api';
import { getToken } from '../services/authStorage';
import styles from './PatientEditForm.module.css';

// Edit-only form for an existing patient. Administrative fields ONLY — no clinical
// data. Used by the duplicates panel (Sprint 3.23) to fix a record in place. The
// patient list has its own create/edit form; this keeps that one untouched.

const FORBIDDEN_ROLE_MESSAGE =
  'Seu usuário não tem permissão para executar esta ação. Peça a um administrador da clínica.';

interface FormState {
  nome: string;
  telefone: string;
  email: string;
  cpf: string;
  data_nascimento: string;
  convenio: string;
  numero_carteirinha: string;
}

function emptyToNull(value: string): string | null {
  const t = value.trim();
  return t === '' ? null : t;
}

function fromPatient(p: PublicPatient): FormState {
  return {
    nome: p.nome,
    telefone: p.telefone ?? '',
    email: p.email ?? '',
    // CPF only ever comes back masked, so it can't be pre-filled; blank = keep.
    cpf: '',
    data_nascimento: p.data_nascimento ?? '',
    convenio: p.convenio ?? '',
    numero_carteirinha: p.numero_carteirinha ?? '',
  };
}

// Blank CPF means "keep the current one" (omit the key); a typed CPF replaces it.
function buildPayload(form: FormState): PatientWritePayload {
  const payload: PatientWritePayload = {
    nome: form.nome.trim(),
    telefone: emptyToNull(form.telefone),
    email: emptyToNull(form.email),
    data_nascimento: emptyToNull(form.data_nascimento),
    convenio: emptyToNull(form.convenio),
    numero_carteirinha: emptyToNull(form.numero_carteirinha),
  };
  const cpf = form.cpf.trim();
  if (cpf !== '') payload.cpf = cpf;
  return payload;
}

export function PatientEditForm({
  patient,
  onSaved,
  onCancel,
}: {
  patient: PublicPatient;
  onSaved: () => void;
  onCancel: () => void;
}): JSX.Element {
  const [form, setForm] = useState<FormState>(() => fromPatient(patient));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, value: string): void {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    if (form.nome.trim() === '') {
      setError('Informe o nome do paciente.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.updatePatient(token, patient.id, buildPayload(form));
      onSaved();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.code === 'forbidden_role'
            ? FORBIDDEN_ROLE_MESSAGE
            : err.message
          : 'Não foi possível salvar o paciente.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={(e) => void submit(e)}>
      <div className={styles.head}>
        <h4 className={styles.title}>Editar paciente</h4>
        <button
          type="button"
          className={styles.close}
          onClick={onCancel}
          aria-label="Fechar edição"
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>

      <div className={styles.grid}>
        <label className={styles.field}>
          <span className={styles.label}>Nome *</span>
          <input
            className={styles.input}
            value={form.nome}
            onChange={(e) => set('nome', e.target.value)}
            maxLength={200}
            required
            autoFocus
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Telefone</span>
          <input
            className={styles.input}
            value={form.telefone}
            onChange={(e) => set('telefone', e.target.value)}
            maxLength={40}
            inputMode="tel"
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>E-mail</span>
          <input
            className={styles.input}
            type="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            maxLength={180}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>CPF</span>
          <input
            className={styles.input}
            value={form.cpf}
            onChange={(e) => set('cpf', e.target.value)}
            inputMode="numeric"
            placeholder={
              patient.cpf_masked
                ? `Atual: ${patient.cpf_masked} (em branco mantém)`
                : 'Em branco mantém o atual'
            }
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Nascimento</span>
          <input
            className={styles.input}
            type="date"
            value={form.data_nascimento}
            onChange={(e) => set('data_nascimento', e.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Convênio</span>
          <input
            className={styles.input}
            value={form.convenio}
            onChange={(e) => set('convenio', e.target.value)}
            maxLength={120}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Nº da carteirinha</span>
          <input
            className={styles.input}
            value={form.numero_carteirinha}
            onChange={(e) => set('numero_carteirinha', e.target.value)}
            maxLength={60}
          />
        </label>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.actions}>
        <button type="submit" className={styles.save} disabled={saving}>
          {saving ? <Loader2 size={15} className={styles.spin} aria-hidden="true" /> : null}
          Salvar alterações
        </button>
        <button type="button" className={styles.cancel} onClick={onCancel} disabled={saving}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
