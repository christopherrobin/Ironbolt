import { env } from './env.js';
import { buildApp } from './app.js';

const app = await buildApp();

try {
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

const shutdown = async () => {
  app.log.info('Shutting down...');
  try {
    await app.close();
    process.exit(0);
  } catch (err) {
    app.log.error(err, 'Error during shutdown');
    process.exit(1);
  }
};

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
