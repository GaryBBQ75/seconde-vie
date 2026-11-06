import { createApp } from './app.js';
import { createDatabase } from './db.js';
import { bootstrap } from './bootstrap.js';

const env = process.env;
if (env.NODE_ENV === 'production' && (!env.DATABASE_URL || env.DEMO_MODE === 'true')) {
  throw new Error('Le mode production exige PostgreSQL et ne permet pas les comptes de démonstration.');
}
const db = await createDatabase({ url: env.DATABASE_URL, directory: env.DB_DIR || './data/postgres' });
await bootstrap(db, env);
const server = createApp(db, env).listen(Number(env.PORT || 3000), env.HOST || '127.0.0.1', () => {
  console.log(`Seconde Vie · port ${server.address().port}`);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close(() => db.close().then(() => process.exit(0))));
}
