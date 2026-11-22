import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { config } from '../config.js';
import { query, queryOne } from '../db.js';
import { requireAdmin, signToken } from '../middleware/auth.js';
import { listServers, nodes, loadRegistryConfig, saveCustomNodes, saveOverrides, registryOverrides, heartbeat } from '../services/server-registry.js';
import { asyncHandler } from '../utils/async-handler.js';

export const adminRouter = Router();

adminRouter.post('/admin/login', asyncHandler(async (req, res) => {
  const body = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ message: 'Email and password required' }); return; }
  try {
    const user = await queryOne<{ id: string; email: string; role: 'admin' | 'operator'; password_hash: string }>(
      'SELECT id,email,role,password_hash FROM users WHERE lower(email)=lower($1)', [body.data.email],
    );
    if (!user || !(await bcrypt.compare(body.data.password, user.password_hash))) {
      res.status(401).json({ message: 'Invalid credentials' }); return;
    }
    res.json({ token: signToken({ sub: user.id, email: user.email, role: user.role }), user: { email: user.email, role: user.role } });
  } catch { res.status(503).json({ message: 'Authentication service unavailable' }); }
}));

adminRouter.use('/admin', requireAdmin);

adminRouter.get('/admin/overview', asyncHandler(async (_req, res) => {
  try {
    const [totals] = await query<Record<string, string | null>>(
      `SELECT COUNT(*)::text AS total,
              COUNT(*) FILTER (WHERE created_at > now() - interval '1 day')::text AS daily,
              COUNT(*) FILTER (WHERE created_at > now() - interval '7 days')::text AS weekly,
              COUNT(*) FILTER (WHERE created_at > now() - interval '30 days')::text AS monthly,
              ROUND(AVG((measurements->>'downloadMbps')::numeric),2)::text AS avg_down,
              ROUND(AVG((measurements->>'uploadMbps')::numeric),2)::text AS avg_up,
              ROUND(AVG((measurements->'latency'->>'avg')::numeric),1)::text AS avg_ping
       FROM test_results`,
    );
    const activeSessions = await queryOne<{ count: string }>('SELECT COUNT(*)::text AS count FROM test_sessions WHERE expires_at > now()');
    const errors = await queryOne<{ count: string }>('SELECT COUNT(*)::text AS count FROM error_reports');
    const aiUsage = await queryOne<{ count: string }>('SELECT COUNT(*)::text AS count FROM ai_analyses');
    const servers = await listServers();
    res.json({
      totalTests: Number(totals?.total ?? 0), dailyTests: Number(totals?.daily ?? 0),
      weeklyTests: Number(totals?.weekly ?? 0), monthlyTests: Number(totals?.monthly ?? 0),
      activeSessions: Number(activeSessions?.count ?? 0), failedTests: Number(errors?.count ?? 0),
      aiAnalyses: Number(aiUsage?.count ?? 0),
      avgDownloadMbps: totals?.avg_down ? Number(totals.avg_down) : null,
      avgUploadMbps: totals?.avg_up ? Number(totals.avg_up) : null,
      avgPingMs: totals?.avg_ping ? Number(totals.avg_ping) : null,
      serverCount: servers.length, onlineServers: servers.filter(s => s.status === 'online').length,
      environment: config.env, aiProvider: config.ai.provider,
      database: 'connected',
    });
  } catch { res.status(503).json({ message: 'Database unavailable' }); }
}));

adminRouter.get('/admin/servers', asyncHandler(async (_req, res) => res.json(await listServers())));

adminRouter.put('/admin/servers/:id', asyncHandler(async (req, res) => {
  const body = z.object({ enabled: z.boolean().optional(), loadPct: z.number().min(0).max(100).optional(), capacity: z.string().max(40).optional() }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ message: 'Invalid server settings' }); return; }
  const id = req.params.id;
  if (!nodes().some(n => n.id === id)) { res.status(404).json({ message: 'Unknown server' }); return; }
  const overrides = { ...registryOverrides(), [id]: { ...(registryOverrides()[id] ?? {}), ...body.data } };
  await saveOverrides(overrides);
  res.json({ ok: true, overrides: registryOverrides() });
}));

adminRouter.post('/admin/servers', asyncHandler(async (req, res) => {
  const body = z.object({
    id: z.string().regex(/^[a-z0-9-]{2,40}$/), name: z.string().min(2).max(60), city: z.string().max(60),
    country: z.string().max(60), countryCode: z.string().max(8), host: z.string().url(),
    region: z.string().max(40), latitude: z.number(), longitude: z.number(), provider: z.string().max(60),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ message: 'Invalid node definition', issues: body.error.issues.slice(0, 3) }); return; }
  const current = nodes().filter(n => !config.regionalNodes.some(r => r.id === n.id) && n.id !== config.node.id);
  if (current.some(n => n.id === body.data.id)) { res.status(409).json({ message: 'Server id already exists' }); return; }
  await saveCustomNodes([...current, body.data]);
  await loadRegistryConfig();
  res.status(201).json({ ok: true, server: body.data });
}));

adminRouter.get('/admin/results', asyncHandler(async (_req, res) => {
  try { res.json(await query('SELECT id, created_at, server_id, measurements, score FROM test_results ORDER BY created_at DESC LIMIT 100')); }
  catch { res.status(503).json({ message: 'Database unavailable' }); }
}));

adminRouter.get('/admin/errors', asyncHandler(async (_req, res) => {
  try { res.json(await query('SELECT id, level, message, path, created_at FROM error_reports ORDER BY created_at DESC LIMIT 100')); }
  catch { res.status(503).json({ message: 'Database unavailable' }); }
}));

adminRouter.get('/admin/config', (_req, res) => res.json({ test: config.test, ai: { provider: config.ai.provider, model: config.ai.model }, corsOrigins: config.corsOrigins }));

adminRouter.put('/admin/config', asyncHandler(async (req, res) => {
  const body = z.object({ key: z.string().min(2).max(40), value: z.unknown() }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ message: 'Invalid configuration' }); return; }
  await query(`INSERT INTO admin_config (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`, [body.data.key, JSON.stringify(body.data.value)]);
  res.json({ ok: true, note: 'Stored setting saved. Runtime test tuning requires a service restart.' });
}));

adminRouter.post('/admin/heartbeat', asyncHandler(async (req, res) => {
  const body = z.object({
    serverId: z.string().min(2).max(60),
    latencyMs: z.number().min(0).max(60000).optional(),
    status: z.enum(['online', 'degraded', 'offline', 'unknown']).default('online'),
    loadPct: z.number().min(0).max(100).optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ message: 'Invalid heartbeat' }); return; }
  res.json(await heartbeat(body.data));
}));
