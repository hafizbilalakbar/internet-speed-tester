import { app } from './app.js';
import { config } from './config.js';
import { closeDb, initDb } from './db.js';
import { loadRegistryConfig, runHealthChecks } from './services/server-registry.js';

async function main(): Promise<void> {
  await initDb();
  await loadRegistryConfig();
  if (!config.admin.jwtSecret || config.admin.jwtSecret.startsWith('change-this')) {
    console.warn('[security] Set ADMIN_JWT_SECRET before exposing the admin console.');
  }
  if (!config.admin.passwordHash) console.warn('[security] Admin login is disabled: set ADMIN_PASSWORD_HASH (npm run hash-password -- "password").');

  const server = app.listen(config.port, () => {
    console.log(`[netvelox] API + measurement node listening on port ${config.port}`);
    console.log(`[netvelox] Node: ${config.node.name} (${config.node.id}) at ${config.node.host}`);
  });

  void runHealthChecks();
  const timer = setInterval(() => void runHealthChecks(), 60_000);
  timer.unref();

  const shutdown = () => {
    clearInterval(timer);
    server.close(async () => { await closeDb(); process.exit(0); });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

void main();
