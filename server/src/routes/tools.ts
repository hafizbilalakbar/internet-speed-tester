import { Router } from 'express';
import net from 'node:net';
import tls from 'node:tls';
import { lookup } from 'node:dns/promises';
import { lookupIp } from '../services/ip-intelligence.js';
import { asyncHandler } from '../utils/async-handler.js';

export const toolsRouter = Router();
const HOST_RE = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

function normalizeIp(ip: string): string {
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

function isPrivate(ip: string): boolean {
  const value = normalizeIp(ip);
  if (net.isIPv4(value)) {
    const p = value.split('.').map(Number);
    return p[0] === 10 || p[0] === 127 || (p[0] === 192 && p[1] === 168) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31)
      || (p[0] === 169 && p[1] === 254) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127) || p[0] === 0;
  }
  const lower = value.toLowerCase();
  return lower === '::1' || lower.startsWith('fe80') || lower.startsWith('fc') || lower.startsWith('fd');
}

async function assertPublicHost(hostname: string): Promise<boolean> {
  if (net.isIP(hostname)) return !isPrivate(hostname);
  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    return addresses.length > 0 && addresses.every(a => !isPrivate(a.address));
  } catch { return false; }
}

async function safeUrl(input: unknown): Promise<URL | null> {
  try {
    const u = new URL(String(input));
    if (!['http:', 'https:'].includes(u.protocol)) return null;
    if (!HOST_RE.test(u.hostname) && !net.isIP(u.hostname)) return null;
    if (!(await assertPublicHost(u.hostname))) return null;
    return u;
  } catch { return null; }
}

/** DNS over HTTPS: real DNS resolution with measured response time. */
toolsRouter.get('/tools/dns', asyncHandler(async (req, res) => {
  const name = String(req.query.name ?? '').trim().toLowerCase();
  const type = String(req.query.type ?? 'A').toUpperCase();
  if (!HOST_RE.test(name) || !/^(A|AAAA|CNAME|MX|TXT|NS|SOA|PTR)$/.test(type)) { res.status(400).json({ message: 'Invalid hostname or record type' }); return; }
  const t0 = performance.now();
  try {
    const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`;
    const response = await fetch(url, { headers: { Accept: 'application/dns-json' }, signal: AbortSignal.timeout(6000) });
    const data = await response.json() as { Status?: number; Answer?: { name: string; type: number; TTL: number; data: string }[] };
    res.json({ name, type, status: data.Status, answers: data.Answer ?? [], responseMs: +(performance.now() - t0).toFixed(1), resolver: 'Cloudflare DNS over HTTPS' });
  } catch { res.status(502).json({ message: 'DNS lookup failed. Check the hostname and try again.' }); }
}));

toolsRouter.get('/tools/headers', asyncHandler(async (req, res) => {
  const url = await safeUrl(req.query.url);
  if (!url) { res.status(400).json({ message: 'Provide a valid public http(s) URL' }); return; }
  const t0 = performance.now();
  try {
    const response = await fetch(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(7000), headers: { 'User-Agent': 'Netvelox-Header-Check/1.0' } });
    const headers: Record<string, string> = {};
    response.headers.forEach((v, k) => { if (k !== 'set-cookie') headers[k] = v.slice(0, 500); });
    res.json({ url: url.toString(), status: response.status, statusText: response.statusText, headers, responseMs: +(performance.now() - t0).toFixed(1), httpVersion: 'HTTP/1.1+ (as seen by Node fetch)' });
  } catch { res.status(502).json({ message: 'Header request failed. The target may be offline or blocking requests.' }); }
}));

toolsRouter.get('/tools/tls', asyncHandler(async (req, res) => {
  const host = String(req.query.host ?? '').trim().toLowerCase();
  if (!HOST_RE.test(host) || !(await assertPublicHost(host))) { res.status(400).json({ message: 'Provide a valid public hostname' }); return; }
  const t0 = performance.now();
  const socket = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: true }, () => {
    const cert = socket.getPeerCertificate();
    res.json({
      host, protocol: socket.getProtocol(), cipher: socket.getCipher().name,
      authorized: socket.authorized, authorizationError: socket.authorizationError ?? null,
      subject: cert.subject, issuer: cert.issuer,
      validFrom: cert.valid_from, validTo: cert.valid_to,
      handshakeMs: +(performance.now() - t0).toFixed(1),
    });
    socket.end();
  });
  socket.setTimeout(6000, () => { socket.destroy(); if (!res.headersSent) res.status(504).json({ message: 'TLS handshake timed out' }); });
  socket.on('error', () => { if (!res.headersSent) res.status(502).json({ message: 'TLS handshake failed' }); });
}));

toolsRouter.get('/tools/connectivity', asyncHandler(async (_req, res) => {
  const targets = ['https://one.one.one.one/', 'https://www.google.com/'];
  const checks = await Promise.all(targets.map(async target => {
    const t0 = performance.now();
    try {
      const r = await fetch(target, { signal: AbortSignal.timeout(5000), method: 'HEAD' });
      return { target, ok: r.ok, status: r.status, ms: +(performance.now() - t0).toFixed(1) };
    } catch { return { target, ok: false, status: null, ms: null }; }
  }));
  res.json({ checks, checkedAt: new Date().toISOString() });
}));

toolsRouter.get('/tools/ipv6', asyncHandler(async (req, res) => {
  res.json(await lookupIp(req, '6'));
}));
