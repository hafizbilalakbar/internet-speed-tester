import { Router, type Request } from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { clientIp as clientIpSafe } from '../services/ip-intelligence.js';
import { computeScore } from '../services/scoring.js';
import { asyncHandler } from '../utils/async-handler.js';

export const resultsRouter = Router();

const resultSchema = z.object({
  id: z.string().min(4).max(80),
  createdAt: z.string().datetime(),
  server: z.record(z.string(), z.unknown()),
  measurements: z.object({
    downloadMbps: z.number().nullable(),
    uploadMbps: z.number().nullable(),
    latency: z.object({
      avg: z.number().nullable(), jitter: z.number().nullable(), packetLossPct: z.number().nullable(),
      loadedDownload: z.number().nullable(), loadedUpload: z.number().nullable(),
    }).passthrough(),
    stability: z.object({ deviationPct: z.number().nullable() }).passthrough(),
  }).passthrough(),
  network: z.record(z.string(), z.unknown()),
  analysis: z.record(z.string(), z.unknown()),
  share: z.object({ ip: z.boolean(), isp: z.boolean(), location: z.boolean() }).default({ ip: false, isp: false, location: false }),
}).passthrough();

function ownerToken(req: Request): string {
  const value = req.header('x-result-token');
  return typeof value === 'string' ? value : '';
}

function tokenMatches(expected: string | null | undefined, supplied: string): boolean {
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Redact shared network data using the result owner's explicit privacy choices. */
function redactNetwork(network: unknown, share: unknown): Record<string, any> {
  const copy = JSON.parse(JSON.stringify(network ?? {})) as Record<string, any>;
  const flags = (share ?? {}) as { ip?: boolean; isp?: boolean; location?: boolean };
  const ipv4 = { ...(copy['ipv4'] ?? {}) };
  if (!flags.ip) {
    ipv4['ip'] = null;
    if (copy['ipv6']) copy['ipv6'] = { ...copy['ipv6'], ip: null };
  }
  if (!flags.isp) {
    ipv4['isp'] = null;
    ipv4['asn'] = null;
    ipv4['org'] = null;
  }
  if (!flags.location) {
    for (const key of ['city', 'region', 'country', 'countryCode', 'latitude', 'longitude']) ipv4[key] = null;
    copy['preciseLocation'] = null;
  }
  copy['ipv4'] = ipv4;
  return copy;
}

resultsRouter.post('/results', asyncHandler(async (req, res) => {
  const parsed = resultSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: 'Invalid result payload', issues: parsed.error.issues.slice(0, 5) }); return; }
  const r = parsed.data;
  const score = computeScore(r.measurements as any);
  const shareToken = randomBytes(18).toString('base64url');
  const resultOwnerToken = randomBytes(24).toString('base64url');
  const ip = clientIpSafe(req);
  try {
    await query(
      `INSERT INTO test_results (id, share_token, owner_token, created_at, server_id, server_snapshot, measurements, score, analysis, network, share, client_ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE SET share_token=EXCLUDED.share_token, owner_token=EXCLUDED.owner_token,
         score=EXCLUDED.score, analysis=EXCLUDED.analysis, share=EXCLUDED.share`,
      [r.id, shareToken, resultOwnerToken, r.createdAt, String((r.server as any).id ?? 'unknown'), JSON.stringify(r.server),
       JSON.stringify(r.measurements), JSON.stringify(score), JSON.stringify(r.analysis), JSON.stringify(r.network),
       JSON.stringify(r.share), ip],
    );
  } catch {
    res.status(503).json({ message: 'Result storage is temporarily unavailable. The result was saved on this device.' });
    return;
  }
  res.status(201).json({ ...r, score, shareToken, ownerToken: resultOwnerToken });
}));

resultsRouter.get('/results/:id', asyncHandler(async (req, res) => {
  if (!ownerToken(req)) { res.status(404).json({ message: 'Result not found' }); return; }
  const row = await queryOne<Record<string, any>>('SELECT * FROM test_results WHERE id=$1', [req.params.id]);
  if (!row || !tokenMatches(row.owner_token as string | null, ownerToken(req))) {
    res.status(404).json({ message: 'Result not found' });
    return;
  }
  res.set('Cache-Control', 'no-store');
  res.json({
    id: row.id, shareToken: row.share_token, createdAt: row.created_at,
    server: row.server_snapshot, measurements: row.measurements, score: row.score,
    analysis: row.analysis, network: row.network, share: row.share,
  });
}));

resultsRouter.put('/results/:id/share', asyncHandler(async (req, res) => {
  const share = z.object({ ip: z.boolean(), isp: z.boolean(), location: z.boolean() }).safeParse(req.body);
  if (!share.success) { res.status(400).json({ message: 'Invalid share settings' }); return; }
  const token = ownerToken(req);
  if (!token) { res.status(404).json({ message: 'Result not found' }); return; }
  const row = await queryOne<{ share_token: string; owner_token: string }>(
    'UPDATE test_results SET share=$1 WHERE id=$2 AND owner_token=$3 RETURNING share_token, owner_token',
    [JSON.stringify(share.data), req.params.id, token],
  );
  if (!row) { res.status(404).json({ message: 'Result not found' }); return; }
  res.json({ share: share.data, shareToken: row.share_token });
}));

resultsRouter.get('/share/:token', asyncHandler(async (req, res) => {
  const row = await queryOne<Record<string, any>>('SELECT * FROM test_results WHERE share_token=$1', [req.params.token]);
  if (!row) { res.status(404).json({ message: 'Shared result not found' }); return; }
  res.set('Cache-Control', 'no-store');
  res.json({
    id: row.id, createdAt: row.created_at, server: row.server_snapshot,
    measurements: row.measurements, score: row.score, analysis: row.analysis,
    network: redactNetwork(row.network, row.share), shareToken: null, share: row.share,
  });
}));

resultsRouter.get('/stats/global', asyncHandler(async (_req, res) => {
  try {
    const row = await queryOne<{ count: string; down: string | null; up: string | null; ping: string | null }>(
      `SELECT COUNT(*)::text AS count,
              AVG((measurements->>'downloadMbps')::numeric)::text AS down,
              AVG((measurements->>'uploadMbps')::numeric)::text AS up,
              AVG((measurements->'latency'->>'avg')::numeric)::text AS ping
       FROM test_results WHERE created_at > now() - interval '90 days'`,
    );
    const sampleSize = Number(row?.count ?? 0);
    res.json({
      sampleSize, reportingPeriod: 'last 90 days', lastUpdated: new Date().toISOString(),
      insufficient: sampleSize < 50,
      methodology: 'Only real completed tests stored by Netvelox in the reporting period. Rankings are not published below 50 samples per group.',
      averageDownloadMbps: row?.down ? +Number(row.down).toFixed(2) : null,
      averageUploadMbps: row?.up ? +Number(row.up).toFixed(2) : null,
      averagePingMs: row?.ping ? +Number(row.ping).toFixed(1) : null,
    });
  } catch {
    res.json({ sampleSize: 0, insufficient: true, message: 'Statistics are unavailable until the database is configured.' });
  }
}));
