import { Injectable } from '@angular/core';

declare global {
  interface Window {
    __NV_CONFIG__?: { apiBase?: string; speedBase?: string; siteUrl?: string; supportEmail?: string };
  }
}

const DEFAULT_API_BASE = '/api';
const DEFAULT_SITE_URL = 'http://localhost:4200';

function fallbackApiBase(isDev: boolean): string {
  return isDev ? DEFAULT_API_BASE : '/api';
}

function fallbackSiteUrl(origin: string): string {
  return origin;
}

function getSiteOrigin(): string {
  try {
    return typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4200';
  } catch {
    return 'http://localhost:4200';
  }
}

@Injectable({ providedIn: 'root' })
export class AppConfigService {
  readonly apiBase: string;
  /** False on static deployments: history/AI persistence is local-only there. */
  readonly apiEnabled: boolean;
  /** Cloudflare edge measurement base. Independent of the Node API. */
  readonly speedBase: string;
  readonly siteUrl: string;
  readonly supportEmail: string | null;

  constructor() {
    const runtime = typeof window !== 'undefined' ? window.__NV_CONFIG__ : undefined;
    const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    const isDev = typeof window !== 'undefined' && (host === 'localhost' || host === '127.0.0.1');
    const origin = getSiteOrigin();
    this.apiBase = (runtime?.apiBase ?? fallbackApiBase(isDev)).replace(/\/$/, '');
    this.apiEnabled = Boolean(runtime?.apiBase) || isDev;
    // Dedicated edge Worker: all real measurements stay independent of the Node API
    // and its optional PostgreSQL database, in development and in production.
    this.speedBase = (runtime?.speedBase ?? 'https://netvelox-edge.dailylifemalikbilal.workers.dev').replace(/\/$/, '');
    this.siteUrl = (runtime?.siteUrl ?? fallbackSiteUrl(origin)).replace(/\/$/, '');
    this.supportEmail = runtime?.supportEmail?.trim() || null;
  }
}
