import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export interface AuthPayload { sub: string; email: string; role: 'admin' | 'operator'; }

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, config.admin.jwtSecret, { expiresIn: '12h' });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || !config.admin.jwtSecret) { res.status(401).json({ message: 'Authentication required' }); return; }
  try {
    const payload = jwt.verify(token, config.admin.jwtSecret) as AuthPayload;
    if (payload.role !== 'admin') { res.status(403).json({ message: 'Administrator role required' }); return; }
    (req as Request & { auth: AuthPayload }).auth = payload;
    next();
  } catch { res.status(401).json({ message: 'Invalid or expired session' }); }
}

export function requireInternal(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers['x-node-token'];
  if (!config.admin.internalToken || token !== config.admin.internalToken) { res.status(401).json({ message: 'Unauthorized node' }); return; }
  next();
}
