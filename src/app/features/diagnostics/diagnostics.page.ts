import { Component, inject, signal } from '@angular/core';
import { IconComponent } from '../../shared/icon/icon';
import { ApiService } from '../../core/services/api.service';
import { SeoService } from '../../core/services/seo.service';
import { CompanionService } from '../../core/services/companion.service';
import { NetworkInfoService, connectionModeLabel } from '../../core/services/network-info.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'nv-diagnostics-page',
  imports: [IconComponent],
  template: `
    <div class="nv-container">
      <div class="page-head"><span class="eyebrow">Local network intelligence</span><h1>Network diagnostics</h1>
        <p>Only what the browser can truly observe, plus an optional localhost companion. Nothing is guessed as fact.</p></div>
      <div class="nv-grid nv-grid--2">
        <section class="panel panel--pad">
          <div class="tool-head"><nv-icon name="wifi" [size]="18"/><h3>Browser-visible connection</h3></div>
          <dl class="detail-list small">
            <div><dt>Connection type</dt><dd>{{ mode() }}</dd></div>
            <div><dt>Effective type (estimate)</dt><dd>{{ net.snapshot()?.browser?.effectiveType ?? 'not reported' }}</dd></div>
            <div><dt>Public IPv4</dt><dd class="mono">{{ net.snapshot()?.ipv4.ip ?? 'unavailable' }}</dd></div>
            <div><dt>ISP / ASN</dt><dd>{{ net.snapshot()?.ipv4.isp ?? 'unavailable' }} {{ net.snapshot()?.ipv4.asn ? '· ' + net.snapshot()?.ipv4.asn : '' }}</dd></div>
            <div><dt>Approx. location (from IP)</dt><dd>{{ net.snapshot()?.ipv4.city ?? 'unavailable' }}</dd></div>
            <div><dt>Wi-Fi SSID / signal</dt><dd class="muted">Not accessible to websites</dd></div>
            <div><dt>Connected devices</dt><dd class="muted">Requires the local companion</dd></div>
          </dl>
        </section>

        <section class="panel panel--pad">
          <div class="tool-head"><nv-icon name="pin" [size]="18"/><h3>Precise location (optional)</h3></div>
          <p class="small text-2">IP location is approximate. Precise coordinates are read only after browser permission and reverse-geocoded with OpenStreetMap Nominatim.</p>
          <button class="btn btn--sm btn--primary" (click)="requestLocation()">Use precise location</button>
          @if (locationText()) { <div class="alert alert--success" style="margin-top:.8rem">{{ locationText() }}</div> }
          <p class="tiny muted">Hidden in public share links by default.</p>
        </section>

        <section class="panel panel--pad">
          <div class="tool-head"><nv-icon name="router" [size]="18"/><h3>Local companion</h3></div>
          @if (companion.available() === true) {
            <dl class="detail-list small">
              <div><dt>Local IP</dt><dd class="mono">{{ companion.summary()?.localIp ?? 'unknown' }}</dd></div>
              <div><dt>Router / gateway</dt><dd class="mono">{{ companion.summary()?.routerIp ?? 'unknown' }}</dd></div>
              <div><dt>WiFi SSID</dt><dd>{{ companion.summary()?.wifiSsid ?? 'not reported' }}</dd></div>
            </dl>
            <div class="device-chips">
              @for (d of companion.summary()?.devices ?? []; track d.ip) {
                <span class="chip"><nv-icon [name]="icon(d.category)" [size]="12"/> {{ d.ip }} <em>guessed</em></span>
              }
            </div>
          } @else {
            <p class="small text-2">Install card shown on the home page. Double-click <code>start-companion.bat</code> or run <code>npm run companion</code>; the site pairs automatically on localhost.</p>
          }
        </section>

        <section class="panel panel--pad">
          <div class="tool-head"><nv-icon name="search" [size]="18"/><h3>DNS &amp; reachability</h3></div>
          <button class="btn btn--sm" (click)="connectivity()">Check Internet reachability</button>
          @if (text()) { <pre class="code-block">{{ text() }}</pre> }
        </section>
      </div>
    </div>`,
  styles: `
    .tool-head { display:flex; align-items:center; gap:.7rem; margin-bottom:.7rem; }
    .tool-head nv-icon { color: var(--nv-accent); }
    .tool-head h3 { margin:0; font-size:1rem; }
    .code-block { max-height:180px; overflow:auto; background:var(--nv-panel-2); border-radius:10px; padding:.7rem; font-size:.72rem; white-space:pre-wrap; }
    .detail-list { display:grid; }
    .detail-list > div { display:flex; justify-content:space-between; gap:1rem; padding:.3rem 0; border-bottom:1px solid var(--nv-border); }
    .detail-list dt { color:var(--nv-muted); }
    .detail-list dd { margin:0; text-align:right; }
    .device-chips { display:flex; flex-wrap:wrap; gap:.3rem; margin-top:.7rem; }
    .device-chips em { font-style:normal; color:var(--nv-moderate); font-size:.6rem; }
  `,
})
export class DiagnosticsPage {
  readonly net = inject(NetworkInfoService);
  readonly companion = inject(CompanionService);
  private api = inject(ApiService);
  private seo = inject(SeoService);

  readonly text = signal('');
  readonly locationText = signal('');
  readonly mode = signal(connectionModeLabel());

  constructor() {
    this.seo.set({ title: 'Network Diagnostics', description: 'Browser-based diagnostics and optional localhost companion.', path: '/diagnostics' });
    void this.companion.detect();
  }

  async requestLocation(): Promise<void> {
    const loc = await this.net.requestPreciseLocation();
    this.locationText.set(loc
      ? `${loc.city ?? 'Exact coordinates'}: ${loc.latitude}, ${loc.longitude} (±${Math.round(loc.accuracy ?? 0)} m)`
      : 'Location was not granted. No coordinates were used.');
  }

  connectivity(): void {
    firstValueFrom(this.api.get<{ checks: Array<{ target: string; ok: boolean; status: number | null; ms: number | null }> }>('/tools/connectivity'))
      .then(d => this.text.set(d.checks.map(c => `${c.target}: ${c.ok ? 'reachable' : 'unreachable'} ${c.status ?? ''} ${c.ms ?? ''}`).join('\n')))
      .catch(() => this.text.set('Reachability check unavailable while the local API is offline.'));
  }

  icon(category: string): string {
    return ['phone', 'laptop', 'tv', 'tablet', 'router'].includes(category) ? category : 'device';
  }
}
