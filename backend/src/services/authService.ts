import { db } from '../config/db';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { auditLogDao } from '../dao/auditLogDao';
import { clinicDao } from '../dao/clinicDao';
import { userDao } from '../dao/userDao';
import { HttpError } from '../middlewares/errorHandler';
import { toPublicClinic, type PublicClinic } from '../models/clinic';
import { toSafeUser, type SafeUser } from '../models/user';
import { passwordService } from './passwordService';
import { tokenService } from './tokenService';

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

  async login(input: LoginInput, ctx: AuthContext): Promise<LoginResult> {
    const email = normalizeEmail(input.email);

    // Same response and approximate timing for "user not found", "user inactive",
    // and "wrong password" to avoid user enumeration.
    const invalid = new HttpError(401, 'invalid_credentials', 'E-mail ou senha inválidos.');

    const user = await userDao.findByEmail(email);
    const targetHash = user?.senha_hash ?? (await getDummyHash());
    const passwordOk = await passwordService.verify(targetHash, input.senha);

    if (!user || !user.ativo || !passwordOk) {
      // Known-user failures attach the usuario_id / clinica_id so brute-force
      // attempts against a real account can be detected per-user. Unknown-user
      // failures stay anonymous (no enumeration leakage via audit_logs).
      await safeAudit({
        acao: 'auth.login.failure',
        usuario_id: user ? user.id : null,
        clinica_id: user ? user.clinica_id : null,
        ctx,
      });
      throw invalid;
    }

    await userDao.touchLastLogin(user.id);

    const token = tokenService.sign({
      sub: user.id,
      clinica_id: user.clinica_id,
      papel: user.papel,
    });

    await safeAudit({
      acao: 'auth.login.success',
      usuario_id: user.id,
      clinica_id: user.clinica_id,
      ctx,
    });

    return {
      user: toSafeUser(user),
      token,
      expires_in: env.JWT_EXPIRES_IN,
    };
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
