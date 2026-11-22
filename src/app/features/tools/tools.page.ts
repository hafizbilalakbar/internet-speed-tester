import { Component, inject, signal, WritableSignal } from '@angular/core';
import { IconComponent } from '../../shared/icon/icon';
import { ApiService } from '../../core/services/api.service';
import { AppConfigService } from '../../core/services/app-config.service';
import { MeasurementService } from '../../core/services/measurement.service';
import { NetworkInfoService } from '../../core/services/network-info.service';
import { SeoService } from '../../core/services/seo.service';
import { RouterLink } from '@angular/router';

type AsyncState<T> = { loading: boolean; error: string | null; data: T | null };

@Component({
  selector: 'nv-tools-page',
  imports: [IconComponent, RouterLink],
  template: `
    <div class="nv-container">
      <div class="page-head"><span class="eyebrow">Network toolkit</span><h1>Network tools</h1><p>Real lookups and live measurements. No sample results — every value comes from a request or measurement made right now.</p></div>

      <div class="nv-grid nv-grid--2">
        <section class="panel panel--pad">
          <div class="tool-head"><nv-icon name="globe" [size]="20"/><div><h3>Public IP, ISP &amp; ASN</h3><p class="tiny muted">Externally inferred IP intelligence</p></div></div>
          <button class="btn btn--sm" (click)="lookupIp()" [disabled]="ipState().loading">Look up my connection</button>
          @if (ipState().loading) { <div class="skeleton" style="height:100px;margin-top:1rem"></div> }
          @if (ipState().error) { <div class="alert alert--error" style="margin-top:1rem">{{ ipState().error }}</div> }
          @if (ipState().data; as ip) {
            <dl class="detail-list small" style="margin-top:1rem">
              <div><dt>IPv4</dt><dd class="mono">{{ ip.ip ?? 'unavailable' }}</dd></div>
              <div><dt>IPv6</dt><dd class="mono">{{ ipv6State().data?.ip ?? 'not detected' }}</dd></div>
              <div><dt>ISP</dt><dd>{{ ip.isp ?? 'unavailable' }}</dd></div>
              <div><dt>ASN / org</dt><dd>{{ ip.asn ?? '—' }} {{ ip.org ? '· ' + ip.org : '' }}</dd></div>
              <div><dt>Approx. location</dt><dd>{{ locationText(ip) }}</dd></div>
              <div><dt>Time zone</dt><dd>{{ ip.timezone ?? 'unavailable' }}</dd></div>
              <div><dt>Source</dt><dd>{{ ip.source ?? '—' }}</dd></div>
            </dl>
          }
        </section>

        <section class="panel panel--pad">
          <div class="tool-head"><nv-icon name="search" [size]="20"/><div><h3>DNS lookup &amp; response time</h3><p class="tiny muted">Real DNS-over-HTTPS resolution via Cloudflare</p></div></div>
          <form (submit)="dnsLookup($event)" class="nv-row" style="margin-top:.8rem">
            <input class="input grow" name="host" placeholder="example.com" value="example.com" required pattern="[a-zA-Z0-9.\\-]+">
            <select class="input" name="type" style="width:100px"><option>A</option><option>AAAA</option><option>MX</option><option>TXT</option><option>NS</option><option>CNAME</option></select>
            <button class="btn btn--primary btn--sm" [disabled]="dnsState().loading">Resolve</button>
          </form>
          @if (dnsState().error) { <div class="alert alert--error" style="margin-top:1rem">{{ dnsState().error }}</div> }
          @if (dnsState().data; as d) {
            <div class="alert alert--success" style="margin-top:1rem">{{ d.name }} · {{ d.type }} · {{ d.responseMs }} ms · DNS status {{ d.status }}</div>
            <div class="nv-stack" style="gap:.3rem;margin-top:.7rem">
              @for (a of d.answers; track a.data + a.type) { <div class="small mono text-2">{{ a.name }} → {{ a.data }} <span class="tiny muted">(TTL {{ a.TTL }})</span></div> }
              @if (!d.answers.length) { <p class="small muted">No answers returned.</p> }
            </div>
          }
        </section>

        <section class="panel panel--pad">
          <div class="tool-head"><nv-icon name="terminal" [size]="20"/><div><h3>HTTP header checker</h3><p class="tiny muted">Fetches a public URL and reports real response headers</p></div></div>
          <form (submit)="checkHeaders($event)" class="nv-row" style="margin-top:.8rem">
            <input class="input grow" name="url" placeholder="https://example.com" value="https://example.com" required>
            <button class="btn btn--primary btn--sm" [disabled]="headerState().loading">Check</button>
          </form>
          @if (headerState().error) { <div class="alert alert--error" style="margin-top:1rem">{{ headerState().error }}</div> }
          @if (headerState().data; as h) {
            <div class="alert alert--success" style="margin-top:1rem">{{ h.status }} {{ h.statusText }} · {{ h.responseMs }} ms</div>
            <pre class="code-block">{{ headerText(h.headers) }}</pre>
          }
        </section>

        <section class="panel panel--pad">
          <div class="tool-head"><nv-icon name="lock" [size]="20"/><div><h3>TLS connection diagnostics</h3><p class="tiny muted">Real TLS handshake to port 443</p></div></div>
          <form (submit)="checkTls($event)" class="nv-row" style="margin-top:.8rem">
            <input class="input grow" name="host" placeholder="example.com" value="example.com" required>
            <button class="btn btn--primary btn--sm" [disabled]="tlsState().loading">Inspect</button>
          </form>
          @if (tlsState().error) { <div class="alert alert--error" style="margin-top:1rem">{{ tlsState().error }}</div> }
          @if (tlsState().data; as t) {
            <dl class="detail-list small" style="margin-top:1rem">
              <div><dt>Protocol</dt><dd class="mono">{{ t.protocol }}</dd></div>
              <div><dt>Cipher</dt><dd class="mono">{{ t.cipher }}</dd></div>
              <div><dt>Certificate valid</dt><dd>{{ t.authorized ? 'Yes' : 'No — ' + t.authorizationError }}</dd></div>
              <div><dt>Issuer</dt><dd>{{ issuer(t.issuer) }}</dd></div>
              <div><dt>Valid until</dt><dd>{{ t.validTo }}</dd></div>
              <div><dt>Handshake</dt><dd>{{ t.handshakeMs }} ms</dd></div>
            </dl>
          }
        </section>
      </div>

      <section class="panel panel--pad" style="margin-top:1rem">
        <div class="tool-head"><nv-icon name="activity" [size]="20"/><div><h3>Live latency, jitter &amp; stability</h3><p class="tiny muted">Sequenced timing requests to the Netvelox ping endpoint</p></div></div>
        <div class="nv-row" style="margin-top:.8rem">
          <button class="btn btn--sm" (click)="runLatency('ping', 12)" [disabled]="latencyLoading()">Ping test (12 samples)</button>
          <button class="btn btn--sm" (click)="runLatency('jitter', 40)" [disabled]="latencyLoading()">Jitter test (40 samples)</button>
          <button class="btn btn--sm" (click)="runLatency('loss', 40)" [disabled]="latencyLoading()">Probe loss (40 probes)</button>
          <button class="btn btn--sm" (click)="runLatency('stability', 60)" [disabled]="latencyLoading()">Stability (60 samples)</button>
          @if (latencyLoading()) { <button class="btn btn--sm btn--danger" (click)="cancelLatency()">Stop</button> }
          @if (latencyLoading()) { <span class="spinner"></span> }
        </div>
        @if (latencyError()) { <div class="alert alert--error" style="margin-top:1rem">{{ latencyError() }}</div> }
        @if (latencyResult(); as l) {
          <div class="nv-grid nv-grid--4" style="margin-top:1rem">
            <div class="stat"><div class="stat__label">Average</div><div class="stat__value">{{ l.avg ?? '—' }}<small> ms</small></div></div>
            <div class="stat"><div class="stat__label">Min / max</div><div class="stat__value" style="font-size:1.1rem">{{ l.min ?? '—' }} / {{ l.max ?? '—' }}</div></div>
            <div class="stat"><div class="stat__label">Jitter</div><div class="stat__value">{{ l.jitter ?? '—' }}<small> ms</small></div></div>
            <div class="stat"><div class="stat__label">Probe loss</div><div class="stat__value">{{ l.packetLossPct ?? '—' }}<small> %</small></div><div class="stat__sub">{{ l.packetsLost }}/{{ l.packetsSent }} HTTP probes</div></div>
          </div>
          <p class="tiny muted" style="margin-top:.8rem">Method: {{ l.packetLossMethod }}. This is application-layer loss, not ICMP packet loss.</p>
        }
      </section>

      <section class="panel panel--pad" style="margin-top:1rem">
        <div class="tool-head"><nv-icon name="router" [size]="20"/><div><h3>Connection type &amp; browser diagnostics</h3><p class="tiny muted">Browser-reported estimates, never presented as measured network facts</p></div></div>
        <button class="btn btn--sm" style="margin-top:.8rem" (click)="collectBrowser()">Read browser information</button>
        @if (net.snapshot(); as s) {
          <dl class="detail-list small" style="margin-top:1rem">
            <div><dt>Browser</dt><dd>{{ s.browser.browser }} {{ s.browser.browserVersion }}</dd></div>
            <div><dt>OS / device</dt><dd>{{ s.browser.os }} · {{ s.browser.deviceType }}</dd></div>
            <div><dt>Screen</dt><dd>{{ s.browser.screen }}</dd></div>
            <div><dt>Effective type</dt><dd>{{ s.browser.effectiveType ?? 'not reported' }}</dd></div>
            <div><dt>Downlink estimate</dt><dd>{{ s.browser.downlinkMbps ?? 'not reported' }} Mbps</dd></div>
            <div><dt>CPU threads</dt><dd>{{ s.browser.hardwareConcurrency ?? 'not reported' }}</dd></div>
            <div><dt>Online</dt><dd>{{ s.browser.online ? 'Yes' : 'No' }}</dd></div>
          </dl>
          <p class="tiny muted">For local network and Wi-Fi diagnostics see <a routerLink="/diagnostics">Diagnostics</a>.</p>
        }
      </section>
    </div>`,
  styles: `
    .tool-head { display: flex; align-items: center; gap: .8rem; }
    .tool-head nv-icon { color: var(--nv-accent); }
    .tool-head h3 { margin: 0; }
    .grow { flex: 1; min-width: 180px; }
    .code-block { max-height: 240px; overflow: auto; background: var(--nv-panel-2); padding: .8rem; border-radius: 10px; font-size: .74rem; white-space: pre-wrap; word-break: break-word; }
    .detail-list { display: grid; }
    .detail-list > div { display: flex; justify-content: space-between; gap: 1rem; padding: .4rem 0; border-bottom: 1px solid var(--nv-border); }
    .detail-list dt { color: var(--nv-muted); }
    .detail-list dd { margin: 0; text-align: right; overflow-wrap: anywhere; }
  `,
})
export class ToolsPage {
  private api = inject(ApiService);
  private config = inject(AppConfigService);
  private measure = inject(MeasurementService);
  readonly net = inject(NetworkInfoService);
  private seo = inject(SeoService);
  private controller: AbortController | null = null;

