import { Injectable, inject, signal } from '@angular/core';
import { HealthCheck, TestingServer } from '../models/models';
import { AppConfigService } from './app-config.service';
import { EdgeMeta, MeasurementService } from './measurement.service';

/** The edge endpoint is the measurement server. The Node API is never required to run a test. */
@Injectable({ providedIn: 'root' })
export class ServerService {
  private config = inject(AppConfigService);
  private measure = inject(MeasurementService);

  readonly servers = signal<TestingServer[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly selected = signal<TestingServer | null>(null);
  readonly auto = signal(true);
  readonly lastHealthCheck = signal<HealthCheck | null>(null);

  constructor() { this.servers.set([this.edgeServer(null)]); this.selected.set(this.servers()[0]); }

  edgeServer(meta: EdgeMeta | null): TestingServer {
    const colo = meta?.colo ?? null;
    return {
      id: `cf-edge${colo ? `-${colo.toLowerCase()}` : ''}`,
      name: colo ? `Cloudflare Edge · ${colo}` : 'Cloudflare Edge',
      city: meta?.city ?? (colo ? `Colo ${colo}` : 'Nearest Cloudflare edge'),
      country: meta?.country ?? '',
      countryCode: meta?.country ?? '',
      provider: 'Cloudflare',
      host: this.config.speedBase,
      baseUrl: this.config.speedBase,
      protocols: ['https'],
      region: colo ?? 'global',
      latitude: 0, longitude: 0,
      latencyMs: null, loadPct: null, status: 'online',
      capacity: null, distanceKm: null,
    };
  }

  async discover(): Promise<TestingServer[]> {
    this.loading.set(true); this.error.set(null);
    try {
      const meta = await this.measure.edgeMeta(`${this.config.speedBase}/__down`, AbortSignal.timeout(3000));
      const edge = this.edgeServer(meta);
      this.servers.set([edge]);
      this.selected.set(edge);
      return [edge];
    } catch {
      const edge = this.edgeServer(null);
      this.servers.set([edge]);
      this.selected.set(edge);
      return [edge];
    } finally { this.loading.set(false); }
  }

  /** Optional status only — failures never block a measurement or raise a page banner. */
  async checkHealth(): Promise<boolean> {
    const checkedAt = new Date().toISOString();
    try {
      const res = await fetch(`${this.config.apiBase}/health`, {
        signal: AbortSignal.timeout(2500), cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as Partial<HealthCheck>;
      this.lastHealthCheck.set({
        ok: data.ok !== false, message: typeof data.message === 'string' ? data.message : undefined,
        service: typeof data.service === 'string' ? data.service : undefined,
        time: typeof data.time === 'number' ? data.time : undefined,
        persistence: typeof data.persistence === 'boolean' ? data.persistence : undefined, checkedAt,
      });
      return data.ok !== false;
    } catch {
      this.lastHealthCheck.set({ ok: false, message: 'not running', checkedAt });
      return false;
    }
  }

  select(id: string): TestingServer | null {
    if (!id) { this.auto.set(true); this.selected.set(this.servers()[0] ?? null); }
    else {
      const match = this.servers().find(s => s.id === id);
      if (match) { this.auto.set(false); this.selected.set(match); }
    }
    return this.selected();
  }

  candidates(): TestingServer[] {
    const first = this.selected() ?? this.servers()[0];
    return first ? [first, ...this.servers().filter(s => s.id !== first.id)] : [];
  }
}
