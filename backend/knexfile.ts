import 'dotenv/config';
import path from 'node:path';
import type { Knex } from 'knex';

if (!process.env.DATABASE_URL) {
  // eslint-disable-next-line no-console
  console.error('[knexfile] DATABASE_URL is required');
  process.exit(1);
}

const base: Knex.Config = {
  client: 'pg',
  connection: process.env.DATABASE_URL,
  pool: { min: 2, max: 10 },
  migrations: {
    directory: path.resolve(__dirname, 'migrations'),
    extension: 'ts',
    loadExtensions: ['.ts', '.js'],
    tableName: 'knex_migrations',
  },
};

const config: { [env: string]: Knex.Config } = {
  development: base,
  test: base,
  production: {
    ...base,
    pool: { min: 2, max: 20 },
  },
};

export default config;
