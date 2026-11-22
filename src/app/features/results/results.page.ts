import { Component, computed, inject, NO_ERRORS_SCHEMA, OnInit, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IconComponent } from '../../shared/icon/icon';
import { LiveChartComponent } from '../../shared/chart/live-chart';
import { SpeedometerComponent } from '../../shared/speedometer/speedometer';
import { ResultsService } from '../../core/services/results.service';
import { ApiService } from '../../core/services/api.service';
import { ScoringService } from '../../core/services/scoring.service';
import { SpeedTestService } from '../../core/services/speed-test.service';
import { SeoService } from '../../core/services/seo.service';
import { TestResult } from '../../core/models/models';

@Component({
  selector: 'nv-results-page',
  imports: [DatePipe, DecimalPipe, RouterLink, IconComponent, LiveChartComponent, SpeedometerComponent],
  schemas: [NO_ERRORS_SCHEMA],
  template: `
    <div class="nv-container">
      @if (loading()) {
        <div class="nv-stack panel panel--pad" style="margin-top:3rem">
          <div class="skeleton" style="height:2rem;width:40%"></div>
          <div class="skeleton" style="height:280px"></div>
        </div>
      } @else if (result(); as r) {
        @if (error()) { <div class="alert alert--info" style="margin-top:1rem">{{ error() }}</div> }
        <div class="page-head nv-row" style="justify-content:space-between;align-items:end">
          <div><span class="eyebrow">Test result</span><h1>Connection report</h1>
            <p class="mono small muted">ID {{ r.id }} · {{ r.createdAt | date:'medium' }} · {{ r.server.name }}, {{ r.server.city }}, {{ r.server.country }}</p></div>
          <div class="nv-row no-print">
            <button class="btn btn--sm" (click)="copyLink()"><nv-icon name="link" [size]="15"/> Copy link</button>
            <button class="btn btn--sm" (click)="copyId(r.id)"><nv-icon name="copy" [size]="15"/> Copy ID</button>
            <button class="btn btn--sm" (click)="results.exportPdf(r)"><nv-icon name="filedown" [size]="15"/> PDF</button>
            <button class="btn btn--sm" (click)="results.exportCsv(r)"><nv-icon name="list" [size]="15"/> CSV</button>
            <button class="btn btn--sm" (click)="print()"><nv-icon name="printer" [size]="15"/> Print</button>
          </div>
        </div>

        <div class="result-hero panel panel--pad">
          <nv-speedometer [value]="r.measurements.downloadMbps ?? 0" [color]="qualityColor(r.score.overall)" label="DOWNLOAD" />
          <div class="nv-grid nv-grid--2">
            <div class="stat stat--hero"><div class="stat__label">Download</div><div class="stat__value">{{ (r.measurements.downloadMbps ?? 0) | number:'1.2-2' }} <small>Mbps</small></div><div class="stat__sub">over {{ (r.measurements.downloadDurationMs / 1000) | number:'1.1-1' }}s · {{ r.measurements.connections }} connections</div></div>
            <div class="stat stat--hero"><div class="stat__label">Upload</div><div class="stat__value">{{ (r.measurements.uploadMbps ?? 0) | number:'1.2-2' }} <small>Mbps</small></div><div class="stat__sub">over {{ (r.measurements.uploadDurationMs / 1000) | number:'1.1-1' }}s</div></div>
            <div class="stat"><div class="stat__label">Idle latency</div><div class="stat__value">{{ r.measurements.latency.avg ?? '—' }} <small>ms</small></div><div class="stat__sub">min {{ r.measurements.latency.min ?? '—' }} · max {{ r.measurements.latency.max ?? '—' }} · median {{ r.measurements.latency.median ?? '—' }}</div></div>
            <div class="stat"><div class="stat__label">Jitter</div><div class="stat__value">{{ r.measurements.latency.jitter ?? '—' }} <small>ms</small></div><div class="stat__sub">mean consecutive RTT variation</div></div>
            <div class="stat"><div class="stat__label">Probe loss</div><div class="stat__value">{{ r.measurements.latency.packetLossPct ?? '—' }} <small>%</small></div><div class="stat__sub">{{ r.measurements.latency.packetsLost }}/{{ r.measurements.latency.packetsSent }} HTTP probes</div></div>
            <div class="stat"><div class="stat__label">Quality score</div><div class="stat__value" [style.color]="qualityColor(r.score.overall)">{{ r.score.overall }}<small>/100</small></div><div class="stat__sub">{{ r.score.label }} · Netvelox heuristic</div></div>
          </div>
        </div>

        <div class="nv-grid nv-grid--2" style="margin-top:1rem">
          <div class="panel panel--pad">
            <h3>Download throughput</h3><nv-live-chart [samples]="r.measurements.downloadSamples" color="var(--nv-accent)" [durationLabel]="(r.measurements.downloadDurationMs/1000|number:'1.0-0') + 's'" />
          </div>
          <div class="panel panel--pad">
            <h3>Upload throughput</h3><nv-live-chart [samples]="r.measurements.uploadSamples" color="var(--nv-accent-2)" [durationLabel]="(r.measurements.uploadDurationMs/1000|number:'1.0-0') + 's'" />
          </div>
          <div class="panel panel--pad">
            <h3>Latency timeline</h3>
            <nv-live-chart [samples]="pingSeries()" color="var(--nv-good)" durationLabel="samples" />
            <p class="tiny muted">Each point is one measured round trip to the test server.</p>
          </div>
          <div class="panel panel--pad">
            <h3>Loaded latency comparison</h3>
            <div class="nv-stack" style="gap:.8rem;margin-top:1rem">
              @for (b of latencyBars(); track b.label) {
                <div><div class="nv-row tiny" style="justify-content:space-between"><span class="text-2">{{ b.label }}</span><span class="mono">{{ b.value ?? '—' }} ms</span></div>
                  <div class="meter-track"><div class="meter-fill" [style.width.%]="b.width" [style.background-color]="latencyColor(b.value)"></div></div></div>
              }
            </div>
            <details class="tiny muted" style="margin-top:1rem"><summary>Bufferbloat assessment</summary>
              <p style="margin-top:.5rem">{{ bufferbloatText(r) }}</p>
            </details>
          </div>
        </div>

        <div class="nv-grid nv-grid--3" style="margin-top:1rem">
          <div class="panel panel--pad">
            <span class="stat__label">Network quality</span>
            <h3 style="margin-top:.5rem">Suitability by task</h3>
            <div class="nv-stack" style="gap:.7rem">
              @for (s of suitabilities(); track s.key) {
                <div><div class="nv-row tiny" style="justify-content:space-between"><span class="text-2">{{ s.label }}</span><span class="mono">{{ s.value }}/100</span></div>
                  <div class="meter-track"><div class="meter-fill" [style.width.%]="s.value" [style.background-color]="qualityColor(s.value)"></div></div></div>
              }
            </div>
          </div>
          <div class="panel panel--pad">
            <span class="stat__label"><nv-icon name="sparkles" [size]="14"/> Intelligent analysis ({{ r.analysis.provider }})</span>
            <p class="small text-2" style="margin-top:.7rem">{{ r.analysis.summary }}</p>
            @for (i of r.analysis.insights; track i.title) {
              <div class="insight" [class]="'insight insight--' + i.level" style="margin-top:.5rem"><strong class="tiny">{{ i.title }}</strong><p class="tiny text-2" style="margin:0">{{ i.text }}</p></div>
            }
          </div>
          <div class="panel panel--pad">
            <span class="stat__label">Assessment &amp; recommendations</span>
            <p class="small text-2" style="margin-top:.7rem"><strong>Bottleneck:</strong> {{ r.analysis.bottleneck }}</p>
            <ul class="small text-2">
              @for (rec of r.analysis.recommendations; track rec) { <li>{{ rec }}</li> }
            </ul>
            <div class="nv-row small">
              <span class="chip">{{ r.analysis.gaming.label }} gaming · {{ r.analysis.gaming.score }}</span>
              <span class="chip">{{ r.analysis.conferencing.label }} calls · {{ r.analysis.conferencing.score }}</span>
              <span class="chip">{{ r.analysis.streaming.label }} streaming · {{ r.analysis.streaming.score }}</span>
            </div>
          </div>
        </div>

        <div class="nv-grid nv-grid--2" style="margin-top:1rem">
          <div class="panel panel--pad">
            <h3>Connection details</h3>
            <dl class="detail-list small">
              <div><dt>ISP</dt><dd>{{ r.network.ipv4.isp ?? 'Unavailable' }}</dd></div>
              <div><dt>ASN</dt><dd>{{ r.network.ipv4.asn ?? 'Unavailable' }}</dd></div>
              <div><dt>Public IP</dt><dd class="mono">{{ r.network.ipv4.ip ?? 'Unavailable' }}</dd></div>
              <div><dt>Approx. location</dt><dd>{{ locationText(r.network.ipv4) }}</dd></div>
              <div><dt>Browser / OS</dt><dd>{{ r.network.browser.browser }} {{ r.network.browser.browserVersion }} · {{ r.network.browser.os }}</dd></div>
              <div><dt>Connection estimate</dt><dd>{{ r.network.browser.effectiveType ?? 'not reported' }} · {{ r.network.browser.connectionType ?? 'unknown type' }}</dd></div>
              <div><dt>Stability</dt><dd>{{ r.measurements.stability.rating }} · {{ r.measurements.stability.deviationPct ?? '—' }}% variation · {{ r.measurements.stability.interruptions }} interruptions</dd></div>
              <div><dt>Bytes transferred</dt><dd class="mono">{{ (r.measurements.bytesDownloaded / 1048576 | number:'1.1-1') }} MB down · {{ (r.measurements.bytesUploaded / 1048576 | number:'1.1-1') }} MB up</dd></div>
            </dl>
          </div>
          @if (!sharedView()) {
          <div class="panel panel--pad no-print">
            <h3>Share &amp; privacy</h3>
            <p class="small muted">Public result links hide your IP, ISP and location by default. Enable only what you want to share.</p>
            <div class="nv-stack" style="gap:.6rem">
              @for (o of shareOptions; track o.key) {
                <div class="nv-row" style="justify-content:space-between">
                  <span class="small text-2">{{ o.label }}</span>
                  <button class="switch" role="switch" [attr.aria-checked]="shareFlags()[o.key]" [attr.aria-label]="o.label" (click)="toggleShare(o.key)"></button>
                </div>
              }
            </div>
            @if (shareMsg()) { <p class="small" style="margin-top:.8rem">{{ shareMsg() }}</p> }
            <div class="nv-row" style="margin-top:1rem">
              <button class="btn btn--sm btn--primary" (click)="copyLink()"><nv-icon name="share" [size]="15"/> Copy share link</button>
              <a class="btn btn--sm" routerLink="/">Run test again</a>
              <a class="btn btn--sm" routerLink="/servers">Change server</a>
            </div>
          </div>
          }
        </div>
      } @else if (error()) {
        <div class="page-head"><h1>Result unavailable</h1><div class="alert alert--error">{{ error() }}</div><a class="btn" routerLink="/">Run a new test</a></div>
      }
    </div>`,
  styles: `
    .detail-list { display: grid; gap: .1rem; }
    .detail-list > div { display: flex; justify-content: space-between; gap: 1rem; padding: .45rem 0; border-bottom: 1px solid var(--nv-border); }
    .detail-list dt { color: var(--nv-muted); }
    .detail-list dd { margin: 0; text-align: right; overflow-wrap: anywhere; }
    .insight { border-left: 3px solid var(--nv-accent); padding: .45rem .7rem; border-radius: 0 8px 8px 0; background: var(--nv-panel-2); }
    .insight--warning, .insight--critical { border-color: var(--nv-moderate); }
    .insight--success { border-color: var(--nv-excellent); }
  `,
})
export class ResultsPage implements OnInit {
  readonly results = inject(ResultsService);
  private route = inject(ActivatedRoute);
  private api = inject(ApiService);
  private scoring = inject(ScoringService);
  private seo = inject(SeoService);
  private test = inject(SpeedTestService);

