import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { BrowserInfo, IpInfo, NetworkSnapshot } from '../models/models';

const IP_INTELLIGENCE_ENDPOINTS = [
  'https://api.ipify.org?format=json',
  'https://api64.ipify.org?format=json',
  'https://ifconfig.me/ip',
  'https://icanhazip.com/',
];

@Injectable({ providedIn: 'root' })
export class NetworkInfoService {
  private api = inject(ApiService);
  readonly snapshot = signal<NetworkSnapshot | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly geoPermission = signal<PermissionState | 'unknown'>('unknown');

  private async fetchJson(url: string, timeoutMs = 5000): Promise<any> {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': 'Netvelox/1.0' } });
    return res.json();
  }

  private async detectPublicIp(): Promise<string | null> {
    for (const endpoint of IP_INTELLIGENCE_ENDPOINTS) {
      try {
        const data = await this.fetchJson(endpoint, 5000);
        let ip: string | null = null;
        if (typeof data === 'string') ip = data.trim();
        else if (data && typeof data.ip === 'string') ip = data.ip.trim();
        if (ip) return ip;
      } catch { /* try next endpoint */ }
    }
    return null;
  }

  async collect(): Promise<NetworkSnapshot> {
    this.loading.set(true); this.error.set(null);
    const [ip, ipv6] = await Promise.allSettled([
      firstValue(this.api.get<IpInfo>('/network/ip')),
      firstValue(this.api.get<IpInfo>('/network/ip?v=6')),
    ]);
    const previous = this.snapshot();
    const ipv4 = ip.status === 'fulfilled' ? this.sanitizeIp(ip.value, 'IPv4') : this.emptyIp('IPv4');
    const ipv6Raw = ipv6.status === 'fulfilled' ? this.sanitizeIp(ipv6.value, 'IPv6') : null;
    const snap: NetworkSnapshot = {
      ipv4,
      ipv6: ipv6Raw?.ip ? ipv6Raw : null,
      browser: this.browserInfo(),
      preciseLocation: previous?.preciseLocation ?? null,
      collectedAt: new Date().toISOString(),
    };
    // Determine if we have any IP intelligence
    const publicIpFromBackend = ipv4.ip;
    const intelAvailable = publicIpFromBackend && !isPrivateIp(publicIpFromBackend);
    if (!intelAvailable) {
      this.error.set('IP intelligence services are unavailable; connection details are omitted.');
    } else {
      this.error.set(null);
    }
    this.snapshot.set(snap);
    this.loading.set(false);
    return snap;
  }

  private isPrivateIp(ip: string): boolean {
    if (!ip) return true;
    const p = ip.split('.').map(Number);
    return p[0] === 10 || p[0] === 127 || (p[0] === 192 && p[1] === 168) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || p[0] === 169 && p[1] === 254 || p[0] === 0;
  }

  async requestPreciseLocation(): Promise<{ latitude: number; longitude: number; accuracy: number | null } | null> {
    if (!('geolocation' in navigator)) return null;
    return new Promise(resolve => {
      navigator.geolocation.getCurrentPosition(
        pos => {
          const loc = { latitude: +pos.coords.latitude.toFixed(5), longitude: +pos.coords.longitude.toFixed(5), accuracy: pos.coords.accuracy };
          this.snapshot.update(s => s ? { ...s, preciseLocation: loc } : s);
          resolve(loc);
        },
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
      );
    });
  }

  async refreshPermission(): Promise<void> {
    try { this.geoPermission.set(await navigator.permissions.query({ name: 'geolocation' as PermissionName }).then(p => p.state)); }
    catch { this.geoPermission.set('unknown'); }
  }

  private emptyIp(family: 'IPv4' | 'IPv6'): IpInfo {
    return { ip: null, family, isp: null, asn: null, org: null, city: null, region: null, country: null, countryCode: null, latitude: null, longitude: null, timezone: null, source: null };
  }

  private sanitizeIp(value: IpInfo | null | undefined, family: 'IPv4' | 'IPv6'): IpInfo {
    if (!value) return this.emptyIp(family);
    // The backend already resolves the genuine public IP and geolocation.
    // Pass through whatever the backend resolved, only normalizing shape.
    const ip = typeof value.ip === 'string' ? value.ip.trim() : null;
    return {
      ...this.emptyIp(family),
      ...value,
      family: value.family ?? family,
      ip,
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

import { firstValueFrom } from 'rxjs';
function firstValue<T>(o: import('rxjs').Observable<T>): Promise<T> { return firstValueFrom(o); }
