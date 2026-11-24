import { Injectable, inject, signal } from '@angular/core';
import { AppConfigService } from './app-config.service';
import { BrowserInfo, IpInfo, NetworkSnapshot } from '../models/models';
import { MeasurementService, TraceInfo } from './measurement.service';

function emptyIp(family: 'IPv4' | 'IPv6'): IpInfo {
  return { ip: null, family, isp: null, asn: null, org: null, city: null, region: null, country: null, countryCode: null, latitude: null, longitude: null, timezone: null, source: null };
}

/** Connection type as reported by the browser. Never guessed from speed. */
export function connectionModeLabel(): string {
  const nav = navigator as Navigator & { connection?: { type?: string; effectiveType?: string } };
  const type = (nav.connection?.type ?? '').toLowerCase();
  const map: Record<string, string> = {
    wifi: 'WiFi', ethernet: 'Ethernet', cellular: 'Cellular', wimax: 'WiMAX',
    bluetooth: 'Bluetooth', other: 'Other', none: 'Offline',
  };
  return map[type] ?? 'Unknown';
}

export function connectionModeReason(): string {
  const nav = navigator as Navigator & { connection?: { type?: string; effectiveType?: string } };
  return (nav.connection?.type ?? '').toLowerCase() === 'unknown'
    || !nav.connection
    ? 'Browsers do not expose the physical connection type (not exposed by browser).'
    : 'Reported by the browser Network Information API.';
}

interface ProviderInfo {
  success?: boolean;
  ip?: string; city?: string; region?: string; country?: string; country_code?: string; loc?: string;
  isp?: string; org?: string; asn?: string; latitude?: number; longitude?: number; timezone?: string;
  connection?: { isp?: string; org?: string; asn?: string };
}

/** ipinfo.io returns "AS154453 Delta Broadband Private Limited" as one org string. */
function splitOrg(org?: string | null): { isp: string | null; asn: string | null } {
  const value = org?.trim();
  if (!value) return { isp: null, asn: null };
  const match = value.match(/^(AS\d+)\s+(.+)$/i);
  return match ? { isp: match[2], asn: match[1].toUpperCase() } : { isp: value, asn: null };
}

interface ProviderResult { name: string; data: ProviderInfo | TraceInfo | null; error: string | null; }

@Injectable({ providedIn: 'root' })
export class NetworkInfoService {
  private config = inject(AppConfigService);
  private measure = inject(MeasurementService);

  readonly snapshot = signal<NetworkSnapshot | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly edge = signal<TraceInfo | null>(null);
  readonly geoPermission = signal<PermissionState | 'unknown'>('unknown');
  readonly locating = signal(false);

  private lastReverseAt = 0;
  private reverseCache = new Map<string, { city: string | null; region: string | null; country: string | null; countryCode: string | null; displayName: string | null; source: string }>();

  private async getJson<T>(url: string, timeoutMs = 4500): Promise<T> {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json() as T;
  }

