import { db } from '../config/db';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { auditLogDao } from '../dao/auditLogDao';
import { clinicDao } from '../dao/clinicDao';
import { userDao } from '../dao/userDao';
import { HttpError } from '../middlewares/errorHandler';
import { toPublicClinic, type PublicClinic } from '../models/clinic';
import { toSafeUser, type SafeUser, type UserRow } from '../models/user';
import { decryptSecret, encryptSecret } from '../config/mfaCrypto';
import { passwordService } from './passwordService';
import { tokenService } from './tokenService';
import { totpService } from './totpService';

// Captured at the controller boundary and threaded down so audit events can be
// written without the service touching the HTTP request object directly.
export interface AuthContext {
  ip: string | null;
  user_agent: string | null;
  request_id: string | null;
}

export interface RegisterInput {
  nome: string;
  email: string;
  senha: string;
  nome_clinica: string;
  consentimento_lgpd: true;
}

export interface RegisterResult {
  user: SafeUser;
  clinic: PublicClinic;
}

export interface LoginInput {
  email: string;
  senha: string;
}

export interface LoginResult {
  user: SafeUser;
  token: string;
  expires_in: string;
}

// When MFA is enabled, login does NOT issue a session token. It returns a
// short-lived challenge token; the client must call verifyMfaLogin with the code.
export interface MfaChallengeResult {
  mfa_required: true;
  mfa_challenge_token: string;
}
export type LoginOutcome = LoginResult | MfaChallengeResult;

export interface MfaSetupResult {
  otpauth_url: string;
  manual_key: string;
  qr_data_url: string;
}
export interface MfaStatusResult {
  mfa_enabled: boolean;
  mfa_enabled_at: string | null;
}

export interface MeResult {
  user: SafeUser;
  clinic: PublicClinic | null;
}

// Sentinel hash used to keep login response time constant when the user is missing,
// preventing user enumeration via timing analysis (STRIDE: Information Disclosure).
// Generated lazily on first miss; the plaintext is never accepted as a valid password
// because the no-user path always throws regardless of verify() result.
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = passwordService.hash(
      'cb-dummy-' + Math.random().toString(36).slice(2),
    );
  }
  return dummyHashPromise;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Builds the final session (JWT) for an authenticated user. Used by the non-MFA
// login path and by verifyMfaLogin after a valid TOTP code.
function buildSession(user: UserRow): LoginResult {
  const token = tokenService.sign({
    sub: user.id,
    clinica_id: user.clinica_id,
    papel: user.papel,
  });
  return { user: toSafeUser(user), token, expires_in: env.JWT_EXPIRES_IN };
}

interface PgUniqueViolation {
  code: '23505';
}
function isUniqueViolation(err: unknown): err is PgUniqueViolation {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === '23505'
  );
}

// Audit writes are best-effort: a logging failure must never cascade into an
// auth failure (or silently change auth behavior). We log the error and move on.
async function safeAudit(input: {
  acao: string;
  usuario_id: string | null;
  clinica_id: string | null;
  ctx: AuthContext;
}): Promise<void> {
  try {
    await auditLogDao.create({
      acao: input.acao,
      usuario_id: input.usuario_id,
      clinica_id: input.clinica_id,
      recurso: 'auth',
      recurso_id: null,
      ip: input.ctx.ip,
      user_agent: input.ctx.user_agent,
      request_id: input.ctx.request_id,
    });
  } catch (err) {
    // audit_write_failed:true is a stable field that monitoring can alert on
    // even if the DB error code below varies between drivers.
    logger.error(
      { err, acao: input.acao, audit_write_failed: true },
      'audit log write failed',
    );
  }
}