  readonly ipState = signal<AsyncState<any>>({ loading: false, error: null, data: null });
  readonly ipv6State = signal<AsyncState<any>>({ loading: false, error: null, data: null });
  readonly dnsState = signal<AsyncState<any>>({ loading: false, error: null, data: null });
  readonly headerState = signal<AsyncState<any>>({ loading: false, error: null, data: null });
  readonly tlsState = signal<AsyncState<any>>({ loading: false, error: null, data: null });
  readonly latencyResult = signal<any>(null);
  readonly latencyLoading = signal(false);
  readonly latencyError = signal<string | null>(null);

  constructor() { this.seo.set({ title: 'Network Tools', description: 'Free online network tools: IP lookup, DNS lookup, ping, jitter, probe loss, HTTP headers and TLS diagnostics.', path: '/tools' }); }

  private set<T>(s: WritableSignal<AsyncState<T>>, patch: Partial<AsyncState<T>>): void {
    s.update(v => ({ ...v, ...patch }));
  }

  lookupIp(): void {
    this.set(this.ipState, { loading: true, error: null, data: null });
    this.set(this.ipv6State, { loading: true, error: null, data: null });
    firstValue(this.api.get<any>('/network/ip')).then(d => this.set(this.ipState, { loading: false, data: d }))
      .catch(e => this.set(this.ipState, { loading: false, error: e.message }));
    firstValue(this.api.get<any>('/network/ip?v=6')).then(d => this.set(this.ipv6State, { loading: false, data: d }))
      .catch(e => this.set(this.ipv6State, { loading: false, error: e.message }));
  }

