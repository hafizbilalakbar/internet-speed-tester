import type { Request } from 'express';
import net from 'node:net';
import { config } from '../config.js';
import { IpInfo } from '../types.js';

const cache = new Map<string, { value: IpInfo; at: number }>();
const TTL = 10 * 60 * 1000;

const PUBLIC_IP_ENDPOINTS = [
  'https://api.ipify.org?format=json',
  'https://api64.ipify.org?format=json',
  'https://ifconfig.me/ip',
  'https://icanhazip.com/',
];

const GEO_ENDPOINTS = (ip: string) => [
  `https://ipwho.is/${encodeURIComponent(ip)}`,
  `https://ipapi.co/${encodeURIComponent(ip)}/json/`,
];

export function clientIp(req: Request): string {
  let raw = '';
  if (config.trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      // With a single trusted reverse proxy, the rightmost hop is the address the proxy saw.
      const hops = forwarded.split(',').map(h => h.trim()).filter(Boolean);
      raw = hops[hops.length - 1] ?? '';
    }
  }
  if (!raw) raw = req.socket.remoteAddress ?? req.ip ?? '';
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
}

function blank(family: 'IPv4' | 'IPv6'): IpInfo {
  return { ip: null, family, isp: null, asn: null, org: null, city: null, region: null, country: null, countryCode: null, latitude: null, longitude: null, timezone: null, source: null };
}

async function fetchJson(url: string, timeoutMs: number, headers?: Record<string, string>): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers });
  return res.json();
}

async function detectPublicIp(): Promise<string | null> {
  for (const endpoint of PUBLIC_IP_ENDPOINTS) {
    try {
      const data = await fetchJson(endpoint, 5000);
      let ip: string | null = null;
      if (typeof data === 'string') ip = data.trim();
      else if (data && typeof data.ip === 'string') ip = data.ip.trim();
      if (ip && net.isIP(ip) && !isPrivate(ip)) return ip;
    } catch { /* try next endpoint */ }
  }
  return null;
}

export async function lookupIp(req: Request, wantFamily: '4' | '6' = '4'): Promise<IpInfo> {
  if (wantFamily === '6') {
    try {
      const data = await fetchJson('https://api64.ipify.org?format=json', 4000);
      const ip = typeof data === 'string' ? data.trim() : (data && typeof data.ip === 'string' ? data.ip.trim() : '');
      if (ip && net.isIP(ip) === 6) return { ...blank('IPv6'), ip, family: 'IPv6', source: 'api64.ipify.org' };
    } catch { /* IPv6 endpoint unreachable */ }
    return blank('IPv6');
  }

  const client = clientIp(req);
  if (!client || (!net.isIP(client) && !/^[a-z0-9.-]+$/i.test(client))) return blank('IPv4');
  const family: 'IPv4' | 'IPv6' = net.isIP(client) === 6 ? 'IPv6' : 'IPv4';

  // If the client address is public, look it up directly.
  if (net.isIP(client) && !isPrivate(client)) {
    return await lookupPublic(client, family);
  }

  // Client is behind NAT / loopback: detect the genuine public IP, then geolocate it.
  const publicIp = await detectPublicIp();
  if (publicIp) {
    return await lookupPublic(publicIp, family);
  }

  // No public IP could be detected. Return what we can from the client socket.
  return { ...blank(family), ip: client, family, source: 'Client socket (private/loopback address; public IP detection failed)' };
}

async function lookupPublic(ip: string, family: 'IPv4' | 'IPv6'): Promise<IpInfo> {
  const key = `${family}:${ip}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;

  let value = { ...blank(family), ip, family };

  // Try multiple geolocation providers in order.
  for (const endpoint of GEO_ENDPOINTS(ip)) {
    if (value.source) break;
    try {
      const d = await fetchJson(endpoint, 5000, { 'User-Agent': 'Netvelox/1.0' });

      if (endpoint.includes('ipwho.is')) {
        if (d.success !== false) {
          value = {
            ip: d.ip ?? ip, family,
            isp: d.connection?.isp ?? null,
            asn: d.connection?.asn ? `AS${d.connection.asn}` : null,
            org: d.connection?.org ?? null,
            city: d.city ?? null, region: d.region ?? null,
            country: d.country ?? null, countryCode: d.country_code ?? null,
            latitude: typeof d.latitude === 'number' ? d.latitude : null,
            longitude: typeof d.longitude === 'number' ? d.longitude : null,
            timezone: d.timezone?.id ?? null,
            source: 'ipwho.is (externally inferred)',
          };
        }
      } else if (endpoint.includes('ipapi.co')) {
        if (!d?.error) {
          value = {
            ...value,
            ip: d.ip ?? ip,
            isp: d.org ?? value.isp, asn: d.asn ?? value.asn, org: d.org ?? value.org,
            city: d.city ?? null, region: d.region ?? null,
            country: d.country_name ?? null, countryCode: d.country_code ?? null,
            latitude: typeof d.latitude === 'number' ? d.latitude : null,
            longitude: typeof d.longitude === 'number' ? d.longitude : null,
            timezone: d.timezone ?? null, source: 'ipapi.co (externally inferred)',
          };
        }
      }
    } catch { /* try next provider */ }
  }

  if (!value.source) value.source = 'client socket only (IP intelligence unavailable)';
  cache.set(key, { value, at: Date.now() });
  return value;
}

function isPrivate(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const p = ip.split('.').map(Number);
    return p[0] === 10 || p[0] === 127 || (p[0] === 192 && p[1] === 168) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 169 && p[1] === 254) || p[0] === 0;
  }
  return ip === '::1' || ip.startsWith('fe80') || ip.startsWith('fc') || ip.startsWith('fd');
}
