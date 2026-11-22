import { Injectable, inject, signal } from '@angular/core';
import { TestingServer } from '../models/models';
import { ApiService } from './api.service';
import { AppConfigService } from './app-config.service';
import { firstValueFrom } from 'rxjs';

/** Resolve a node's real endpoint. The backend publishes `host`; older payloads may use `baseUrl`. */
export function nodeApiBase(raw: string | undefined, fallback: string): string {
  const value = (raw ?? '').trim().replace(/\/+$/, '');
  if (!value) return fallback.replace(/\/+$/, '');
  try {
    const url = new URL(value);
    const path = url.pathname.replace(/\/+$/, '');
    return path.endsWith('/api') ? `${url.origin}${path}` : `${url.origin}${path}/api`;
  } catch {
    return `${value.replace(/\/+$/, '')}/api`;
  }
}

@Injectable({ providedIn: 'root' })
export class ServerService {
  private api = inject(ApiService);
  private config = inject(AppConfigService);
  readonly servers = signal<TestingServer[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly selected = signal<TestingServer | null>(null);
  readonly auto = signal(true);
  readonly lastHealthCheck = signal(null);

  /** Check if the measurement backend is healthy. */
  async checkHealth(): Promise<boolean> {
    try {
      const apiBase = this.config.apiBase;
      const healthUrl = apiBase.endsWith('/api') ? `${apiBase.slice(0, -4)}/health` : `${apiBase}/health`;
      const res = await fetch(healthUrl, { method: 'GET', headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(5000) });
      if (!res.ok) return false;
      const data = await res.json();
      // Store health info for UI display
      this.lastHealthCheck = { ok: res.ok, ...data, checkedAt: new Date().toISOString() };
      return true;
    } catch {
      return false;
    }
  }

  async discover(): Promise<TestingServer[]> {
    this.loading.set(true); this.error.set(null);
    try {
      // First check if the backend is reachable
      const healthy = await this.checkHealth();
      if (!healthy) {
        this.error.set('Server discovery failed: backend is unreachable. Please ensure the measurement backend is running.');
        this.servers.set([]);
        this.selected.set(null);
        return [];
      }
      const list = await firstValueFrom(this.api.get<TestingServer[]>('/servers'));
      if (!Array.isArray(list)) throw new Error('The server list response was invalid.');
      const ranked = await this.rankByLatency(list.filter(s => s.status !== 'offline'));
      this.servers.set(ranked);
      if (!ranked.length) this.error.set('No online measurement server is available. Configure a regional server to run tests.');
      else if (this.auto()) this.selected.set(ranked[0]);
      else {
        const current = ranked.find(s => s.id === this.selected()?.id);
        this.selected.set(current ?? ranked[0]);
      }
      return ranked;
    } catch (e) {
      const message = (e as { message?: string }).message ?? 'Server discovery failed';
      this.error.set(`Server discovery failed: ${message}`);
      this.servers.set([]);
      this.selected.set(null);
      return [];
    } finally { this.loading.set(false); }
  }

  select(id: string): TestingServer | null {
    if (!id) {
      this.auto.set(true);
      const best = this.servers()[0] ?? null;
      this.selected.set(best);
      return best;
    }
    const match = this.servers().find(x => x.id === id) ?? null;
    if (match) {
      this.auto.set(false);
      this.selected.set(match);
    }
    return match;
  }

  /** Preferred server first, then the next healthy candidates for automatic failover. */
  candidates(preferredId?: string): TestingServer[] {
    const healthy = this.servers().filter(s => s.status !== 'offline');
    const preferred = preferredId ? healthy.find(s => s.id === preferredId) : undefined;
    const first = preferred ?? this.selected();
    return first ? [first, ...healthy.filter(s => s.id !== first.id)] : healthy;
  }

  /** Real browser-side latency probes against each candidate's published endpoint. */
  private async rankByLatency(list: TestingServer[]): Promise<TestingServer[]> {
    const results = await Promise.all(list.map(async s => {
      const values: number[] = [];
      const base = nodeApiBase(s.baseUrl ?? s.host, this.config.apiBase);
      for (let i = 0; i < 3; i++) {
        const t0 = performance.now();
        try {
          const res = await fetch(`${base}/servers/${encodeURIComponent(s.id)}/ping?i=${i}&t=${Date.now()}`, {
            cache: 'no-store', signal: AbortSignal.timeout(2500),
          });
          if (res.ok) { await res.arrayBuffer(); values.push(performance.now() - t0); }
        } catch { /* unreachable candidate */ }
      }
      const reachable = values.length > 0;
      return {
        ...s,
        latencyMs: reachable ? +Math.min(...values).toFixed(1) : null,
        status: reachable ? s.status : (s.status === 'online' ? 'degraded' as const : s.status),
        baseUrl: base,
      };
    }));
    return results.sort((a, b) => (a.latencyMs ?? 9999) - (b.latencyMs ?? 9999));
  }
}
