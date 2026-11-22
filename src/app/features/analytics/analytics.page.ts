import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ResultsService } from '../../core/services/results.service';
import { ServerService } from '../../core/services/server.service';
import { SeoService } from '../../core/services/seo.service';

@Component({
  selector: 'nv-analytics-page',
  imports: [DatePipe, DecimalPipe, RouterLink],
  template: `
    <div class="nv-container">
      <div class="page-head"><span class="eyebrow">Aggregate intelligence</span><h1>Global internet analytics</h1>
        <p>Statistics derived only from real Netvelox measurements. We do not publish country, city or ISP rankings until each group has enough genuine samples.</p></div>

      @if (loading()) { <div class="skeleton" style="height:240px"></div> }
      @else if (error()) { <div class="alert alert--error">{{ error() }}</div> }
      @else if (stats(); as s) {
        <div class="nv-grid nv-grid--4">
          <div class="stat stat--hero"><div class="stat__label">Complete tests (90d)</div><div class="stat__value">{{ s.sampleSize }}</div></div>
          <div class="stat stat--hero"><div class="stat__label">Avg download</div><div class="stat__value">{{ s.averageDownloadMbps === null ? '—' : (s.averageDownloadMbps | number:'1.2-2') }}<small> Mbps</small></div></div>
          <div class="stat stat--hero"><div class="stat__label">Avg upload</div><div class="stat__value">{{ s.averageUploadMbps === null ? '—' : (s.averageUploadMbps | number:'1.2-2') }}<small> Mbps</small></div></div>
          <div class="stat stat--hero"><div class="stat__label">Avg idle latency</div><div class="stat__value">{{ s.averagePingMs === null ? '—' : s.averagePingMs }}<small> ms</small></div></div>
        </div>

        @if (s.insufficient) {
          <div class="alert alert--info" style="margin-top:1.5rem">
            <strong>Not enough data to publish rankings.</strong> Netvelox requires at least 50 completed tests per group before showing country, city or ISP comparisons. Currently {{ s.sampleSize }} tests are available in the reporting period.
          </div>
        }

        <div class="nv-grid nv-grid--2" style="margin-top:1.5rem">
          <div class="panel panel--pad">
            <h3>Measurement scope</h3>
            <dl class="detail-list small">
              <div><dt>Reporting period</dt><dd>{{ s.reportingPeriod }}</dd></div>
              <div><dt>Last updated</dt><dd>{{ s.lastUpdated | date:'medium' }}</dd></div>
              <div><dt>Active test servers</dt><dd>{{ servers.servers().length }}</dd></div>
              <div><dt>Methodology</dt><dd style="max-width:60%;text-align:left">{{ s.methodology }}</dd></div>
            </dl>
          </div>
          <div class="panel panel--pad">
            <h3>Planned comparisons</h3>
            <p class="small text-2">Global speed rankings, country and city performance, ISP rankings, regional latency, fixed vs mobile and historical trends become available automatically as genuine sample counts grow.</p>
            <p class="tiny muted">Every published comparison will include sample size, reporting period, methodology and last-updated time. No placeholder or invented rankings are shown.</p>
            <a class="btn btn--sm" routerLink="/">Contribute a measurement</a>
          </div>
        </div>
      }
    </div>`,
  styles: `.detail-list { display:grid; } .detail-list > div { display:flex; justify-content:space-between; gap:1rem; padding:.5rem 0; border-bottom:1px solid var(--nv-border); } .detail-list dt { color:var(--nv-muted); } .detail-list dd { margin:0; text-align:right; }`,
})
export class AnalyticsPage implements OnInit {
  private results = inject(ResultsService);
  readonly servers = inject(ServerService);
  private seo = inject(SeoService);
  readonly stats = signal<any>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  constructor() { this.seo.set({ title: 'Global Internet Analytics', description: 'Aggregate internet performance statistics derived from real Netvelox measurements, with transparent sample sizes.', path: '/analytics' }); }
  ngOnInit(): void {
    void this.results.stats().then(s => { this.stats.set(s); this.loading.set(false); }).catch(e => { this.error.set(e.message); this.loading.set(false); });
    void this.servers.discover();
  }
}
