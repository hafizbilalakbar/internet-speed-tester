import { Router } from 'express';
import { lookupIp, clientIp } from '../services/ip-intelligence.js';
import { asyncHandler } from '../utils/async-handler.js';

export const networkRouter = Router();

networkRouter.get('/network/ip', asyncHandler(async (req, res) => {
  const family = req.query.v === '6' ? '6' : '4';
  const info = await lookupIp(req, family);
  res.set('Cache-Control', 'private, max-age=60').json(info);
}));

networkRouter.get('/network/socket', (req, res) => {
  res.json({ clientIp: clientIp(req), family: clientIp(req).includes(':') ? 'IPv6' : 'IPv4', source: 'server socket (not inferred geolocation)' });
});
