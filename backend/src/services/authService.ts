import { db } from '../config/db';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { auditLogDao } from '../dao/auditLogDao';
import { clinicDao } from '../dao/clinicDao';
import { mfaBackupCodeDao } from '../dao/mfaBackupCodeDao';
import { userDao } from '../dao/userDao';
import { HttpError } from '../middlewares/errorHandler';
import { toPublicClinic, type PublicClinic } from '../models/clinic';
import { toSafeUser, type SafeUser, type UserRow } from '../models/user';
import { decryptSecret, encryptSecret } from '../config/mfaCrypto';
import { mfaBackupCodeService } from './mfaBackupCodeService';
import { passwordService } from './passwordService';
import { tokenService } from './tokenService';
import { totpService } from './totpService';
import { generateInviteCode } from '../utils/inviteCode';

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

// Staff (secretaria) self-registration (Sprint 3.24): creates a user with NO
// clinic. They then request to join a clinic by its invite code; the owner approves.
export interface RegisterStaffInput {
  nome: string;
  email: string;
  senha: string;
  consentimento_lgpd: true;
}
export interface RegisterStaffResult {
  user: SafeUser;
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
  // Count of UNUSED backup codes. Never the codes themselves (Sprint 3.21).
  backup_codes_remaining: number;
}

