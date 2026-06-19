import { config } from './config.js';
import { closePool } from './db.js';
import { startMailWatchers, stopMailWatchers } from './push/mailWatcher.js';
import { buildServer } from './server.js';

async function main(): Promise<void> {
  const app = await buildServer();

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    stopMailWatchers();
    await app.close();
    await closePool();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ host: config.API_HOST, port: config.API_PORT });
    startMailWatchers(app.log);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
