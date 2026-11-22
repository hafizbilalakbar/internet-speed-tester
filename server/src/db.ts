import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;
const pool = new Pool({
  connectionString: config.databaseUrl,
  host: config.databaseUrl ? undefined : (process.env.PGHOST ?? 'localhost'),
  port: config.databaseUrl ? undefined : Number(process.env.PGPORT ?? 5432),
  database: config.databaseUrl ? undefined : (process.env.PGDATABASE ?? 'netvelox'),
  user: config.databaseUrl ? undefined : (process.env.PGUSER ?? 'netvelox'),
  password: config.databaseUrl ? undefined : (process.env.PGPASSWORD ?? 'netvelox'),
  max: 12,
  idleTimeoutMillis: 30_000,
});

export let dbAvailable = false;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operator',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS test_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id TEXT NOT NULL,
  client_ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS test_results (
  id TEXT PRIMARY KEY,
  share_token TEXT UNIQUE,
  owner_token TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  server_id TEXT NOT NULL,
  server_snapshot JSONB NOT NULL,
  measurements JSONB NOT NULL,
  score JSONB NOT NULL,
  analysis JSONB NOT NULL,
  network JSONB NOT NULL,
  share JSONB NOT NULL DEFAULT '{"ip":false,"isp":false,"location":false}',
  client_ip TEXT
);
ALTER TABLE test_results ADD COLUMN IF NOT EXISTS owner_token TEXT;
CREATE INDEX IF NOT EXISTS idx_results_created ON test_results (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_results_server ON test_results (server_id);
CREATE TABLE IF NOT EXISTS server_health (
  id BIGSERIAL PRIMARY KEY,
  server_id TEXT NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  latency_ms NUMERIC,
  status TEXT NOT NULL,
  load_pct NUMERIC
);
CREATE INDEX IF NOT EXISTS idx_health_server_time ON server_health (server_id, checked_at DESC);
CREATE TABLE IF NOT EXISTS ai_analyses (
  id BIGSERIAL PRIMARY KEY,
  result_id TEXT,
  provider TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS admin_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS error_reports (
  id BIGSERIAL PRIMARY KEY,
  level TEXT NOT NULL DEFAULT 'error',
  message TEXT NOT NULL,
  path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

export async function initDb(): Promise<void> {
  try {
    await pool.query(SCHEMA);
    const nodes = [config.node, ...config.regionalNodes];
    for (const n of nodes) {
      await pool.query(
        `INSERT INTO server_health (server_id, status) VALUES ($1, 'unknown')`,
        [n.id],
      ).catch(() => undefined);
    }
    if (config.admin.passwordHash) {
      await pool.query(
        `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'admin')
         ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
        [config.admin.email, config.admin.passwordHash],
      );
    }
    dbAvailable = true;
    console.log('[db] PostgreSQL connected');
  } catch (e) {
    dbAvailable = false;
    console.warn('[db] PostgreSQL unavailable:', (e as Error).message);
    console.warn('[db] Measurement endpoints still work; persistence and admin analytics are disabled until the database is configured.');
  }
}

export async function query<T extends Record<string, unknown> = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  if (!dbAvailable) throw new Error('Database unavailable');
  const res = await pool.query(text, params);
  return res.rows as T[];
}

export async function queryOne<T extends Record<string, unknown> = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export function reportError(message: string, path?: string): void {
  console.error(`[error] ${message}${path ? ` @ ${path}` : ''}`);
  if (!dbAvailable) return;
  void query('INSERT INTO error_reports (message, path) VALUES ($1,$2)', [message.slice(0, 1000), path ?? null]).catch(() => undefined);
}

export async function closeDb(): Promise<void> { await pool.end().catch(() => undefined); }