// Returned ONLY when codes are (re)generated — the plaintext codes are shown to
// the user this one time and never again.
export interface MfaConfirmResult extends MfaStatusResult {
  backup_codes: string[];
}
export interface MfaBackupCodesResult {
  backup_codes: string[];
  count: number;
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

// Guided demo (Sprint 5.0E). The demo-login endpoint can ONLY ever authenticate
// this exact identity in this exact clinic — both are fixed server-side so the
// request can never select a different (real) user or tenant.
const DEMO_OWNER_EMAIL = 'demo.owner@clinicbridge.local';
const DEMO_CLINIC_NAME = 'Clínica Demo Aurora';

// Generates an invite code not currently in use. Collisions are astronomically
// unlikely (31^8); the unique index is the real guard, this just avoids the rare retry.
async function generateUniqueInviteCode(): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const code = generateInviteCode();
    const existing = await clinicDao.findByInviteCode(code);
    if (!existing) return code;
  }
  throw new HttpError(500, 'internal_error', 'Não foi possível concluir o cadastro.');
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
    const inviteCode = await generateUniqueInviteCode();

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
            invite_code: inviteCode,
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

  // Staff self-registration (Sprint 3.24): no clinic is created. The user is
  // 'secretaria' with clinica_id=null until a clinic owner approves their join
  // request — so requireClinic blocks every tenant route in the meantime.
  async registerStaff(input: RegisterStaffInput, ctx: AuthContext): Promise<RegisterStaffResult> {
    const email = normalizeEmail(input.email);

    const existing = await userDao.findByEmail(email);
    if (existing) {
      throw new HttpError(409, 'email_already_used', 'E-mail já cadastrado.');
    }

    const senha_hash = await passwordService.hash(input.senha);

    let user: UserRow;
    try {
      user = await userDao.create({ nome: input.nome, email, senha_hash, papel: 'secretaria' });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new HttpError(409, 'email_already_used', 'E-mail já cadastrado.');
      }
      throw err;
    }

    await safeAudit({
      acao: 'auth.register.staff.success',
      usuario_id: user.id,
      clinica_id: null,
      ctx,
    });

    return { user: toSafeUser(user) };
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

  // Guided demo login (Sprint 5.0E). Issues a normal session for the pre-seeded
  // demo owner of "Clínica Demo Aurora" — no credentials are accepted and the
  // identity/tenant are hard-coded here, so this can never reach a real account.
  // Guards, in order, so we never even look up a user when the feature is off:
  //   1. NODE_ENV=production       -> 403 demo_disabled (dev/staging-only)
  //   2. ALLOW_DEMO_LOGIN !== true -> 403 demo_disabled
  //   3. demo not seeded / wrong clinic -> 409 demo_not_available
  // The issued JWT carries the demo user's real papel/clinica_id — no elevated
  // permissions, full tenant isolation preserved.
  async demoLogin(ctx: AuthContext): Promise<LoginResult> {
    if (env.NODE_ENV === 'production') {
      throw new HttpError(403, 'demo_disabled', 'Demonstração indisponível neste ambiente.');
    }
    if (!env.ALLOW_DEMO_LOGIN) {
      throw new HttpError(403, 'demo_disabled', 'Demonstração indisponível neste ambiente.');
    }

    const unavailable = new HttpError(
      409,
      'demo_not_available',
      'A demonstração ainda não foi preparada neste ambiente.',
    );

    const user = await userDao.findByEmail(DEMO_OWNER_EMAIL);
    if (!user || !user.ativo || !user.clinica_id) {
      throw unavailable;
    }

    // The demo owner MUST belong to the demo clinic — defends against a renamed
    // or repurposed account ever being driven through this endpoint.
    const clinic = await clinicDao.findById(user.clinica_id);
    if (!clinic || clinic.nome !== DEMO_CLINIC_NAME) {
      throw unavailable;
    }

    await userDao.touchLastLogin(user.id);
    await safeAudit({
      acao: 'auth.demo.login.success',
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

    // Accept either a valid TOTP code OR a single-use backup code. The error is
    // identical for any failure, so a caller can't tell which factor was wrong
    // (or whether the account exists).
    const secret = decryptSecret(user.mfa_secret_encrypted);
    const totpOk = totpService.verify(input.code, secret);
    const usedBackupCode = totpOk ? false : await mfaBackupCodeService.consume(user.id, input.code);

    if (!totpOk && !usedBackupCode) {
      await safeAudit({
        acao: 'auth.mfa.login.failure',
        usuario_id: user.id,
        clinica_id: user.clinica_id,
        ctx,
      });
      throw invalid;
    }

    if (usedBackupCode) {
      await safeAudit({
        acao: 'auth.mfa.backup_code.used.success',
        usuario_id: user.id,
        clinica_id: user.clinica_id,
        ctx,
      });
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

  // Confirms setup: verifies a code against the pending secret, then activates MFA
  // and generates the first set of backup codes (returned ONCE in this response).
  async mfaConfirm(userId: string, code: string, ctx: AuthContext): Promise<MfaConfirmResult> {
    const user = await userDao.findById(userId);
    if (!user || !user.ativo) throw new HttpError(401, 'unauthorized', 'Sessão inválida.');
    if (user.mfa_enabled) throw new HttpError(409, 'mfa_already_enabled', 'MFA já está ativado.');
    if (!user.mfa_pending_secret_encrypted || !user.mfa_pending_created_at) {
      throw new HttpError(400, 'mfa_setup_required', 'Inicie a configuração do MFA primeiro.');
    }
    const pendingEncrypted = user.mfa_pending_secret_encrypted;
    const ageMs = Date.now() - new Date(user.mfa_pending_created_at).getTime();
    if (ageMs > 10 * 60 * 1000) {
      throw new HttpError(400, 'mfa_setup_expired', 'Configuração expirada. Recomece a ativação.');
    }
    const secret = decryptSecret(pendingEncrypted);
    if (!totpService.verify(code, secret)) {
      throw new HttpError(400, 'invalid_mfa_code', 'Código inválido.');
    }

    // Enable MFA and store the backup-code hashes atomically.
    const { codes, hashes } = await mfaBackupCodeService.generate();
    await db.transaction(async (trx) => {
      await userDao.enableMfa(userId, pendingEncrypted, trx);
      await mfaBackupCodeDao.replaceForUser(userId, hashes, trx);
    });
    await safeAudit({
      acao: 'auth.mfa.setup.confirmed',
      usuario_id: user.id,
      clinica_id: user.clinica_id,
      ctx,
    });
    await safeAudit({
      acao: 'auth.mfa.backup_codes.generated.success',
      usuario_id: user.id,
      clinica_id: user.clinica_id,
      ctx,
    });
    const updated = await userDao.findById(userId);
    return {
      mfa_enabled: true,
      mfa_enabled_at: updated?.mfa_enabled_at ? new Date(updated.mfa_enabled_at).toISOString() : null,
      backup_codes_remaining: codes.length,
      backup_codes: codes,
    };
  },

  async mfaStatus(userId: string): Promise<MfaStatusResult> {
    const user = await userDao.findById(userId);
    if (!user || !user.ativo) throw new HttpError(401, 'unauthorized', 'Sessão inválida.');
    const remaining = user.mfa_enabled ? await mfaBackupCodeDao.countUnusedByUser(userId) : 0;
    return {
      mfa_enabled: user.mfa_enabled,
      mfa_enabled_at: user.mfa_enabled_at ? new Date(user.mfa_enabled_at).toISOString() : null,
      backup_codes_remaining: remaining,
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

    // Disabling MFA also discards all backup codes (they only exist while MFA is on).
    await db.transaction(async (trx) => {
      await userDao.disableMfa(userId, trx);
      await mfaBackupCodeDao.deleteForUser(userId, trx);
    });
    await safeAudit({
      acao: 'auth.mfa.disable.success',
      usuario_id: user.id,
      clinica_id: user.clinica_id,
      ctx,
    });
    return { mfa_enabled: false, mfa_enabled_at: null, backup_codes_remaining: 0 };
  },

  // Regenerates the backup-code set for a user who already has MFA enabled.
  // Requires a valid current TOTP code (same factor that disable requires), and
  // invalidates the previous set by replacing it. Returns the new plaintext codes
  // ONCE in this response.
  async regenerateBackupCodes(
    userId: string,
    code: string,
    ctx: AuthContext,
  ): Promise<MfaBackupCodesResult> {
    const user = await userDao.findById(userId);
    if (!user || !user.ativo) throw new HttpError(401, 'unauthorized', 'Sessão inválida.');
    if (!user.mfa_enabled || !user.mfa_secret_encrypted) {
      throw new HttpError(400, 'mfa_not_enabled', 'MFA não está ativado.');
    }
    const secret = decryptSecret(user.mfa_secret_encrypted);
    if (!totpService.verify(code, secret)) {
      await safeAudit({
        acao: 'auth.mfa.backup_codes.regenerate.failure',
        usuario_id: user.id,
        clinica_id: user.clinica_id,
        ctx,
      });
      throw new HttpError(400, 'invalid_mfa_code', 'Código inválido.');
    }

    const { codes, hashes } = await mfaBackupCodeService.generate();
    await mfaBackupCodeDao.replaceForUser(userId, hashes);
    await safeAudit({
      acao: 'auth.mfa.backup_codes.regenerated.success',
      usuario_id: user.id,
      clinica_id: user.clinica_id,
      ctx,
    });
    return { backup_codes: codes, count: codes.length };
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