  dnsLookup(e: Event): void {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);
    const host = String(fd.get('host') ?? '').trim();
    if (!/^[a-z0-9.-]+$/i.test(host)) return;
    this.set(this.dnsState, { loading: true, error: null, data: null });
    firstValue(this.api.get<any>('/tools/dns', { name: host, type: String(fd.get('type') ?? 'A') }))
      .then(d => this.set(this.dnsState, { loading: false, data: d }))
      .catch(err => this.set(this.dnsState, { loading: false, error: err.message }));
  }

  checkHeaders(e: Event): void {
    e.preventDefault();
    const url = String(new FormData(e.target as HTMLFormElement).get('url') ?? '').trim();
    this.set(this.headerState, { loading: true, error: null, data: null });
    firstValue(this.api.get<any>('/tools/headers', { url }))
      .then(d => this.set(this.headerState, { loading: false, data: d }))
      .catch(err => this.set(this.headerState, { loading: false, error: err.message }));
  }

  checkTls(e: Event): void {
    e.preventDefault();
    const host = String(new FormData(e.target as HTMLFormElement).get('host') ?? '').trim();
    this.set(this.tlsState, { loading: true, error: null, data: null });
    firstValue(this.api.get<any>('/tools/tls', { host }))
      .then(d => this.set(this.tlsState, { loading: false, data: d }))
      .catch(err => this.set(this.tlsState, { loading: false, error: err.message }));
  }

  async runLatency(kind: 'ping' | 'jitter' | 'loss' | 'stability', count: number): Promise<void> {
    this.latencyLoading.set(true); this.latencyError.set(null); this.latencyResult.set(null);
    this.controller = new AbortController();
    try {
      const url = `${this.config.apiBase}/tests/ping`;
      const values = await this.measure.ping(url, count, this.controller.signal, kind);
      const stats = MeasurementService.stats(values);
      let loss = { sent: 0, lost: 0, method: 'not measured in this run' };
      if (kind === 'loss' || kind === 'stability') loss = await this.measure.probeLoss(url, kind === 'loss' ? count : 30, this.controller.signal);
      this.latencyResult.set({
        ...stats,
        packetLossPct: loss.sent ? +(loss.lost / loss.sent * 100).toFixed(1) : null,
        packetsSent: loss.sent, packetsLost: loss.lost,
        packetLossMethod: loss.method,
      });
    } catch (e) { this.latencyError.set((e as Error).message); }
    finally { this.latencyLoading.set(false); }
  }

  cancelLatency(): void { this.controller?.abort(); this.latencyLoading.set(false); }
  collectBrowser(): void { void this.net.collect(); }
  locationText(ip: { city?: string | null; region?: string | null; country?: string | null }): string {
    return [ip?.city, ip?.region, ip?.country].filter(p => !!p).join(', ') || 'unavailable';
  }
  headerText(headers: Record<string, string>): string { return Object.entries(headers ?? {}).map(([k, v]) => `${k}: ${v}`).join('\n'); }
  issuer(v: any): string { return v?.O ?? v?.CN ?? JSON.stringify(v ?? {}); }
}

import { firstValueFrom } from 'rxjs';
function firstValue<T>(o: import('rxjs').Observable<T>): Promise<T> { return firstValueFrom(o); }
