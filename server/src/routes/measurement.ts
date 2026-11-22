import { Router } from 'express';
import { randomUUID, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import type { Request, Response } from 'express';
import { config } from '../config.js';
import { clientIp } from '../services/ip-intelligence.js';
import { findServer, listServers, distanceKm } from '../services/server-registry.js';
import { dbAvailable, query } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';

export const measurementRouter = Router();

const payload = randomBytes(256 * 1024);
const SESSION_TTL_MS = 15 * 60 * 1000;
const MAX_SESSION_DOWNLOAD_BYTES = 2 * 1024 * 1024 * 1024;

interface TestSession {
  id: string;
  serverId: string;
  expiresAt: number;
  downloaded: number;
  uploaded: number;
}
const sessions = new Map<string, TestSession>();

function getSession(req: Request): TestSession | null {
  const id = String(req.query.session ?? '');
  const session = sessions.get(id);
  if (!session || session.expiresAt <= Date.now()) {
    if (session) sessions.delete(id);
    return null;
  }
  return session;
}

measurementRouter.get('/health', (_req, res) => {
  res.set('Cache-Control', 'no-store').json({ ok: true, service: 'netvelox-measurement', time: Date.now(), persistence: dbAvailable });
});

measurementRouter.get('/servers', asyncHandler(async (req, res) => {
  const servers = await listServers();
  const lat = Number(req.query.lat), lon = Number(req.query.lon);
  const withDistance = Number.isFinite(lat) && Number.isFinite(lon)
    ? servers.map(s => ({ ...s, distanceKm: s.latitude && s.longitude ? distanceKm(lat, lon, s.latitude, s.longitude) : null }))
    : servers;
  res.set('Cache-Control', 'no-store').json(withDistance);
}));

measurementRouter.get('/servers/:id/ping', (_req, res) => {
  res.set({ 'Cache-Control': 'no-store, no-transform', 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ pong: true, t: Date.now() }));
});

measurementRouter.post('/tests/session', asyncHandler(async (req, res) => {
  const serverId = typeof req.body?.serverId === 'string' ? req.body.serverId : '';
  const server = await findServer(serverId);
  if (!server) { res.status(404).json({ message: 'Unknown or disabled test server' }); return; }
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  sessions.set(sessionId, { id: sessionId, serverId: server.id, expiresAt: Date.now() + SESSION_TTL_MS, downloaded: 0, uploaded: 0 });
  if (sessions.size > 500) {
    for (const [id, value] of sessions) if (value.expiresAt <= Date.now()) sessions.delete(id);
  }
  void query(
    'INSERT INTO test_sessions (id, server_id, client_ip, user_agent, expires_at) VALUES ($1,$2,$3,$4,$5)',
    [sessionId, server.id, clientIp(req), (req.headers['user-agent'] ?? '').slice(0, 500), expiresAt],
  ).catch(() => undefined);
  res.set('Cache-Control', 'no-store').json({
    sessionId, server,
    baseUrl: server.host.replace(/\/$/, ''),
    config: {
      downloadDurationMs: config.test.downloadMs,
      uploadDurationMs: config.test.uploadMs,
      maxConnections: config.test.maxConnections,
      maxUploadBytes: config.test.maxUploadBytes,
      chunkBytes: config.test.chunkBytes,
      pingSamples: config.test.pingSamples,
      probeCount: config.test.probeCount,
    },
    expiresAt,
  });
}));

measurementRouter.get('/tests/ping', (_req, res) => {
  res.set({ 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no', 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ pong: true, t: Date.now() }));
});

measurementRouter.get('/tests/download', asyncHandler(async (req: Request, res: Response) => {
  const session = getSession(req);
  if (!session) { res.status(400).json({ message: 'A valid test session is required for download measurements.' }); return; }
  const requested = Number(req.query.size);
  const remaining = Math.max(0, MAX_SESSION_DOWNLOAD_BYTES - session.downloaded);
  if (remaining < 64 * 1024) { res.status(429).json({ message: 'Download budget for this session has been used.' }); return; }
  const size = Math.min(remaining, Number.isFinite(requested)
    ? Math.max(64 * 1024, Math.min(64 * 1024 * 1024, Math.floor(requested)))
    : config.test.chunkBytes);
  session.downloaded += size;

  res.status(200);
  res.set({
    'Content-Type': 'application/octet-stream',
    'Content-Length': String(size),
    'Cache-Control': 'no-store, no-cache, must-revalidate, no-transform',
    'Pragma': 'no-cache',
    'Content-Encoding': 'identity',
    'X-Accel-Buffering': 'no',
  });
  let aborted = false;
  res.on('close', () => { aborted = true; });
  let sent = 0;
  try {
    while (sent < size && !aborted && !res.destroyed) {
      const slice = payload.subarray(0, Math.min(payload.length, size - sent));
      sent += slice.length;
      if (!res.write(slice)) await Promise.race([once(res, 'drain'), once(res, 'close')]);
    }
    if (!aborted && !res.destroyed) res.end();
  } catch { res.destroy(); }
}));

measurementRouter.post('/tests/upload', (req: Request, res: Response) => {
  const session = getSession(req);
  if (!session) { res.status(400).json({ message: 'A valid test session is required for upload measurements.' }); return; }
  let received = 0;
  let limited = false;
  req.on('data', chunk => {
    if (limited) return;
    received += (chunk as Buffer).length;
    if (received > config.test.maxUploadRequestBytes || session.uploaded + received > config.test.maxUploadBytes) {
      limited = true;
      res.status(413).json({ message: 'Upload exceeds the configured per-session limit' });
      res.once('finish', () => req.destroy());
    }
  });
  req.on('end', () => {
    if (limited) return;
    session.uploaded += received;
    res.json({ received, ok: true });
  });
  req.on('error', () => { if (!res.headersSent) res.status(400).json({ message: 'Upload interrupted' }); });
});