  /** Cloudflare trace first, then two independent public providers. Never blocks first paint. */
  async collect(): Promise<NetworkSnapshot> {
    if (this.loading()) return this.snapshot() ?? this.blank();
    this.loading.set(true); this.error.set(null);
    const previous = this.snapshot();
    const edgeBase = this.config.speedBase;
    const results = await Promise.allSettled([
      this.measure.trace(edgeBase, AbortSignal.timeout(4000)),
      this.measure.edgeMeta(`${edgeBase}/__down`, AbortSignal.timeout(4000)),
      this.getJson<ProviderInfo>('https://ipwho.is/', 4000),
      this.getJson<ProviderInfo>('https://ipinfo.io/json', 4000),
    ]);
    const names = ['Cloudflare trace', 'Cloudflare edge headers', 'ipwho.is', 'ipinfo.io'];
    const providers: ProviderResult[] = results.map((r, i) => r.status === 'fulfilled'
      ? { name: names[i], data: r.value as ProviderInfo | TraceInfo | null, error: r.value ? null : 'no data' }
      : { name: names[i], data: null, error: String((r.reason as Error)?.message ?? r.reason).slice(0, 80) });
    const trace = (providers[0].data as TraceInfo | null) ?? null;
    const edgeMeta = (providers[1].data as TraceInfo | null) ?? null;
    const ipInfo = (providers[2].data as ProviderInfo | null)?.success !== false ? providers[2].data as ProviderInfo | null : null;
    const fallbackInfo = providers[3].data as ProviderInfo | null;
    const info = ipInfo ?? fallbackInfo;
    const orgParts = splitOrg(info?.org);
    const locParts = typeof info?.loc === 'string' ? info.loc.split(',').map(Number) : [];
    const ip = trace?.ip ?? edgeMeta?.ip ?? info?.ip ?? null;
    const v6 = await this.detectIpv6().catch(() => null);

    const country = trace?.country ?? edgeMeta?.country ?? info?.country_code ?? info?.country ?? null;
    const countryCode = (country ?? '').toUpperCase().slice(0, 2) || null;
    const asn = trace?.asn ?? edgeMeta?.asn ?? orgParts.asn ?? info?.connection?.asn ?? info?.asn ?? null;
    const ipv4: IpInfo = {
      ...emptyIp('IPv4'),
      ip,
      isp: info?.isp ?? info?.connection?.isp ?? orgParts.isp ?? trace?.organization ?? null,
      asn: asn ? (String(asn).startsWith('AS') ? String(asn) : `AS${asn}`) : null,
      org: info?.org ?? info?.connection?.org ?? trace?.organization ?? null,
      country,
      countryCode,
      city: trace?.city ?? edgeMeta?.city ?? info?.city ?? null,
      region: info?.region ?? null,
      latitude: info?.latitude ?? (Number.isFinite(locParts[0]) ? locParts[0] : null),
      longitude: info?.longitude ?? (Number.isFinite(locParts[1]) ? locParts[1] : null),
      timezone: info?.timezone ?? null,
      source: providers.filter(p => p.data).map(p => p.name).join(' + ') || null,
    };
    const snap: NetworkSnapshot = {
      ipv4,
      ipv6: v6 ? { ...emptyIp('IPv6'), ip: v6, source: 'api64.ipify.org' } : null,
      browser: this.browserInfo(),
      preciseLocation: previous?.preciseLocation ?? null,
      preciseCity: previous?.preciseCity ?? null,
      locationDetail: previous?.locationDetail ?? null,
      collectedAt: new Date().toISOString(),
    };
    if (!ip && !country) {
      this.error.set(`Network information unavailable: ${providers.map(p => `${p.name} (${p.error ?? 'no data'})`).join(' · ')}`);
    }
    this.edge.set(trace ?? (edgeMeta as TraceInfo | null));
    this.snapshot.set(snap);
    this.loading.set(false);
    return snap;
  }

  private async detectIpv6(): Promise<string | null> {
    try {
      const res = await this.getJson<{ ip?: string }>('https://api64.ipify.org?format=json', 3000);
      return typeof res.ip === 'string' && res.ip.includes(':') ? res.ip : null;
    } catch { return null; }
  }

