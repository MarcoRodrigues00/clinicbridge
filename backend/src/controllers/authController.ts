import type { Request, Response } from 'express';
import { z } from 'zod';
import { HttpError } from '../middlewares/errorHandler';
import { authService, type AuthContext } from '../services/authService';

// Validation is purely structural here. Normalization (trim/lowercase) lives in the
// service layer (authService.normalizeEmail) — single source of truth.
// account_type is optional and defaults to 'owner' (backward compatible with the
// original register payload). 'staff' (Sprint 3.24) registers a secretaria with no
// clinic; nome_clinica is only required for 'owner'.
const RegisterSchema = z.object({
  account_type: z.enum(['owner', 'staff']).optional(),
  nome: z.string().min(1, 'Nome é obrigatório.').max(120),
  email: z.string().email('E-mail inválido.').max(180),
  senha: z
    .string()
    .min(10, 'Senha deve ter pelo menos 10 caracteres.')
    .max(200, 'Senha muito longa.')
    .regex(/[A-Za-z]/, 'Senha deve conter pelo menos uma letra.')
    .regex(/\d/, 'Senha deve conter pelo menos um número.'),
  nome_clinica: z.string().max(160).optional(),
  consentimento_lgpd: z.literal(true, {
    errorMap: () => ({ message: 'Consentimento LGPD é obrigatório.' }),
  }),
});

const LoginSchema = z.object({
  email: z.string().email('E-mail inválido.').max(180),
  senha: z.string().min(1, 'Senha é obrigatória.').max(200),
});

const VerifyMfaLoginSchema = z.object({
  challenge_token: z.string().min(1, 'Token de desafio é obrigatório.').max(2000),
  // Accepts a 6-digit TOTP code OR a formatted backup code (e.g. ABCDE-FGHJK),
  // so the cap is larger than the TOTP-only schemas below.
  code: z.string().min(1, 'Código é obrigatório.').max(32),
});

const MfaCodeSchema = z.object({
  code: z.string().min(1, 'Código é obrigatório.').max(12),
});

function parseOrThrow<T extends z.ZodTypeAny>(schema: T, body: unknown): z.output<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    const fields = result.error.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message,
    }));
    throw new HttpError(400, 'validation_failed', 'Dados inválidos.', { fields });
  }
  return result.data;
}

function buildContext(req: Request): AuthContext {
  const ua = req.headers['user-agent'];
  return {
    ip: req.ip ?? null,
    user_agent: typeof ua === 'string' ? ua : null,
    request_id: req.requestId ?? null,
  };
}

export const authController = {
  async register(req: Request, res: Response): Promise<void> {
    const input = parseOrThrow(RegisterSchema, req.body);

    // Staff: no clinic created; user joins later via an approved request.
    if (input.account_type === 'staff') {
      const result = await authService.registerStaff(
        {
          nome: input.nome,
          email: input.email,
          senha: input.senha,
          consentimento_lgpd: true,
        },
        buildContext(req),
      );
      res.status(201).json({
        message:
          'Cadastro realizado. Faça login e solicite entrada na clínica com o código de convite.',
        user: result.user,
      });
      return;
    }

    // Owner (default): nome_clinica is required.
    if (!input.nome_clinica || input.nome_clinica.trim().length === 0) {
      throw new HttpError(400, 'validation_failed', 'Dados inválidos.', {
        fields: [{ field: 'nome_clinica', message: 'Nome da clínica é obrigatório.' }],
      });
    }
    const result = await authService.register(
      {
        nome: input.nome,
        email: input.email,
        senha: input.senha,
        nome_clinica: input.nome_clinica,
        consentimento_lgpd: true,
      },
      buildContext(req),
    );
    res.status(201).json({
      message: 'Cadastro realizado com sucesso. Faça login para continuar.',
      user: result.user,
      clinic: result.clinic,
    });
  },

  async login(req: Request, res: Response): Promise<void> {
    const input = parseOrThrow(LoginSchema, req.body);
    const result = await authService.login(input, buildContext(req));
    // MFA-enabled accounts get a challenge instead of a session token.
    if ('mfa_required' in result) {
      res.status(200).json({
        mfa_required: true,
        mfa_challenge_token: result.mfa_challenge_token,
      });
      return;
    }
    res.status(200).json({
      message: 'Login realizado com sucesso.',
      user: result.user,
      token: result.token,
      expires_in: result.expires_in,
    });
  },

  // Guided demo login (Sprint 5.0E). No request body is read — the demo identity
  // is fixed server-side. Returns the same shape as a normal login.
  async demoLogin(req: Request, res: Response): Promise<void> {
    const result = await authService.demoLogin(buildContext(req));
    res.status(200).json({
      message: 'Sessão de demonstração iniciada.',
      user: result.user,
      token: result.token,
      expires_in: result.expires_in,
    });
  },

  async verifyMfaLogin(req: Request, res: Response): Promise<void> {
    const input = parseOrThrow(VerifyMfaLoginSchema, req.body);
    const result = await authService.verifyMfaLogin(input, buildContext(req));
    res.status(200).json({
      message: 'Login realizado com sucesso.',
      user: result.user,
      token: result.token,
      expires_in: result.expires_in,
    });
  },

  async mfaSetup(req: Request, res: Response): Promise<void> {
    if (!req.auth) throw new HttpError(401, 'unauthorized', 'Autenticação necessária.');
    const result = await authService.mfaSetup(req.auth.sub, buildContext(req));
    res.status(200).json(result);
  },

  async mfaConfirm(req: Request, res: Response): Promise<void> {
    if (!req.auth) throw new HttpError(401, 'unauthorized', 'Autenticação necessária.');
    const input = parseOrThrow(MfaCodeSchema, req.body);
    const result = await authService.mfaConfirm(req.auth.sub, input.code, buildContext(req));
    res.status(200).json(result);
  },

  async mfaStatus(req: Request, res: Response): Promise<void> {
    if (!req.auth) throw new HttpError(401, 'unauthorized', 'Autenticação necessária.');
    const result = await authService.mfaStatus(req.auth.sub);
    res.status(200).json(result);
  },

  async mfaDisable(req: Request, res: Response): Promise<void> {
    if (!req.auth) throw new HttpError(401, 'unauthorized', 'Autenticação necessária.');
    const input = parseOrThrow(MfaCodeSchema, req.body);
    const result = await authService.mfaDisable(req.auth.sub, input.code, buildContext(req));
    res.status(200).json(result);
  },

  // Regenerates backup codes (requires a valid current TOTP code). The new codes
  // are returned only in this response and the previous set is invalidated.
  async regenerateMfaBackupCodes(req: Request, res: Response): Promise<void> {
    if (!req.auth) throw new HttpError(401, 'unauthorized', 'Autenticação necessária.');
    const input = parseOrThrow(MfaCodeSchema, req.body);
    const result = await authService.regenerateBackupCodes(req.auth.sub, input.code, buildContext(req));
    res.status(200).json(result);
  },

  async me(req: Request, res: Response): Promise<void> {
    // requireAuth has already populated req.auth.
    if (!req.auth) {
      throw new HttpError(401, 'unauthorized', 'Autenticação necessária.');
    }
    const result = await authService.me(req.auth.sub);
    res.status(200).json({
      user: result.user,
      clinic: result.clinic,
    });
  },
};
