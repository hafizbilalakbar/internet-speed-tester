// @ts-nocheck
import { ChangeDetectionStrategy, Component, computed, effect, inject, NO_ERRORS_SCHEMA, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SpeedometerComponent } from '../../shared/speedometer/speedometer';
import { LiveChartComponent } from '../../shared/chart/live-chart';
import { GlobeComponent } from '../../shared/globe/globe';
import { IconComponent } from '../../shared/icon/icon';
import { SpeedTestService } from '../../core/services/speed-test.service';
import { ServerService } from '../../core/services/server.service';
import { NetworkInfoService } from '../../core/services/network-info.service';
import { ScoringService } from '../../core/services/scoring.service';
import { ResultsService } from '../../core/services/results.service';
import { SeoService } from '../../core/services/seo.service';
import { QualityLevel } from '../../core/models/models';

@Component({
  selector: 'nv-home-page',
  imports: [RouterLink, SpeedometerComponent, LiveChartComponent, GlobeComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [NO_ERRORS_SCHEMA],
  template: `
    <section class="hero nv-container">
      <nv-globe />
      <div class="hero__head fade-in">
        <span class="eyebrow">Internet intelligence, in real time</span>
        <h1>Measure what matters.</h1>
        <p class="page-sub text-2">Real download, upload, latency and stability measurements against regional servers — with clear analysis you can actually use.</p>
      </div>

      <div class="hero__grid panel panel--pad fade-in">
        <div class="meter-column">
          <nv-speedometer
            [value]="displayOrSweep"
            [max]="meterMax"
            [color]="metricColor"
            [label]="phaseLabel"
            [animate]="!test.isRunning() || test.phase() === 'preparing'"
            [duration]="test.isRunning() ? 450 : 900"
            [unit]="test.activeMetric() === null ? (test.phase() === 'complete' ? 'Mbps' : 'READY') : 'Mbps'" />
          <div class="phase-steps" aria-label="Test progress">
            @for (p of steps; track p.key) {
              <span class="phase-step" [class.phase-step--active]="isStepActive(p.key)" [class.phase-step--done]="isStepDone(p.key)">{{ p.label }}</span>
            }
          </div>
          <div class="progress-track no-print" aria-hidden="true"><div class="progress-fill" [style.width.%]="test.progress()"></div></div>
          <div class="go-row">
            @if (test.isRunning()) {
              <button class="btn btn--danger btn--lg" (click)="test.cancel()"><nv-icon name="stop" [size]="18"/> Cancel test</button>
            } @else {
              <button class="btn btn--primary btn--lg go-btn" (click)="start()" [disabled]="servers.loading()">
                <nv-icon name="play" [size]="18"/> {{ test.phase() === 'complete' ? 'Test again' : 'GO' }}
              </button>
            }
            <span class="tiny muted" role="status" aria-live="polite">{{ servers.error() ? servers.error() : servers.loading() ? 'Finding the best server…' : 'Real measurements · no fake numbers' }}</span>
            @if (serverStatus === 'unknown') {
              <span class="tiny muted" style="color: var(--nv-moderate); margin-left: .5rem;">Backend unknown</span>
            } @else if (serverStatus === 'offline') {
              <span class="tiny muted" style="color: var(--nv-poor); margin-left: .5rem;">Backend offline — <button class="btn btn--link btn--sm" (click)="retryBackend()">retry</button></span>
            } @else if (lastHealthCheck) {
              @if (lastHealthCheck.ok) {
                <span class="tiny muted" style="color: var(--nv-good); margin-left: .5rem;">Backend healthy</span>
              } @else {
                <span class="tiny muted" style="color: var(--nv-moderate); margin-left: .5rem;">Backend: {{ lastHealthCheck.message || 'unknown' }}</span>
              }
            }
          </div>
        </div>

        <div class="side-column">
          <div class="server-bar">
            <div class="field grow">
              <label for="server-select"><nv-icon name="server" [size]="13"/> Test server</label>
              <select id="server-select" class="input" [value]="servers.auto() ? '' : (servers.selected()?.id ?? '')" (change)="onServerChange($event)" [disabled]="test.isRunning()">
                <option value="">Auto — best latency</option>
                @for (s of servers.servers(); track s.id) {
                  <option [value]="s.id">{{ s.name }} — {{ s.city }}, {{ s.country }} @if (s.latencyMs !== null) { ({{ s.latencyMs }} ms) }</option>
                }
              </select>
            </div>
            <button class="btn btn--icon" (click)="servers.discover()" [disabled]="test.isRunning()" title="Refresh servers" aria-label="Refresh servers"><nv-icon name="refresh" [size]="17"/></button>
          </div>

          <div aria-live="polite">
            @if (servers.error()) { <div class="alert alert--error">{{ servers.error() }}</div> }
            @if (test.error()) { <div class="alert alert--error"><nv-icon name="alert" [size]="15"/> {{ test.error() }}</div> }
          </div>

          <div class="metric-grid">
            <div class="stat metric-card" [style.--metric-color]="downloadColor">
              <div class="stat__label"><nv-icon name="download" [size]="13"/> Download</div>
              <div class="stat__value" [style.color]="downloadColor">{{ downloadValue }}{{ test.result()?.measurements?.bytesDownloaded ? ' Mbps transferred' : '' }}</div>
            </div>
            <div class="stat metric-card" [style.--metric-color]="uploadColor">
              <div class="stat__label"><nv-icon name="upload" [size]="13"/> Upload</div>
              <div class="stat__value" [style.color]="uploadValue">{{ uploadValue }}{{ test.result()?.measurements?.bytesUploaded ? ' Mbps transferred' : '' }}</div>
            </div>
            <div class="stat metric-card">
              <div class="stat__label"><nv-icon name="activity" [size]="13"/> Ping</div>
              <div class="stat__value" [style.color]="latencyColor">{{ pingValue }}{{ test.result()?.measurements?.latency?.avg !== undefined ? ' ms' : '' }}</div>
              <div class="stat__sub">min {{ fmtNum(test.result()?.measurements?.latency?.min) }} · max {{ fmtNum(test.result()?.measurements?.latency?.max) }}</div>
            </div>
            <div class="stat metric-card">
              <div class="stat__label"><nv-icon name="bars" [size]="13"/> Jitter</div>
              <div class="stat__value" [style.color]="jitterColor">{{ jitterValue }}{{ test.result()?.measurements?.latency?.jitter !== undefined ? ' ms' : '' }}</div>
              <div class="stat__sub">Latency variation</div>
            </div>
            <div class="stat metric-card">
              <div class="stat__label"><nv-icon name="network" [size]="13"/> Probe loss</div>
              <div class="stat__value" [style.color]="lossColor">{{ lossValue }}{{ test.result()?.measurements?.latency?.packetLossPct !== undefined ? ' %' : '' }}</div>
              <div class="stat__sub">HTTP probes, not ICMP</div>
            </div>
            <div class="stat metric-card">
              <div class="stat__label"><nv-icon name="zap" [size]="13"/> Loaded latency</div>
              <div class="stat__value" [style.color]="loadedColor">{{ loadedValue }}{{ test.result()?.measurements?.latency?.loadedDownload !== null || test.result()?.measurements?.latency?.loadedUpload !== null ? ' ms' : '' }}</div>
              <div class="stat__sub">under download / upload load</div>
            </div>
          </div>

          <div class="chart-card">
            <div class="nv-row" style="justify-content:space-between;margin-bottom:.35rem">
              <span class="stat__label">Live throughput</span>
              <span class="chip" [class.chip--accent]="test.isRunning()">{{ test.isRunning() ? phaseLabel : (test.phase() === 'complete' ? 'Complete' : 'Idle') }}</span>
            </div>
            <nv-live-chart [samples]="chartSamples" [color]="metricColor" [windowMs]="chartWindowMs" [placeholder]="chartPlaceholder" />
          </div>

          <div class="connection-strip small">
            <span><strong>ISP</strong> {{ isp }}</span>
            <span><strong>Public IP</strong> {{ publicIp }}</span>
            <span><strong>Location</strong> {{ location }}</span>
            <span><strong>Mode</strong> {{ connectionMode }}</span>
          </div>
          @if (companion === true) {
            <div class="companion-info small" style="margin-top: .5rem;">
              <span><strong>Router IP</strong> {{ companionIP }}</span>
              <span><strong>WiFi</strong> {{ companionSSID }}</span>
              <span><strong>Devices</strong> {{ companionDevices }}</span>
            </div>
          } @else if (companion === false) {
            <div class="companion-info small" style="margin-top: .5rem; color: var(--nv-moderate);">
              <nv-icon name="wifi" [size]="14"/> Install the Netvelox companion to see WiFi and device info
            </div>
          } @else {
            <div class="companion-info small" style="margin-top: .5rem; color: var(--nv-moderate);">
              <nv-icon name="question-circle" [size]="14"/> Detecting companion…
            </div>
          }
        </div>
      </div>
    </section>
  `,
  styles: [
    `.hero { position: relative; padding-top: clamp(2rem, 5vw, 4rem); }
    .hero__head { position: relative; text-align: center; max-width: 760px; margin: 0 auto 2rem; }
    .page-sub { max-width: 62ch; margin: .8rem auto 0; }
    .hero__grid { position: relative; display: grid; grid-template-columns: minmax(280px, 390px) 1fr; gap: clamp(1rem, 2.4vw, 1.8rem); align-items: start; }
    .meter-column { display: grid; gap: .85rem; align-content: start; }
    .side-column { display: grid; gap: .75rem; }
    .server-bar { display: flex; gap: .5rem; align-items: end; }
    .grow { flex: 1; }
    .metric-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: .55rem; }
    .metric-grid .stat { padding: .75rem .85rem; border-radius: 13px; min-width: 0; }
    .metric-grid .stat__value { font-size: clamp(1.1rem, 1.8vw, 1.35rem); }
    .metric-grid .stat__sub { font-size: .68rem; line-height: 1.3; }
    .metric-card { position: relative; overflow: hidden; }
    .metric-card::before { content:''; position:absolute; left:0; top:0; bottom:0; width:2px; background: var(--metric-color, var(--nv-border-strong)); opacity:.8; }
    .go-row { display: grid; justify-items: center; gap: .45rem; }
    .btn--lg { min-height: 48px; padding: 0 2rem; font-size: .95rem; border-radius: 14px; }
    .go-btn { min-width: 160px; }
    .phase-steps { display: flex; justify-content: center; gap: .3rem; flex-wrap: wrap; }
    .phase-step { font-size: .62rem; text-transform: uppercase; letter-spacing: .08em; padding: .22rem .48rem; border-radius: 99px; border: 1px solid var(--nv-muted); color: var(--nv-muted); }
    .phase-step--active { color: var(--nv-accent); border-color: var(--nv-accent); background: var(--nv-accent-soft); }
    .phase-step--done { color: var(--nv-excellent); }
    .progress-track { height: 4px; border-radius: 99px; background: var(--nv-panel-3); overflow: hidden; }
    .progress-fill { height: 100%; background: linear-gradient(90deg, var(--nv-accent), var(--nv-accent-2)); transition: width .25s linear; }
    .chart-card { padding: .75rem .85rem; border-radius: 14px; background: var(--nv-panel-2); border: 1px solid var(--nv-border); min-width: 0; }
    .connection-strip { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: .45rem; padding: .65rem .8rem; border-radius: 12px; background: var(--nv-panel-2); border: 1px solid var(--nv-border); }
    .connection-strip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
    .connection-strip strong { color: var(--nv-muted); font-weight: 600; margin-right: .3rem; }
    .section-head { margin-bottom: 1.5rem; }
    .feature-card { display: block; color: var(--nv-text); text-decoration: none; transition: transform .2s, border-color .2s; }
    .feature-card:hover { text-decoration: none; transform: translateY(-3px); border-color: var(--nv-accent); }
    .feature-card nv-icon { color: var(--nv-accent); margin-bottom: .8rem; }
    .feature-card p { margin: 0; }
    .trust-band { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; }
    .trust-band nv-icon { color: var(--nv-accent); margin-bottom: .6rem; }
    .trust-band p { margin: 0; }
    .workflow-section { padding-top: 0; }
    .workflow-grid { display:grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap:1rem; }
    .workflow-card h3 { margin:.85rem 0 .35rem; font-size:1rem; }
    .workflow-card p { margin:0; }
    .workflow-visual { border-radius:14px; overflow:hidden; border:1px solid var(--nv-border); background:var(--nv-panel-2); }
    .wf-svg { display:block; width:100%; height:auto; }
    .wf-spin { transform-origin: 72px 70px; animation: wfSpin 8s linear infinite; }
    .wf-spin--slow { transform-origin: 160px 70px; animation-duration: 12s; }
    .wf-bar { animation: wfBar 2.8s ease-in-out infinite alternate; transform-origin:left; }
    .wf-bar--d { animation-delay: .7s; }
    .wf-line { stroke-dasharray: 320; stroke-dashoffset: 320; animation: wfDraw 3.2s ease forwards infinite; }
    .wf-pulse { animation: wfPulse 2s ease-in-out infinite; transform-origin:center; }
    @keyframes wfSpin { to { transform: rotate(360deg); } }
    @keyframes wfBar { from { transform: scaleX(.65); } to { transform: scaleX(1); } }
    @keyframes wfDraw { 0% { stroke-dashoffset: 320; opacity:.4; } 40%,80% { stroke-dashoffset: 0; opacity:1; } 100% { stroke-dashoffset:0; opacity:.35; } }
    @keyframes wfPulse { 0%,100% { opacity:.45; transform:scale(.8);} 50% { opacity:1; transform:scale(1.2);} }
    @media (max-width: 980px) { .workflow-grid { grid-template-columns: 1fr; } }
    @media (prefers-reduced-motion: reduce) { .wf-spin,.wf-bar,.wf-line,.wf-pulse { animation:none !important; } }
    .score-head { display: flex; align-items: center; gap: 1rem; margin-top: .5rem; }
    .score-num { font-family: var(--nv-mono); font-size: 2.6rem; font-weight: 700; }
    .insight { border-left: 3px solid var(--nv-accent); padding: .45rem .7rem; border-radius: 0 8px 8px 0; background: var(--nv-panel-2); }
    .insight--warning, .insight--critical { border-color: var(--nv-moderate); }
    .insight--success { border-color: var(--nv-excellent); }
    .result-summary-grid { display:grid; grid-template-columns: minmax(0,1.3fr) minmax(0,1fr) minmax(0,1fr); gap:1rem; }
    .result-kpis { display:grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap:.65rem; margin-top:1rem; }
    .kpi { padding:.7rem .75rem; border:1px solid var(--nv-border); border-radius:12px; background:var(--nv-panel-2); min-width:0; }
    .kpi span { display:block; font-size:.66rem; text-transform:uppercase; letter-spacing:.08em; color:var(--nv-muted); font-weight:700; }
    .kpi strong { display:block; margin-top:.2rem; font-size:.92rem; color:var(--nv-text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .kpi small { display:block; margin-top:.15rem; font-size:.68rem; color:var(--nv-text-2); line-height:1.35; }
    @media (max-width: 1100px) { .result-summary-grid { grid-template-columns: 1fr; } }
    @media (max-width: 640px) { .result-kpis { grid-template-columns: 1fr; } }
    .intro-backdrop { position: fixed; inset: 0; z-index: 200; display: grid; place-items: center; padding: 1rem; background: rgba(3, 7, 15, .74); backdrop-filter: blur(6px); }
    .intro-dialog { width: min(540px, 100%); max-height: calc(100vh - 2rem); overflow: auto; box-shadow: var(--nv-shadow); }
    .intro-dialog h2 { margin: .4rem 0 .7rem; }
    .intro-dialog ul { margin: .8rem 0 1.2rem; padding-left: 1.1rem; display: grid; gap: .45rem; }
    .intro-actions { gap: .6rem; flex-wrap: wrap; }
    @media (max-width: 1100px) { .hero__grid { grid-template-columns: minmax(260px, 340px) 1fr; } }
    @media (max-width: 980px) { .hero__grid { grid-template-columns: 1fr; } .meter-column { max-width: 440px; margin-inline: auto; width: 100%; } }`
  ]
})
export class HomePage implements OnInit {
  readonly test = inject(SpeedTestService);
  readonly servers = inject(ServerService);
  readonly net = inject(NetworkInfoService);
  readonly results = inject(ResultsService);
  private seo = inject(SeoService);
  private scoring = inject(ScoringService);

  readonly introSeen = signal(false);
  readonly introVisible = signal(false);

  readonly steps = [
    { key: 'ping', label: 'Latency' }, { key: 'download', label: 'Download' },
    { key: 'upload', label: 'Upload' }, { key: 'diagnostics', label: 'Diagnostics' },
  ];
  readonly colors = { excellent: 'var(--nv-excellent)', good: 'var(--nv-good)', moderate: 'var(--nv-moderate)', poor: 'var(--nv-poor)', critical: 'var(--nv-critical)', unknown: 'var(--nv-muted)' };

  _meterMax = signal(50);
  sweepProgress = signal(0);
  sweepTimeout: number | null = null;

  serverStatus = signal<'unknown' | 'online' | 'offline'>('unknown');

  constructor() {
    this.seo.set({ title: 'Internet Speed Test', description: 'Free internet speed test measuring download, upload, ping, jitter, probe loss and loaded latency against regional servers.', path: '/' });

    effect(() => {
      if (!this.test.isRunning()) {
        this._meterMax.set(50);
        return;
      }
      const values = [this.test.result()?.measurements?.downloadMbps ?? 0, this.test.result()?.measurements?.uploadMbps ?? 0, this.test.liveMbps()];
      const peak = Math.max(50, ...values.filter(Number.isFinite));
      const steps = [50, 100, 200, 500, 1000, 2000, 5000, 10000];
      const computedMax = steps.find(s => peak <= s * 0.92) ?? 10000;
      this._meterMax.set(Math.max(this._meterMax(), computedMax));
    });

    effect(() => {
      const phase = this.test.phase();
      if (phase === 'preparing') {
        this.startSweepAnimation();
      } else {
        this.stopSweepAnimation();
      }
    });
  }

  private chartRef = inject(LiveChartComponent);

  startSweepAnimation(): void {
    if (this.sweepTimeout !== null) return;
    let progress = 0;
    let direction = 1;
    const animate = () => {
      progress += 0.02 * direction;
      if (progress >= 1) { progress = 1; direction = -1; }
      if (progress <= 0) { progress = 0; direction = 1; }
      this.sweepProgress.set(progress);
      this.sweepTimeout = window.setTimeout(animate, 16);
    };
    animate();
  }

  stopSweepAnimation(): void {
    if (this.sweepTimeout !== null) {
      clearTimeout(this.sweepTimeout);
      this.sweepTimeout = null;
    }
    this.sweepProgress.set(0);
  }

  startChartRefresh(): void {
    this.chartRef.startRefreshTimer();
  }

  stopChartRefresh(): void {
    this.chartRef.killRefreshTimer();
  }

  lastHealthCheck = computed(() => this.test.servers.lastHealthCheck ?? null);

  _animator = inject(SpeedTestService);

  ngOnInit(): void {
    effect(() => {
      const phase = this.test.phase();
      if (phase === 'preparing') {
        this.startSweepAnimation();
      } else if (phase === 'complete' || phase === 'error' || phase === 'cancelled') {
        this.stopSweepAnimation();
      }
    });

    void this.servers.discover();
    void this.net.collect();
    void this.net.refreshPermission();
    void this.checkCompanion();
  }

  startSweepManual(): void {
    SpeedTestService.sweepNeedle(0, this._meterMax(), 450, (v) => this.test.liveMbps.set(v), () => {
      SpeedTestService.sweepNeedle(this._meterMax(), 0, 450, (v) => this.test.liveMbps.set(v), () => {
        this.test.liveMbps.set(0);
      });
    });
  }

  stopAnimationManual(): void {
  }

  displayOrSweep = computed(() => {
    if (this.test.phase() === 'preparing') {
      return this.sweepProgress() * this._meterMax();
    }
    return this.test.liveMbps();
  });

  meterMax = computed(() => this._meterMax());
  metricColor = computed(() => {
    if (!this.test.isRunning() && this.test.phase() !== 'complete') return this.colors.unknown;
    const metric = this.test.activeMetric() === 'upload' ? 'uploadMbps' : 'downloadMbps';
    const value = metric === 'uploadMbps' ? this.uploadNumber() : this.downloadNumber();
    return this.color(this.colors[this.scoring.level(metric, value)]);
  });
  chartSamples = computed(() => {
    if (this.test.isRunning()) return this.test.liveSample();
    const r = this.test.result();
    if (!r) return [];
    return this.test.activeMetric() === 'upload' ? r.measurements.uploadSamples : r.measurements.downloadSamples;
  });
  chartWindowMs = computed(() => this.test.isRunning() ? 12000 : 0);
  chartPlaceholder = computed(() => this.test.isRunning() ? 'Collecting real throughput samples…' : 'Run a test to see live throughput.');
  downloadColor = computed(() => this.color(this.colors[this.scoring.level('downloadMbps', this.downloadNumber())]));
  uploadColor = computed(() => this.color(this.colors[this.scoring.level('uploadMbps', this.uploadNumber())]));
  loadedNumber = computed(() => {
    const l = this.test.result()?.measurements.latency;
    const values = [l?.loadedDownload, l?.loadedUpload].filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    return values.length ? Math.max(...values) : null;
  });
  loadedColor = computed(() => this.color(this.colors[this.scoring.level('loadedMs', this.loadedNumber())]));
  phaseLabel = computed(() => ({
    idle: 'READY TO TEST', preparing: 'PREPARING', ping: 'MEASURING LATENCY', download: 'DOWNLOAD',
    upload: 'UPLOAD', diagnostics: 'DIAGNOSTICS', complete: 'COMPLETE', error: 'TEST FAILED', cancelled: 'CANCELLED',
  })[this.test.phase()]);
  downloadNumber = computed(() => this.test.result()?.measurements?.downloadMbps ?? (this.test.activeMetric() === 'download' ? this.test.liveMbps() : null));
  uploadNumber = computed(() => this.test.result()?.measurements?.uploadMbps ?? (this.test.activeMetric() === 'upload' ? this.test.liveMbps() : null));
  downloadValue = fmt(this.downloadNumber());
  uploadValue = fmt(this.uploadNumber());
  pingValue = val(this.test.result()?.measurements?.latency?.avg);
  jitterValue = val(this.test.result()?.measurements?.latency?.jitter);
  lossValue = val(this.test.result()?.measurements?.latency?.packetLossPct);
  loadedValue = computed(() => { const l = this.test.result()?.measurements?.latency; return l?.loadedDownload === null && l?.loadedUpload === null ? '—' : String(Math.round(Math.max(l?.loadedDownload ?? 0, l?.loadedUpload ?? 0))); });
  latencyColor = computed(() => this.color(this.colors[this.scoring.level('idleMs', this.test.result()?.measurements?.latency?.avg ?? null)]));
  jitterColor = computed(() => this.color(this.colors[this.scoring.level('jitterMs', this.test.result()?.measurements?.latency?.jitter ?? null)]));
  lossColor = computed(() => this.color(this.colors[this.scoring.level('lossPct', this.test.result()?.measurements?.latency?.packetLossPct ?? null)]));
  scoreColor = computed(() => this.qualityColor(this.test.result()?.score.overall ?? 0));
  gradeRows = computed(() => {
    const g = this.test.result()?.score.grades ?? {};
    return Object.entries(g).map(([key, value]) => ({ key, label: key.replace(/([A-Z])/g, ' $1'), value }));
  });
  connectionMode = computed(() => {
    const c = this.test.result()?.measurements?.connections;
    return c ? (c > 1 ? 'Multi-connection' : 'Single') : '—';
  });

  companion = signal<boolean | null>(null);

  private async checkCompanion(): Promise<void> {
    try {
      const res = await fetch('http://127.0.0.1:8787/health', {
        headers: { 'x-agent-token': 'netvelox' },
        signal: AbortSignal.timeout(1500),
      });
      if (res.ok) this.companion.set(true);
      else this.companion.set(false);
    } catch {
      this.companion.set(null);
    }
  }

  isp = computed(() => this.net.snapshot()?.ipv4.isp ?? (this.net.loading() ? 'Detecting…' : 'Unavailable'));
  publicIp = computed(() => this.net.snapshot()?.ipv4.ip ?? (this.net.loading() ? 'Detecting…' : 'Unavailable'));
  location = computed(() => {
    const i = this.net.snapshot()?.ipv4;
    if (i?.city) return `${i.city}${i.country ? ', ' + i.country : ''}`;
    if (i?.country) return i.country;
    return this.net.loading() ? 'Detecting…' : 'Unavailable';
  });

  fmt = (v: number | null | undefined): string => v === null || v === undefined ? '—' : v.toFixed(v >= 100 ? 0 : 2);
  val = (v: number | null | undefined): string => v === null || v === undefined ? '—' : String(v);
  fmtNum = (v: number | null | undefined): string => this.val(v);
  bytesLabel = (bytes: number): string => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let v = bytes, i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
  };
  copyLink = (): Promise<void> => {
    return new Promise<void>((resolve) => {
      const r = this.test.result();
      if (!r) { resolve(); return; }
      this.results.ensureShareToken(r).then((shareable) => {
        this.test.result.set(shareable);
        navigator.clipboard.writeText(this.results.shareUrl(shareable)).then(() => {
          resolve();
        }).catch(() => {
          resolve();
        });
      }).catch(() => {
        resolve();
      });
    });
  }
}

function hasSeenIntro(): boolean {
  try { return localStorage.getItem('nv-privacy-intro') === '1'; } catch { return false; }
}