  readonly result = signal<TestResult | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly shareMsg = signal('');
  readonly sharedView = signal(false);
  readonly shareFlags = signal({ ip: false, isp: false, location: false });
  readonly shareOptions = [
    { key: 'ip' as const, label: 'Include public IP address' },
    { key: 'isp' as const, label: 'Include ISP / ASN' },
    { key: 'location' as const, label: 'Include approximate location' },
  ];

  constructor() { this.seo.set({ title: 'Test Result', description: 'Detailed internet speed test result with latency, jitter, stability and intelligent analysis.', path: '/result' }); }

  ngOnInit(): void {
    const token = this.route.snapshot.paramMap.get('token');
    const id = this.route.snapshot.paramMap.get('id');
    this.sharedView.set(!!token);
    this.seo.set({
      title: token ? 'Shared Test Result' : 'Test Result',
      description: 'Detailed internet speed test result with latency, jitter, stability and intelligent analysis.',
      path: token ? `/result/${token}` : id ? `/r/${id}` : '/result',
      noIndex: !!token,
    });

    const local = id ? this.results.history().find(r => r.id === id) : null;
    if (local && !local.ownerToken) {
      this.result.set(local);
      this.loading.set(false);
      this.shareFlags.set({ ip: !!local.share?.ip, isp: !!local.share?.isp, location: !!local.share?.location });
      return;
    }
    const request = token ? this.results.getShared(token)
      : id ? this.results.get(id, local?.ownerToken)
      : Promise.reject({ message: 'No result specified' });
    request.then(r => {
      this.result.set(r); this.loading.set(false);
      this.shareFlags.set({ ip: !!r.share?.ip, isp: !!r.share?.isp, location: !!r.share?.location });
    }).catch(e => {
      // A result saved locally while the API/DB was unavailable is still viewable on this device.
      const local = id ? this.results.history().find(r => r.id === id) : null;
      if (local) {
        this.result.set(local); this.loading.set(false);
        this.error.set('Showing a locally stored copy — this result was not found on the server.');
      } else {
        this.error.set((e as { message?: string }).message ?? 'Result not found'); this.loading.set(false);
      }
    });
  }