export const authService = {
  async register(input: RegisterInput, ctx: AuthContext): Promise<RegisterResult> {
    const email = normalizeEmail(input.email);

    const existing = await userDao.findByEmail(email);
    if (existing) {
      throw new HttpError(409, 'email_already_used', 'E-mail já cadastrado.');
    }

    const senha_hash = await passwordService.hash(input.senha);

    let result: RegisterResult;
    try {
      result = await db.transaction(async (trx) => {
        const user = await userDao.create(
          {
            nome: input.nome,
            email,
            senha_hash,
            papel: 'dono_clinica',
          },
          trx,
        );

        const clinic = await clinicDao.create(
          {
            nome: input.nome_clinica,
            responsavel_id: user.id,
            consentimento_lgpd: input.consentimento_lgpd,
            contrato_aceito_em: new Date(),
          },
          trx,
        );

        await userDao.setClinic(user.id, clinic.id, trx);

        const safeUser: SafeUser = {
          ...toSafeUser(user),
          clinica_id: clinic.id,
        };

        return { user: safeUser, clinic: toPublicClinic(clinic) };
      });
    } catch (err) {
      // Race condition closer: two concurrent registrations of the same email both pass
      // the pre-check and reach the transaction. The DB unique constraint fires for the
      // loser; surface a clean 409 instead of leaking the DB error.
      if (isUniqueViolation(err)) {
        throw new HttpError(409, 'email_already_used', 'E-mail já cadastrado.');
      }
      throw err;
    }

    await safeAudit({
      acao: 'auth.register.success',
      usuario_id: result.user.id,
      clinica_id: result.clinic.id,
      ctx,
    });

    return result;
  },

  async login(input: LoginInput, ctx: AuthContext): Promise<LoginOutcome> {
    const email = normalizeEmail(input.email);

    // Same response and approximate timing for "user not found", "user inactive",
    // and "wrong password" to avoid user enumeration.
    const invalid = new HttpError(401, 'invalid_credentials', 'E-mail ou senha inválidos.');

    const user = await userDao.findByEmail(email);
    const targetHash = user?.senha_hash ?? (await getDummyHash());
    const passwordOk = await passwordService.verify(targetHash, input.senha);

    if (!user || !user.ativo || !passwordOk) {
      await safeAudit({
        acao: 'auth.login.failure',
        usuario_id: user ? user.id : null,
        clinica_id: user ? user.clinica_id : null,
        ctx,
      });
      throw invalid;
    }

    // MFA gate: password is correct, but a TOTP code is still required. Do NOT
    // issue a session token yet — return a short-lived challenge instead.
    if (user.mfa_enabled) {
      await safeAudit({
        acao: 'auth.mfa.login.challenge',
        usuario_id: user.id,
        clinica_id: user.clinica_id,
        ctx,
      });
      return { mfa_required: true, mfa_challenge_token: tokenService.signMfaChallenge(user.id) };
    }

    await userDao.touchLastLogin(user.id);
    await safeAudit({
      acao: 'auth.login.success',
      usuario_id: user.id,
      clinica_id: user.clinica_id,
      ctx,
    });
    return buildSession(user);
  },

  // Second step of MFA login: verifies the challenge token + TOTP code, then
  // issues the real session. Generic 401 on any failure (no enumeration).
  async verifyMfaLogin(
    input: { challenge_token: string; code: string },
    ctx: AuthContext,
  ): Promise<LoginResult> {
    const invalid = new HttpError(401, 'invalid_mfa_code', 'Código inválido ou expirado.');

    let userId: string;
    try {
      userId = tokenService.verifyMfaChallenge(input.challenge_token);
    } catch {
      throw invalid;
    }

    const user = await userDao.findById(userId);
    if (!user || !user.ativo || !user.mfa_enabled || !user.mfa_secret_encrypted) {
      await safeAudit({
        acao: 'auth.mfa.login.failure',
        usuario_id: user ? user.id : null,
        clinica_id: user ? user.clinica_id : null,
        ctx,
      });
      throw invalid;
    }

    const secret = decryptSecret(user.mfa_secret_encrypted);
    if (!totpService.verify(input.code, secret)) {
      await safeAudit({
        acao: 'auth.mfa.login.failure',
        usuario_id: user.id,
        clinica_id: user.clinica_id,
        ctx,
      });
      throw invalid;
    }

    await userDao.touchMfaVerified(user.id);
    await userDao.touchLastLogin(user.id);
    await safeAudit({
      acao: 'auth.mfa.login.success',
      usuario_id: user.id,
      clinica_id: user.clinica_id,
      ctx,
    });
    return buildSession(user);
  },

  // Starts MFA setup for an authenticated user: generates a secret (stored as a
  // PENDING encrypted secret) and returns the otpauth URL + QR + manual key. The
  // secret is only ever returned here, during setup — never after MFA is enabled.
  async mfaSetup(userId: string, ctx: AuthContext): Promise<MfaSetupResult> {
    const user = await userDao.findById(userId);
    if (!user || !user.ativo) throw new HttpError(401, 'unauthorized', 'Sessão inválida.');
    if (user.mfa_enabled) throw new HttpError(409, 'mfa_already_enabled', 'MFA já está ativado.');

    const secret = totpService.generateSecret();
    await userDao.setPendingMfaSecret(userId, encryptSecret(secret));
    const otpauth = totpService.otpauthUrl(user.email, secret);
    const qr = await totpService.qrDataUrl(otpauth);

    await safeAudit({
      acao: 'auth.mfa.setup.started',
      usuario_id: user.id,
      clinica_id: user.clinica_id,
      ctx,
    });
    return { otpauth_url: otpauth, manual_key: secret, qr_data_url: qr };
  },

  // Confirms setup: verifies a code against the pending secret, then activates MFA.
  async mfaConfirm(userId: string, code: string, ctx: AuthContext): Promise<MfaStatusResult> {
    const user = await userDao.findById(userId);
    if (!user || !user.ativo) throw new HttpError(401, 'unauthorized', 'Sessão inválida.');
    if (user.mfa_enabled) throw new HttpError(409, 'mfa_already_enabled', 'MFA já está ativado.');
    if (!user.mfa_pending_secret_encrypted || !user.mfa_pending_created_at) {
      throw new HttpError(400, 'mfa_setup_required', 'Inicie a configuração do MFA primeiro.');
    }
    const ageMs = Date.now() - new Date(user.mfa_pending_created_at).getTime();
    if (ageMs > 10 * 60 * 1000) {
      throw new HttpError(400, 'mfa_setup_expired', 'Configuração expirada. Recomece a ativação.');
    }
    const secret = decryptSecret(user.mfa_pending_secret_encrypted);
    if (!totpService.verify(code, secret)) {
      throw new HttpError(400, 'invalid_mfa_code', 'Código inválido.');
    }

    await userDao.enableMfa(userId, user.mfa_pending_secret_encrypted);
    await safeAudit({
      acao: 'auth.mfa.setup.confirmed',
      usuario_id: user.id,
      clinica_id: user.clinica_id,
      ctx,
    });
    const updated = await userDao.findById(userId);
    return {
      mfa_enabled: true,
      mfa_enabled_at: updated?.mfa_enabled_at ? new Date(updated.mfa_enabled_at).toISOString() : null,
    };
  },

  async mfaStatus(userId: string): Promise<MfaStatusResult> {
    const user = await userDao.findById(userId);
    if (!user || !user.ativo) throw new HttpError(401, 'unauthorized', 'Sessão inválida.');
    return {
      mfa_enabled: user.mfa_enabled,
      mfa_enabled_at: user.mfa_enabled_at ? new Date(user.mfa_enabled_at).toISOString() : null,
    };
  },

  // Disables MFA. Requires a valid current TOTP code (not just the password).
  async mfaDisable(userId: string, code: string, ctx: AuthContext): Promise<MfaStatusResult> {
    const user = await userDao.findById(userId);
    if (!user || !user.ativo) throw new HttpError(401, 'unauthorized', 'Sessão inválida.');
    if (!user.mfa_enabled || !user.mfa_secret_encrypted) {
      throw new HttpError(400, 'mfa_not_enabled', 'MFA não está ativado.');
    }
    const secret = decryptSecret(user.mfa_secret_encrypted);
    if (!totpService.verify(code, secret)) {
      await safeAudit({
        acao: 'auth.mfa.disable.failure',
        usuario_id: user.id,
        clinica_id: user.clinica_id,
        ctx,
      });
      throw new HttpError(400, 'invalid_mfa_code', 'Código inválido.');
    }

    await userDao.disableMfa(userId);
    await safeAudit({
      acao: 'auth.mfa.disable.success',
      usuario_id: user.id,
      clinica_id: user.clinica_id,
      ctx,
    });
    return { mfa_enabled: false, mfa_enabled_at: null };
  },

  async me(userId: string): Promise<MeResult> {
    const user = await userDao.findById(userId);
    if (!user || !user.ativo) {
      // Token was valid, but the underlying user is gone or has been deactivated.
      // 401 (not 403) because the session itself is no longer valid.
      throw new HttpError(401, 'unauthorized', 'Sessão inválida.');
    }

    let clinic: PublicClinic | null = null;
    if (user.clinica_id) {
      const clinicRow = await clinicDao.findById(user.clinica_id);
      if (!clinicRow) {
        // The DB says the user belongs to a clinic that no longer exists.
        // 403 (not 404) because: (a) the user's spec allows 403 or 404 here,
        // (b) 403 better matches the semantics (session is valid, context is
        // inconsistent, access refused), and (c) the response code/message
        // stay neutral so an attacker cannot use this to enumerate clinic
        // deletion events.
        throw new HttpError(403, 'forbidden', 'Acesso negado.');
      }
      clinic = toPublicClinic(clinicRow);
    }

    return { user: toSafeUser(user), clinic };
  },
};
