import { Component, inject, signal } from '@angular/core';
import { IconComponent } from '../../shared/icon/icon';
import { NetworkInfoService } from '../../core/services/network-info.service';
import { ApiService } from '../../core/services/api.service';
import { SeoService } from '../../core/services/seo.service';

interface CompanionDevice {
  ip: string; hostname: string | null; mac: string | null;
  vendor: string | null; category: string | null; source: string; lastSeen: string | null; confidence: 'confirmed' | 'inferred' | 'unavailable';
}

@Component({
  selector: 'nv-diagnostics-page',
  imports: [IconComponent, FormsModule],
  template: `
    <div class="nv-container">
      <div class="page-head"><span class="eyebrow">Local network intelligence</span><h1>Network diagnostics</h1>
        <p>We separate what the browser can truly observe from what requires an installed, permission-based companion agent. Nothing is guessed or fabricated.</p></div>

      <div class="nv-grid nv-grid--2">
        <section class="panel panel--pad">
          <div class="tool-head"><nv-icon name="wifi" [size]="20"/><h3>Browser-visible connection</h3></div>
          <button class="btn btn--sm" style="margin-top:.8rem" (click)="net.collect()">Refresh connection data</button>
          @if (net.snapshot(); as s) {
            <dl class="detail-list small" style="margin-top:1rem">
              <div><dt>Connection type</dt><dd>{{ s.browser.connectionType ?? 'not reported by browser' }}</dd></div>
              <div><dt>Effective type</dt><dd>{{ s.browser.effectiveType ?? 'not reported by browser' }} <span class="tiny muted">(estimate)</span></dd></div>
              <div><dt>Downlink estimate</dt><dd>{{ s.browser.downlinkMbps ?? 'not reported' }} Mbps <span class="tiny muted">(estimate)</span></dd></div>
              <div><dt>Public IPv4</dt><dd class="mono">{{ s.ipv4.ip ?? 'unavailable' }}</dd></div>
              <div><dt>Public IPv6</dt><dd class="mono">{{ s.ipv6?.ip ?? 'not detected' }}</dd></div>
              <div><dt>ISP / ASN</dt><dd>{{ s.ipv4.isp ?? 'unavailable' }} {{ s.ipv4.asn ? '· ' + s.ipv4.asn : '' }}</dd></div>
              <div><dt>Default gateway</dt><dd class="muted">Not accessible to websites</dd></div>
              <div><dt>Wi-Fi SSID / signal</dt><dd class="muted">Not accessible to websites</dd></div>
              <div><dt>Connected device list</dt><dd class="muted">Requires the optional companion agent below</dd></div>
            </dl>
          }
        </section>

        <section class="panel panel--pad">
          <div class="tool-head"><nv-icon name="pin" [size]="20"/><h3>Location permission</h3></div>
          <p class="small text-2" style="margin-top:.8rem">IP-based location is approximate and inferred externally. Precise coordinates are only read after your browser prompts you for permission.</p>
          <p class="tiny muted">Permission state: {{ net.geoPermission() }}</p>
          <button class="btn btn--sm" (click)="requestLocation()">Share precise location (optional)</button>
          @if (locationResult()) { <div class="alert alert--success" style="margin-top:1rem">{{ locationResult() }}</div> }
          @if (locationError()) { <div class="alert alert--error" style="margin-top:1rem">{{ locationError() }}</div> }
          <p class="tiny muted" style="margin-top:.8rem">If granted, coordinates are attached only to your own result and removed from public share links unless you enable location sharing.</p>
        </section>
      </div>

      <div class="nv-grid nv-grid--2" style="margin-top:1rem">
        <section class="panel panel--pad">
          <div class="tool-head"><nv-icon name="search" [size]="20"/><h3>DNS &amp; reachability</h3></div>
          <form (submit)="dnsCheck($event)" class="nv-row" style="margin-top:.8rem">
            <input class="input grow" name="host" value="example.com" required>
            <button class="btn btn--primary btn--sm" [disabled]="dnsLoading()">Resolve A record</button>
          </form>
          @if (dnsText()) { <pre class="code-block">{{ dnsText() }}</pre> }
          <button class="btn btn--sm" style="margin-top:.8rem" (click)="connectivity()">Check Internet reachability</button>
          @if (connectivityText()) { <pre class="code-block">{{ connectivityText() }}</pre> }
        </section>

        <section class="panel panel--pad">
          <div class="tool-head"><nv-icon name="router" [size]="20"/><h3>Optional local companion agent</h3></div>
          <p class="small text-2" style="margin-top:.8rem">A separate Node.js service you install and run yourself. It binds to <code>127.0.0.1</code>, requires a token and only reads the OS neighbour cache. It never performs unauthorised scans.</p>
          <div class="nv-row" style="margin-top:.8rem">
            <input class="input grow" [(ngModel)]="agentUrl" placeholder="http://127.0.0.1:8787" aria-label="Companion agent URL">
            <input class="input" [(ngModel)]="agentToken" type="password" placeholder="Agent token" aria-label="Companion agent token" style="width:170px">
          </div>
          <div class="nv-row" style="margin-top:.6rem">
            <button class="btn btn--sm btn--primary" (click)="connectAgent()" [disabled]="agentLoading()">Connect &amp; read devices</button>
            <button class="btn btn--sm" (click)="disconnectAgent()">Forget agent</button>
          </div>
          @if (agentError()) { <div class="alert alert--error" style="margin-top:1rem">{{ agentError() }}</div> }
          @if (agentInfo()) { <div class="alert alert--success" style="margin-top:1rem">{{ agentInfo() }}</div> }
          @if (devices().length) {
            <div class="table-wrap" style="margin-top:1rem">
              <table class="nv-table"><thead><tr><th>IP</th><th>Hostname</th><th>MAC</th><th>Vendor</th><th>Last seen</th><th>Confidence</th></tr></thead>
                <tbody>@for (d of devices(); track d.ip) {
                  <tr><td class="mono">{{ d.ip }}</td><td>{{ d.hostname ?? 'unavailable' }}</td><td class="mono">{{ d.mac ?? 'unavailable' }}</td>
                    <td>{{ d.vendor ?? 'unavailable' }}</td><td>{{ d.lastSeen ?? 'unavailable' }}</td>
                    <td><span class="chip" [class.chip--good]="d.confidence === 'confirmed'" [class.chip--warn]="d.confidence === 'inferred'">{{ d.confidence }}</span></td></tr>
                }</tbody>
              </table>
            </div>
          }
          <p class="tiny muted" style="margin-top:.8rem">Setup instructions: <code>companion/README.md</code>. The website cannot enable or disable this agent remotely.</p>
        </section>
      </div>
    </div>`,
  styles: `
    .tool-head { display:flex; align-items:center; gap:.8rem; } .tool-head nv-icon { color: var(--nv-accent); } .tool-head h3 { margin:0; }
    .grow { flex:1; min-width:160px; }
    .code-block { max-height:200px; overflow:auto; background:var(--nv-panel-2); border-radius:10px; padding:.7rem; font-size:.74rem; white-space:pre-wrap; }
    .detail-list { display:grid; } .detail-list > div { display:flex; justify-content:space-between; gap:1rem; padding:.4rem 0; border-bottom:1px solid var(--nv-border); }
    .detail-list dt { color:var(--nv-muted); } .detail-list dd { margin:0; text-align:right; }
  `,
})
export class DiagnosticsPage {
  readonly net = inject(NetworkInfoService);
  private api = inject(ApiService);
  private seo = inject(SeoService);

