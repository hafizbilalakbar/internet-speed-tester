import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import helmet from 'helmet';
import compression from 'compression';
import { rateLimit } from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { reportError } from './db.js';
import { measurementRouter } from './routes/measurement.js';
import { networkRouter } from './routes/network.js';
import { toolsRouter } from './routes/tools.js';
import { resultsRouter } from './routes/results.js';
import { aiRouter } from './routes/ai.js';
import { adminRouter } from './routes/admin.js';
import { requireInternal } from './middleware/auth.js';
import { heartbeat } from './services/server-registry.js';
import { asyncHandler } from './utils/async-handler.js';

export const app = express();
const here = path.dirname(fileURLToPath(import.meta.url));

app.set('trust proxy', config.trustProxy);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'https:'],
      'connect-src': ["'self'", ...config.corsOrigins, 'https:'],
      'font-src': ["'self'", 'data:'],
      'object-src': ["'none'"],
      'frame-ancestors': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
    },
  },
  crossOriginResourcePolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || config.corsOrigins.includes('*') || config.corsOrigins.includes(origin)) cb(null, true);
    else cb(new Error('Origin not allowed by CORS'));
  },
  credentials: false,
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'X-Node-Token', 'X-Result-Token'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  maxAge: 600,
}));
app.use(compression({
  filter: (req, res) => !req.path.includes('/tests/download') && compression.filter(req, res),
}));
app.use(express.json({ limit: '2mb' }));

app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Discovery must keep working even after repeated measurement bursts.
  skip: req => req.path === '/health' || req.path === '/servers',
}));
app.use('/api/tests/session', rateLimit({ windowMs: 60 * 1000, limit: 200, standardHeaders: 'draft-7', legacyHeaders: false, message: { message: 'Too many test sessions. Please wait a moment.' } }));
app.use('/api/results', rateLimit({ windowMs: 60 * 1000, limit: 40, standardHeaders: 'draft-7', legacyHeaders: false }));
app.use('/api/admin/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false }));

app.use('/api', measurementRouter);
app.use('/api', networkRouter);
app.use('/api', toolsRouter);
app.use('/api', resultsRouter);
app.use('/api', aiRouter);
app.use('/api', adminRouter);
app.post('/api/internal/heartbeat', requireInternal, asyncHandler(async (req, res) => {
  const body = z.object({
    serverId: z.string().min(2).max(60),
    latencyMs: z.number().min(0).max(60000).optional(),
    status: z.enum(['online', 'degraded', 'offline', 'unknown']).default('online'),
    loadPct: z.number().min(0).max(100).optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ message: 'Invalid heartbeat payload' }); return; }
  res.json(await heartbeat(body.data));
}));

app.use('/api', (_req, res) => res.status(404).json({ message: 'API endpoint not found' }));

// Optional single-process production hosting of the built Angular application.
const browserDist = path.resolve(here, '../../dist/netvelox/browser');
if (fs.existsSync(browserDist)) {
  app.use(express.static(browserDist, { index: false, maxAge: '1h' }));
  app.get('*', (_req, res) => res.sendFile(path.join(browserDist, 'index.html')));
}

app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  reportError(`${err.message} @ ${req.path}`, req.path);
  const status = (err as Error & { status?: number }).status ?? 500;
  res.status(status).json({ message: status === 500 ? 'Internal server error' : err.message });
});
