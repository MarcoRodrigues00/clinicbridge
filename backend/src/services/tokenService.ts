import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import type { UserPapel } from '../models/user';

export interface AuthClaims {
  sub: string;
  clinica_id: string | null;
  papel: UserPapel;
}

const VALID_PAPEIS: readonly UserPapel[] = ['admin_sistema', 'dono_clinica', 'secretaria'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUserPapel(value: unknown): value is UserPapel {
  return typeof value === 'string' && (VALID_PAPEIS as readonly string[]).includes(value);
}

export const tokenService = {
  sign(claims: AuthClaims): string {
    const options: SignOptions = {
      expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
      algorithm: 'HS256',
    };
    return jwt.sign(claims, env.JWT_SECRET, options);
  },

  verify(token: string): AuthClaims {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    if (typeof decoded !== 'object' || decoded === null) {
      throw new Error('Invalid token payload');
    }
    const payload = decoded as jwt.JwtPayload;

    if (typeof payload.sub !== 'string' || !UUID_RE.test(payload.sub)) {
      throw new Error('Invalid token subject');
    }
    if (!isUserPapel(payload.papel)) {
      throw new Error('Invalid token papel');
    }

    const rawClinic = payload.clinica_id;
    let clinica_id: string | null;
    if (rawClinic === null || rawClinic === undefined) {
      clinica_id = null;
    } else if (typeof rawClinic === 'string' && UUID_RE.test(rawClinic)) {
      clinica_id = rawClinic;
    } else {
      throw new Error('Invalid token clinic');
    }

    return {
      sub: payload.sub,
      clinica_id,
      papel: payload.papel,
    };
  },
};
