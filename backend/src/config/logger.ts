import pino from 'pino';
import { env } from './env';

const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'password',
  'senha',
  'senha_hash',
  'cpf',
  'token',
  'access_token',
  'refresh_token',
];

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: redactPaths,
    remove: true,
  },
  base: { service: 'clinicbridge-backend' },
});
