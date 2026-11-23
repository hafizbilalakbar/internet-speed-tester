import { Injectable, inject, signal } from '@angular/core';
import { AppConfigService } from './app-config.service';
import { BrowserInfo, IpInfo, NetworkSnapshot } from '../models/models';
import { MeasurementService } from './measurement.service';

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
  if (map[type]) return map[type];
  if (nav.connection && type === 'unknown') return 'Unknown (not exposed by browser)';
  return 'Unknown (not exposed by browser)';
}

interface ProviderInfo {
  success?: boolean;
  ip?: string; city?: string; region?: string; country?: string; country_code?: string;
  isp?: string; org?: string; asn?: string; latitude?: number; longitude?: number; timezone?: string;
  connection?: { isp?: string; org?: string; asn?: string };
}

@Injectable({ providedIn: 'root' })
export class NetworkInfoService {
  private config = inject(AppConfigService);
  private measure = inject(MeasurementService);

  readonly snapshot = signal<NetworkSnapshot | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly geoPermission = signal<PermissionState | 'unknown'>('unknown');
  readonly locating = signal(false);

  private lastReverseAt = 0;
  private reverseCache = new Map<string, { city: string | null; region: string | null; country: string | null; countryCode: string | null; displayName: string | null; source: string }>();

  private async getJson<T>(url: string, timeoutMs = 4500): Promise<T> {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json() as T;
  }

  async collect(): Promise<NetworkSnapshot> {
    if (this.loading()) return this.snapshot() ?? this.blank();
    this.loading.set(true); this.error.set(null);
    const previous = this.snapshot();
    const [edge, v6, provider] = await Promise.allSettled([
      this.measure.edgeMeta(`${this.config.speedBase}/__down`, AbortSignal.timeout(3500)),
      this.detectIpv6(),
      Promise.resolve(null as ProviderInfo | null),
    ]);
    const ext = edge.status === 'fulfilled' ? edge.value : null;
    let info = provider.status === 'fulfilled' ? provider.value : null;
    const ip = ext?.ip ?? null;
    if (ip) {
      try {
        const data = await this.getJson<ProviderInfo>(`https://ipwho.is/${encodeURIComponent(ip)}`, 3500);
        if (data && data.success !== false) info = data;
      } catch {
        try { info = await this.getJson<ProviderInfo>(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, 3500); }
        catch { info = null; }
      }
    }
    const ipv4: IpInfo = {
      ...emptyIp('IPv4'),
      ip,
      isp: info?.isp ?? info?.connection?.isp ?? info?.org ?? null,
      asn: ext?.asn ? `AS${ext.asn}` : (info?.connection?.asn ? `AS${info.connection.asn}` : info?.asn ?? null),
      org: info?.org ?? info?.connection?.org ?? null,
      // Cloudflare trace wins for country; city is from IP and always labelled approximate.
      country: ext?.country ?? info?.country ?? null,
      countryCode: (ext?.country ?? info?.country_code ?? '').toUpperCase() || null,
      city: ext?.city ?? info?.city ?? null,
      region: info?.region ?? null,
      latitude: info?.latitude ?? null,
      longitude: info?.longitude ?? null,
      timezone: ext?.timezone ?? info?.timezone ?? null,
      source: ext ? `Cloudflare edge${info ? ' + IP intelligence provider' : ''}` : (info ? 'IP intelligence provider' : null),
    };
    const ipv6Value = v6.status === 'fulfilled' ? v6.value : null;
    const snap: NetworkSnapshot = {
      ipv4,
      ipv6: ipv6Value ? { ...emptyIp('IPv6'), ip: ipv6Value, source: 'api64.ipify.org' } : null,
      browser: this.browserInfo(),
      preciseLocation: previous?.preciseLocation ?? null,
      preciseCity: previous?.preciseCity ?? null,
      locationDetail: previous?.locationDetail ?? null,
      collectedAt: new Date().toISOString(),
    };
    if (!ip) this.error.set('Public IP could not be determined from the edge or fallback providers.');
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
