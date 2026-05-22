import 'dotenv/config';
import knex from 'knex';
import config from '../knexfile';

type Command = 'migrate:latest' | 'migrate:rollback' | 'migrate:status';

async function main(): Promise<void> {
  const cmd = process.argv[2] as Command | undefined;
  if (!cmd) {
    // eslint-disable-next-line no-console
    console.error('Usage: tsx scripts/db.ts <migrate:latest|migrate:rollback|migrate:status>');
    process.exit(2);
  }

  const envKey = process.env.NODE_ENV ?? 'development';
  const cfg = config[envKey] ?? config.development;
  if (!cfg) {
    // eslint-disable-next-line no-console
    console.error(`No knex config for NODE_ENV=${envKey}`);
    process.exit(2);
  }
  const db = knex(cfg);

  try {
    if (cmd === 'migrate:latest') {
      const [batch, files] = await db.migrate.latest();
      // eslint-disable-next-line no-console
      console.log(`Migrated batch ${batch}:`, files.length ? files : '(none — already up to date)');
    } else if (cmd === 'migrate:rollback') {
      const [batch, files] = await db.migrate.rollback();
      // eslint-disable-next-line no-console
      console.log(`Rolled back batch ${batch}:`, files.length ? files : '(none)');
    } else if (cmd === 'migrate:status') {
      const completed = await db.migrate.list();
      // eslint-disable-next-line no-console
      console.log('Completed:', completed[0]);
      // eslint-disable-next-line no-console
      console.log('Pending:', completed[1]);
    } else {
      // eslint-disable-next-line no-console
      console.error(`Unknown command: ${cmd}`);
      process.exit(2);
    }
  } finally {
    await db.destroy();
  }
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('[db] failed:', err);
  process.exit(1);
});