  /** Explicit permission only. Reverse geocodes with a proper User-Agent and a 1 s rate limit. */
  async requestPreciseLocation(): Promise<{ latitude: number; longitude: number; accuracy: number | null; city: string | null } | null> {
    if (!('geolocation' in navigator)) return null;
    this.locating.set(true);
    return new Promise(resolve => {
      navigator.geolocation.getCurrentPosition(async pos => {
        const loc = {
          latitude: +pos.coords.latitude.toFixed(5),
          longitude: +pos.coords.longitude.toFixed(5),
          accuracy: pos.coords.accuracy,
        };
        const place = await this.reverseGeocode(loc.latitude, loc.longitude);
        this.snapshot.update(s => s ? { ...s, preciseLocation: loc, preciseCity: place?.city ?? null, locationDetail: place?.displayName ?? null } : s);
        this.locating.set(false);
        void this.refreshPermission();
        resolve({ ...loc, city: place?.city ?? null });
      }, () => { this.locating.set(false); resolve(null); },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
    });
  }

  private async reverseGeocode(lat: number, lon: number): Promise<{ city: string | null; region: string | null; country: string | null; countryCode: string | null; displayName: string | null; source: string } | null> {
    const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    const cached = this.reverseCache.get(key);
    if (cached) return cached;
    const wait = 1000 - (Date.now() - this.lastReverseAt);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    this.lastReverseAt = Date.now();
    let place: { city: string | null; region: string | null; country: string | null; countryCode: string | null; displayName: string | null; source: string } | null = null;
    try {
      place = await this.getJson<NonNullable<typeof place>>(`${this.config.apiBase}/tools/reverse-geocode?lat=${lat}&lon=${lon}`, 6000);
    } catch {
      // Browsers cannot set User-Agent; the automatic browser UA and referrer apply here.
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&addressdetails=1&lat=${lat}&lon=${lon}`, {
          headers: { Accept: 'application/json', 'Accept-Language': navigator.language || 'en' },
          referrerPolicy: 'strict-origin-when-cross-origin', signal: AbortSignal.timeout(6000), cache: 'no-store',
        });
        if (res.ok) {
          const d = await res.json() as { display_name?: string; address?: Record<string, string> };
          const a = (d.address ?? {}) as {
            city?: string; town?: string; village?: string; municipality?: string; county?: string;
            state?: string; region?: string; country?: string; country_code?: string;
          };
          place = {
            city: a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? null,
            region: a.state ?? a.region ?? null, country: a.country ?? null,
            countryCode: (a.country_code ?? '').toUpperCase() || null,
            displayName: d.display_name ?? null, source: 'OpenStreetMap Nominatim (explicit permission only)',
          };
        }
      } catch { place = null; }
    }
    if (place) this.reverseCache.set(key, place);
    return place;
  }

  async refreshPermission(): Promise<void> {
    try { this.geoPermission.set(await navigator.permissions.query({ name: 'geolocation' as PermissionName }).then(p => p.state)); }
    catch { this.geoPermission.set('unknown'); }
  }

  private blank(): NetworkSnapshot {
    return {
      ipv4: emptyIp('IPv4'), ipv6: null, browser: this.browserInfo(),
      preciseLocation: null, preciseCity: null, locationDetail: null, collectedAt: new Date().toISOString(),
    };
  }

  private browserInfo(): BrowserInfo {
    const ua = navigator.userAgent;
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { type?: string; effectiveType?: string; downlink?: number; rtt?: number } };
    const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Unknown';
    const verMatch = ua.match(/(?:Edg|OPR|Firefox|Chrome|Version)\/([\d.]+)/);
    const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Unknown';
    const deviceType = /iPad|Tablet/.test(ua) ? 'tablet' : /Mobile|iPhone|Android/.test(ua) ? 'mobile' : 'desktop';
    let webgl = false;
    try { const c = document.createElement('canvas'); webgl = !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { /* no webgl */ }
    return {
      browser, browserVersion: verMatch?.[1] ?? 'unknown', os, deviceType,
      screen: `${screen.width}×${screen.height} @${window.devicePixelRatio || 1}x`,
      language: navigator.language, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      hardwareConcurrency: navigator.hardwareConcurrency ?? null,
      deviceMemoryGb: nav.deviceMemory ?? null,
      connectionType: nav.connection?.type ?? null,
      effectiveType: nav.connection?.effectiveType ?? null,
      downlinkMbps: nav.connection?.downlink ?? null,
      rttEstimateMs: nav.connection?.rtt ?? null,
      online: navigator.onLine, webgl,
      source: 'browser-reported estimate',
    };
  }
}