  readonly dnsText = signal(''); readonly dnsLoading = signal(false);
  readonly connectivityText = signal('');
  readonly locationResult = signal(''); readonly locationError = signal('');
  readonly devices = signal<CompanionDevice[]>([]);
  readonly agentError = signal(''); readonly agentInfo = signal(''); readonly agentLoading = signal(false);
  agentUrl = localStorage.getItem('nv-agent-url') ?? 'http://127.0.0.1:8787';
  agentToken = localStorage.getItem('nv-agent-token') ?? '';

  constructor() { this.seo.set({ title: 'Network Diagnostics', description: 'Browser-based network diagnostics and optional permission-based local network companion agent.', path: '/diagnostics' }); }

  async requestLocation(): Promise<void> {
    const loc = await this.net.requestPreciseLocation();
    if (loc) { this.locationResult.set(`Location shared with this session: ${loc.latitude}, ${loc.longitude} (±${Math.round(loc.accuracy ?? 0)} m). Your browser may remember this permission.`); this.locationError.set(''); }
    else this.locationError.set('Location was not granted or is unavailable. No coordinates were used.');
  }

  dnsCheck(e: Event): void {
    e.preventDefault();
    const host = String(new FormData(e.target as HTMLFormElement).get('host') ?? '').trim();
    this.dnsLoading.set(true);
    firstValue(this.api.get<any>('/tools/dns', { name: host, type: 'A' }))
      .then(d => this.dnsText.set(`${d.name} ${d.type} — ${d.responseMs} ms via ${d.resolver}\n` + (d.answers?.map((a: any) => `${a.name} -> ${a.data} (TTL ${a.TTL})`).join('\n') || 'No answers')))
      .catch(err => this.dnsText.set(`Error: ${err.message}`))
      .finally(() => this.dnsLoading.set(false));
  }

  connectivity(): void {
    firstValue(this.api.get<any>('/tools/connectivity'))
      .then(d => this.connectivityText.set(d.checks.map((c: any) => `${c.target}: ${c.ok ? 'reachable' : 'unreachable'} ${c.status ?? ''} ${c.ms !== null ? c.ms + ' ms' : ''}`).join('\n')))
      .catch(err => this.connectivityText.set(`Error: ${err.message}`));
  }

  async connectAgent(): Promise<void> {
    this.agentLoading.set(true); this.agentError.set(''); this.agentInfo.set(''); this.devices.set([]);
    try {
      localStorage.setItem('nv-agent-url', this.agentUrl);
      localStorage.setItem('nv-agent-token', this.agentToken);
      const base = this.agentUrl.replace(/\/$/, '');
      const headers = { 'X-Agent-Token': this.agentToken };
      const health = await fetch(`${base}/health`, { headers });
      if (!health.ok) throw new Error(`Agent returned HTTP ${health.status}`);
      const info = await health.json() as { name: string; version: string; mode: string };
      const res = await fetch(`${base}/devices`, { headers });
      if (!res.ok) throw new Error(`Device read returned HTTP ${res.status}; check the agent token`);
      const data = await res.json() as { devices: CompanionDevice[]; source: string; discoveredAt: string };
      this.devices.set(data.devices ?? []);
      this.agentInfo.set(`${info.name} v${info.version} · ${data.devices?.length ?? 0} neighbours from ${data.source} (${data.discoveredAt})`);
    } catch (e) { this.agentError.set((e as Error).message + '. Make sure the companion agent is installed, running locally and that the token matches.'); }
    finally { this.agentLoading.set(false); }
  }

  disconnectAgent(): void {
    this.agentUrl = 'http://127.0.0.1:8787'; this.agentToken = '';
    localStorage.removeItem('nv-agent-url'); localStorage.removeItem('nv-agent-token');
    this.devices.set([]); this.agentInfo.set(''); this.agentError.set('');
  }
}

import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
function firstValue<T>(o: import('rxjs').Observable<T>): Promise<T> { return firstValueFrom(o); }
