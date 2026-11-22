import { config, NodeDefinition } from '../config.js';
import { query, queryOne } from '../db.js';

export interface PublicServer extends NodeDefinition {
  latencyMs: number | null;
  loadPct: number | null;
  status: 'online' | 'degraded' | 'offline' | 'unknown';
  distanceKm: number | null;
  protocols: string[];
}

let customNodes: NodeDefinition[] = [];
let overrides: Record<string, { enabled?: boolean; loadPct?: number; capacity?: string }> = {};

export async function loadRegistryConfig(): Promise<void> {
  try {
    const custom = await query<{ value: NodeDefinition[] }>(`SELECT value FROM admin_config WHERE key='customNodes'`);
    if (custom[0]?.value && Array.isArray(custom[0].value)) customNodes = custom[0].value;
    const over = await query<{ value: typeof overrides }>(`SELECT value FROM admin_config WHERE key='serverOverrides'`);
    if (over[0]?.value) overrides = over[0].value;
  } catch { /* database optional */ }
}

export function nodes(): NodeDefinition[] { return [config.node, ...config.regionalNodes, ...customNodes]; }
export function registryOverrides() { return overrides; }
export async function saveCustomNodes(list: NodeDefinition[]): Promise<void> {
  customNodes = list;
  await query(`INSERT INTO admin_config (key,value) VALUES ('customNodes',$1) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`, [JSON.stringify(list)]);
}
export async function saveOverrides(next: typeof overrides): Promise<void> {
  overrides = next;
  await query(`INSERT INTO admin_config (key,value) VALUES ('serverOverrides',$1) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`, [JSON.stringify(next)]);
}

export async function listServers(): Promise<PublicServer[]> {
  const result: PublicServer[] = [];
  for (const n of nodes()) {
    const o = overrides[n.id] ?? {};
    let status: PublicServer['status'] = 'online';
    let latencyMs: number | null = null;
    try {
      const row = await queryOne<{ status: string; latency_ms: number | string | null }>(
        `SELECT status, latency_ms FROM server_health WHERE server_id=$1 ORDER BY checked_at DESC LIMIT 1`, [n.id],
      );
      if (row) { status = row.status as PublicServer['status']; latencyMs = row.latency_ms === null ? null : Number(row.latency_ms); }
    } catch { status = 'unknown'; }
    if (o.enabled === false) status = 'offline';
    result.push({
      ...n, capacity: o.capacity ?? n.capacity ?? null,
      latencyMs, loadPct: o.loadPct ?? null, status, distanceKm: null,
      protocols: (n as NodeDefinition & { protocols?: string[] }).protocols ?? ['HTTP/1.1'],
    });
  }
  return result;
}

export async function findServer(id: string): Promise<PublicServer | undefined> {
  return (await listServers()).find(s => s.id === id && s.status !== 'offline');
}

/** Self health probe. Measures a real local HTTP round trip; external nodes report via heartbeat. */
export async function runHealthChecks(): Promise<void> {
  for (const n of nodes()) {
    const t0 = performance.now();
    let status: PublicServer['status'] = 'degraded';
    let latency: number | null = null;
    const url = `${n.host.replace(/\/$/, '')}/api/health`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (res.ok) { latency = +(performance.now() - t0).toFixed(1); status = latency > 300 ? 'degraded' : 'online'; }
    } catch { status = 'offline'; }
    try {
      await query('INSERT INTO server_health (server_id, latency_ms, status) VALUES ($1,$2,$3)', [n.id, latency, status]);
    } catch { /* database optional at runtime */ }
  }
}

export async function heartbeat(body: { serverId: string; latencyMs?: number; status?: string; loadPct?: number }): Promise<{ ok: boolean }> {
  await query(
    'INSERT INTO server_health (server_id, latency_ms, status, load_pct) VALUES ($1,$2,$3,$4)',
    [body.serverId, body.latencyMs ?? null, body.status ?? 'online', body.loadPct ?? null],
  ).catch(() => undefined);
  return { ok: true };
}

export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}
