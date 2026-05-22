import type { Request, Response } from 'express';
import { z } from 'zod';
import { HttpError } from '../middlewares/errorHandler';
import { authService, type AuthContext } from '../services/authService';

// Validation is purely structural here. Normalization (trim/lowercase) lives in the
// service layer (authService.normalizeEmail) — single source of truth.
const RegisterSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório.').max(120),
  email: z.string().email('E-mail inválido.').max(180),
  senha: z
    .string()
    .min(10, 'Senha deve ter pelo menos 10 caracteres.')
    .max(200, 'Senha muito longa.')
    .regex(/[A-Za-z]/, 'Senha deve conter pelo menos uma letra.')
    .regex(/\d/, 'Senha deve conter pelo menos um número.'),
  nome_clinica: z.string().min(1, 'Nome da clínica é obrigatório.').max(160),
  consentimento_lgpd: z.literal(true, {
    errorMap: () => ({ message: 'Consentimento LGPD é obrigatório.' }),
  }),
});

const LoginSchema = z.object({
  email: z.string().email('E-mail inválido.').max(180),
  senha: z.string().min(1, 'Senha é obrigatória.').max(200),
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
    const result = await authService.register(input, buildContext(req));
    res.status(201).json({
      message: 'Cadastro realizado com sucesso. Faça login para continuar.',
      user: result.user,
      clinic: result.clinic,
    });
  },

  async login(req: Request, res: Response): Promise<void> {
    const input = parseOrThrow(LoginSchema, req.body);
    const result = await authService.login(input, buildContext(req));
    res.status(200).json({
      message: 'Login realizado com sucesso.',
      user: result.user,
      token: result.token,
      expires_in: result.expires_in,
    });
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