  qualityColor(v: number): string {
    return v >= 85 ? 'var(--nv-excellent)' : v >= 70 ? 'var(--nv-good)' : v >= 55 ? 'var(--nv-moderate)' : v >= 35 ? 'var(--nv-poor)' : 'var(--nv-critical)';
  }
  latencyColor(v: number | null): string {
    const level = this.scoring.level('loadedMs', v);
    return level === 'excellent' ? 'var(--nv-excellent)' : level === 'good' ? 'var(--nv-good)' : level === 'moderate' ? 'var(--nv-moderate)' : level === 'poor' ? 'var(--nv-poor)' : level === 'critical' ? 'var(--nv-critical)' : 'var(--nv-muted)';
  }
  suitabilities = computed(() => {
    const r = this.result(); if (!r) return [];
    const s = this.scoring.suitability(r.score, r.measurements);
    return Object.entries(s).map(([key, value]) => ({ key, label: key.replace(/([A-Z])/g, ' $1'), value }));
  });
  pingSeries = computed(() => (this.result()?.measurements.latency.samples ?? []).map((v, i) => ({ t: i, mbps: v })));
  latencyBars = computed(() => {
    const l = this.result()?.measurements.latency;
    const max = Math.max(l?.avg ?? 0, l?.loadedDownload ?? 0, l?.loadedUpload ?? 0, 1);
    const bar = (label: string, value: number | null) => ({ label, value, width: value === null ? 0 : Math.min(100, value / max * 100) });
    return [bar('Idle latency', l?.avg ?? null), bar('Loaded — download', l?.loadedDownload ?? null), bar('Loaded — upload', l?.loadedUpload ?? null)];
  });

