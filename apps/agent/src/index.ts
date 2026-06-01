import { config } from './config.js';
import { buildAgent } from './server.js';

async function main(): Promise<void> {
  const app = await buildAgent();

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ host: config.AGENT_HOST, port: config.AGENT_PORT });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
