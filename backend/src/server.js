import { app } from './app.js';
import { logger } from './config/logger.js';
import { closePool, isUsingMockDb, query } from './db/database.js';
import { connectRedis, redis } from './services/redis.js';
import { startDraftMonitor, stopDraftMonitor } from './services/registrationDrafts.js';

const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

let server;

async function start() {
  if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required in production');
  }
  if (process.env.NODE_ENV === 'production' && !process.env.PUBLIC_APP_URL) {
    throw new Error('PUBLIC_APP_URL is required in production');
  }
  await connectRedis();
  if (process.env.NODE_ENV === 'production') {
    const result = await query("SELECT to_regclass('public.registration_drafts') AS table_name");
    if (isUsingMockDb() || result.rows[0]?.table_name !== 'registration_drafts') {
      throw new Error('PostgreSQL must be reachable and registration_drafts migration must be applied');
    }
  }
  server = app.listen(PORT, HOST, () => {
    logger.info({ port: PORT, host: HOST }, 'API listening');
  });
  startDraftMonitor();
}

async function shutdown(signal) {
  logger.info({ signal }, 'Shutting down');
  stopDraftMonitor();
  await redis.quit();
  await closePool();
  server?.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start().catch((err) => {
  logger.fatal({ err }, 'Startup failed');
  process.exit(1);
});
