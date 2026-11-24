import { Injectable, inject, signal } from '@angular/core';

export interface CompanionDevice {
  ip: string;
  mac: string | null;
  hostname: string | null;
  vendor: string | null;
  category: 'phone' | 'laptop' | 'tv' | 'tablet' | 'router' | 'iot' | 'unknown' | string;
  typeConfidence: 'guessed';
  source: string;
  lastSeen: string | null;
}

export interface CompanionSummary {
  localIp: string | null;
  routerIp: string | null;
  wifiSsid: string | null;
  devices: CompanionDevice[];
  discoveredAt: string | null;
  error?: string | null;
}

const DEFAULT_URL = 'http://127.0.0.1:8787';
const TOKEN_KEY = 'nv-companion-token';
const URL_KEY = 'nv-companion-url';

/** Detects the optional localhost-only companion. Nothing is invented when it is absent. */
@Injectable({ providedIn: 'root' })
export class CompanionService {
  readonly available = signal<boolean | null>(null);
  readonly summary = signal<CompanionSummary | null>(null);
  readonly busy = signal(false);
  readonly message = signal<string | null>(null);

  private token: string | null = null;
  private readonly base: string;

  constructor() {
    try { this.base = (localStorage.getItem(URL_KEY) ?? DEFAULT_URL).replace(/\/$/, ''); }
    catch { this.base = DEFAULT_URL; }
  }

  /** Safe, silent probe: a missing companion is not an application error. */
  async detect(): Promise<void> {
    if (this.available() !== null) return;
    // A localhost agent is only reachable (and only allowed) from a loopback HTTP page.
    // Skipping the probe on HTTPS/public origins avoids a CORS console error.
    const page = typeof location !== 'undefined' ? location : null;
    const host = page?.hostname ?? '';
    const loopback = page?.protocol === 'http:' && (host === 'localhost' || host === '127.0.0.1');
    if (!loopback) { this.available.set(false); return; }
    this.busy.set(true);
    try {
      let token: string | null = null;
      try { token = localStorage.getItem(TOKEN_KEY); } catch { /* storage blocked */ }
      // Only probe the agent when the user has explicitly paired it. Blind health
      // probes on every page load produce CORS errors when no companion is running.
      if (!token) { this.available.set(false); return; }
      this.token = token;
      const res = await fetch(`${this.base}/summary`, {
        headers: { 'X-Agent-Token': token }, signal: AbortSignal.timeout(1800), cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as CompanionSummary;
      this.summary.set(data);
      this.available.set(true);
      try { localStorage.setItem(TOKEN_KEY, token); localStorage.setItem(URL_KEY, this.base); } catch { /* storage blocked */ }
    } catch {
      this.available.set(false);
    } finally { this.busy.set(false); }
  }

  async refresh(): Promise<void> {
    if (!this.token) { await this.detect(); return; }
    this.busy.set(true);
    try {
      const res = await fetch(`${this.base}/summary`, {
        headers: { 'X-Agent-Token': this.token }, signal: AbortSignal.timeout(1800), cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.summary.set(await res.json() as CompanionSummary);
      this.available.set(true);
    } catch {
      this.available.set(false);
      this.summary.set(null);
      this.message.set('Companion stopped responding.');
    } finally { this.busy.set(false); }
  }

  forget(): void {
    this.token = null;
    this.summary.set(null);
    this.available.set(false);
    this.message.set(null);
    try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(URL_KEY); } catch { /* storage blocked */ }
  }
}