  locationText(ip: { city?: string | null; region?: string | null; country?: string | null }): string {
    return [ip?.city, ip?.region, ip?.country].filter(p => !!p).join(', ') || 'Unavailable';
  }

  bufferbloatText(r: TestResult): string {
    const l = r.measurements.latency, base = l.avg;
    if (base === null) return 'Not enough latency data to assess bufferbloat.';
    const down = l.loadedDownload, up = l.loadedUpload;
    if (down === null && up === null) return 'Loaded latency was not captured for this test.';
    const worst = Math.max(down ?? 0, up ?? 0);
    return worst > base * 1.8 ? `Loaded latency increased from ${base} ms to ${worst.toFixed(0)} ms — likely bufferbloat, which can cause lag during transfers.` : `Loaded latency stayed near idle levels (${base} ms → ${worst.toFixed(0)} ms), indicating good queue management.`;
  }

  async toggleShare(key: 'ip' | 'isp' | 'location'): Promise<void> {
    const r = this.result(); if (!r) return;
    if (!r.ownerToken) { this.shareMsg.set('Sharing preferences can only be changed from the device that ran this test.'); return; }
    const previousFlags = this.shareFlags();
    const next = { ...previousFlags, [key]: !previousFlags[key] };
    this.shareFlags.set(next);
    try {
      const res = await firstValue(this.api.put<{ shareToken: string }>(
        `/results/${encodeURIComponent(r.id)}/share`, next, { 'X-Result-Token': r.ownerToken },
      ));
      this.result.update(x => x ? { ...x, share: next, shareToken: res.shareToken } : x);
      this.shareMsg.set('Sharing preferences saved. Existing links now reflect these settings.');
    } catch {
      this.shareFlags.set(previousFlags);
      this.shareMsg.set('Could not save sharing settings. The previous privacy choice is still in effect.');
    }
  }

  async copyLink(): Promise<void> {
    let r = this.result(); if (!r) return;
    if (!r.shareToken && r.ownerToken) {
      try {
        const res = await firstValue(this.api.put<{ shareToken: string }>(
          `/results/${encodeURIComponent(r.id)}/share`, this.shareFlags(), { 'X-Result-Token': r.ownerToken },
        ));
        this.result.update(x => x ? { ...x, shareToken: res.shareToken, share: this.shareFlags() } : x);
        r = this.result();
      } catch { this.shareMsg.set('Could not create a private share link on the server.'); return; }
    }
    if (!r) return;
    try { await navigator.clipboard.writeText(this.results.shareUrl(r)); this.shareMsg.set('Share link copied.'); }
    catch { this.shareMsg.set('Clipboard access was denied.'); }
  }
  async copyId(id: string): Promise<void> { try { await navigator.clipboard.writeText(id); } catch { /* ignored */ } }
  print(): void { window.print(); }
}

import { firstValueFrom } from 'rxjs';
function firstValue<T>(o: import('rxjs').Observable<T>): Promise<T> { return firstValueFrom(o); }
