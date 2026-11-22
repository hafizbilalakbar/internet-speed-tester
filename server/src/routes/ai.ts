import { Router } from 'express';
import { z } from 'zod';
import { analyze } from '../services/ai-engine.js';
import { query } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';

export const aiRouter = Router();

const schema = z.object({
  measurements: z.object({
    downloadMbps: z.number().nullable(), uploadMbps: z.number().nullable(),
    latency: z.object({ avg: z.number().nullable(), jitter: z.number().nullable(), packetLossPct: z.number().nullable(), loadedDownload: z.number().nullable(), loadedUpload: z.number().nullable() }).passthrough(),
    stability: z.object({ deviationPct: z.number().nullable() }).passthrough(),
  }).passthrough(),
  server: z.object({ name: z.string() }).passthrough(),
});

aiRouter.post('/ai/analyze', asyncHandler(async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: 'Invalid measurements' }); return; }
  const analysis = await analyze(parsed.data.measurements as any, parsed.data.server.name);
  void query('INSERT INTO ai_analyses (provider, payload) VALUES ($1,$2)', [analysis.provider, JSON.stringify(analysis)]).catch(() => undefined);
  res.json(analysis);
}));
