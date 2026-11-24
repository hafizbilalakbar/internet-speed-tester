import { ChangeDetectionStrategy, Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { SpeedometerComponent } from '../../shared/speedometer/speedometer';
import { LiveChartComponent } from '../../shared/chart/live-chart';
import { IconComponent } from '../../shared/icon/icon';
import { CountUpDirective } from '../../shared/count-up/count-up';
import { SpeedTestService } from '../../core/services/speed-test.service';
import { ServerService } from '../../core/services/server.service';
import { CompanionService } from '../../core/services/companion.service';
import { NetworkInfoService, connectionModeLabel, connectionModeReason } from '../../core/services/network-info.service';
import { ScoringService } from '../../core/services/scoring.service';
import { SeoService } from '../../core/services/seo.service';
import { CompanionDevice } from '../../core/services/companion.service';

@Component({
  selector: 'nv-home-page',
  imports: [SpeedometerComponent, LiveChartComponent, IconComponent, CountUpDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="hero nv-container">
      <div class="hero__head">
        <span class="eyebrow">Internet intelligence, in real time</span>
        <h1>Measure what matters.</h1>
        <p class="page-sub text-2">Real download, upload and latency against the Cloudflare edge — with clear analysis you can use.</p>
      </div>

      <div class="hero__grid panel panel--pad">
        <div class="meter-column">
          <nv-speedometer
            [value]="test.liveMbps()"
            [max]="1000"
            [label]="phaseLabel()"
            [intro]="test.intro()"
            [showResult]="test.phase() === 'complete' && !!test.result()"
            [resultDown]="test.result()?.measurements.downloadMbps ?? 0"
            [resultUp]="test.result()?.measurements.uploadMbps ?? 0"
            unit="Mbps" />
          <div class="phase-steps" aria-label="Test progress">
            @for (p of steps; track p.key) {
              <span class="phase-step" [class.phase-step--active]="isStepActive(p.key)" [class.phase-step--done]="isStepDone(p.key)">{{ p.label }}</span>
            }
          </div>
          <div class="progress-track" aria-hidden="true"><div class="progress-fill" [style.width.%]="test.progress()"></div></div>
          <div class="go-row">
            @if (test.isRunning()) {
              <button class="btn btn--danger btn--lg" (click)="test.cancel()"><nv-icon name="stop" [size]="16"/> Cancel</button>
            } @else {
              <button class="btn btn--primary btn--lg go-btn" (click)="start()"><nv-icon name="play" [size]="16"/> {{ test.phase() === 'complete' ? 'Test again' : 'GO' }}</button>
            }
            <span class="tiny muted">Real measurements · no fake numbers</span>
          </div>
        </div>

        <div class="side-column">
          <div class="server-bar">
            <div class="field grow">
              <label for="server-select"><nv-icon name="server" [size]="12"/> Test server</label>
              <select id="server-select" class="input" [value]="servers.auto() ? '' : (servers.selected()?.id ?? '')" (change)="onServerChange($event)" [disabled]="test.isRunning()">
                <option value="">Auto — nearest Cloudflare edge</option>
                @for (s of servers.servers(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }
              </select>
            </div>
            <span class="server-location small">
              @if (serverFlag()) { <span [class]="'fi flag--sm ' + serverFlag()"></span> }
              {{ serverLocation() }}
            </span>
          </div>

          @if (banner(); as message) {
            <div class="alert alert--error compact-alert" role="alert"><nv-icon name="alert" [size]="14"/> {{ message }}</div>
          }

          <div class="metric-grid">
            <div class="stat metric-card" [style.--metric-color]="downloadColor()">
              <div class="stat__label"><nv-icon name="download" [size]="12"/> Download</div>
              <div class="stat__value" [style.color]="downloadColor()">
                @if (downloadNumber() !== null) { <span [nvCountUp]="downloadNumber()" [nvDecimals]="1"></span> } @else { — }
                <small>Mbps</small>
              </div>
            </div>
            <div class="stat metric-card" [style.--metric-color]="uploadColor()">
              <div class="stat__label"><nv-icon name="upload" [size]="12"/> Upload</div>
              <div class="stat__value" [style.color]="uploadColor()">
                @if (uploadNumber() !== null) { <span [nvCountUp]="uploadNumber()" [nvDecimals]="1"></span> } @else { — }
                <small>Mbps</small>
              </div>
            </div>
            <div class="stat metric-card">
              <div class="stat__label"><nv-icon name="activity" [size]="12"/> Ping</div>
              <div class="stat__value" [style.color]="latencyColor()">
                @if (resultNumber('idleMs') !== null) { <span [nvCountUp]="resultNumber('idleMs')" [nvDecimals]="0"></span> } @else { — }
                <small>ms</small>
              </div>
              <div class="stat__sub">min {{ fmtNum(latency()?.min) }} · max {{ fmtNum(latency()?.max) }}</div>
            </div>
            <div class="stat metric-card">
              <div class="stat__label"><nv-icon name="bars" [size]="12"/> Jitter</div>
              <div class="stat__value" [style.color]="jitterColor()">
                @if (resultNumber('jitterMs') !== null) { <span [nvCountUp]="resultNumber('jitterMs')" [nvDecimals]="1"></span> } @else { — }
                <small>ms</small>
              </div>
              <div class="stat__sub">Latency variation</div>
            </div>
            <div class="stat metric-card">
              <div class="stat__label"><nv-icon name="network" [size]="12"/> Probe loss</div>
              <div class="stat__value" [style.color]="lossColor()">
                @if (resultNumber('lossPct') !== null) { <span [nvCountUp]="resultNumber('lossPct')" [nvDecimals]="1"></span> } @else { — }
                <small>%</small>
              </div>
              <div class="stat__sub">HTTP probes, not ICMP</div>
            </div>
            <div class="stat metric-card">
              <div class="stat__label"><nv-icon name="zap" [size]="12"/> Loaded latency</div>
              <div class="stat__value" [style.color]="loadedColor()">
                @if (loadedNumber() !== null) { <span [nvCountUp]="loadedNumber()" [nvDecimals]="0"></span> } @else { — }
                <small>ms</small>
              </div>
              <div class="stat__sub">under download / upload load</div>
            </div>
          </div>

          <div class="chart-card">
            <div class="nv-row chart-head"><span class="stat__label">Live throughput</span><span class="chip" [class.chip--accent]="test.isRunning()">{{ phaseLabel() }}</span></div>
            <nv-live-chart [samples]="test.chartSamples()" [windowMs]="12000" placeholder="Real download and upload samples appear here during a test." />
          </div>

          <div class="connection-strip small">
            <span><strong>ISP</strong> {{ isp() }}</span>
            <span><strong>IP</strong> {{ publicIp() }}</span>
            <span class="location-cell">
              <strong>Location</strong>
              @if (net.snapshot()?.preciseCity; as city) { {{ city }} <em>Precise</em> }
              @else { {{ location() }} <em>Approx. (from IP)</em> }
            </span>
            <span [title]="modeReason()"><strong>Mode</strong> {{ mode() }}</span>
          </div>

          <div class="location-row small">
            @if (serverFlag()) { <span [class]="'fi flag ' + serverFlag()"></span> }
            <span class="muted">Edge: {{ serverLocation() }}</span>
            @if (!isPublicShare()) {
              <button class="btn btn--link btn--sm" (click)="usePreciseLocation()" [disabled]="net.locating()">
                {{ net.locating() ? 'Locating…' : 'Use precise location' }}
              </button>
            }
          </div>

          @if (companion.available() === true) {
            <div class="companion-card small">
              <div class="nv-row" style="justify-content:space-between">
                <span><nv-icon name="router" [size]="13"/> Companion connected · {{ companion.summary()?.devices?.length ?? 0 }} neighbours</span>
                <span><button class="btn btn--link btn--sm" (click)="companion.refresh()">Refresh</button><button class="btn btn--link btn--sm" (click)="companion.forget()">Forget</button></span>
              </div>
              <div class="device-list">
                <span><strong>Local IP</strong> {{ companion.summary()?.localIp ?? 'unknown' }}</span>
                <span><strong>Router</strong> {{ companion.summary()?.routerIp ?? 'unknown' }}</span>
                <span><strong>WiFi</strong> {{ companion.summary()?.wifiSsid ?? 'not reported' }}</span>
              </div>
              <div class="device-chips">
                @for (d of companion.summary()?.devices ?? []; track d.ip) {
                  <span class="device-chip" [title]="d.vendor ?? 'Vendor unknown'">
                    <nv-icon [name]="deviceIcon(d)" [size]="12"/> {{ d.ip }} <em>guessed</em>
                  </span>
                }
              </div>
            </div>
          } @else {
            <div class="install-card small">
              <nv-icon name="wifi" [size]="14"/>
              <span><strong>Install Netvelox companion</strong> to see WiFi name and connected devices. Browsers cannot read them. Run <code>npm run companion</code>, pair it once, then refresh this page.</span>
            </div>
          }
        </div>
      </div>
    </section>`,
  styles: [`
    .hero { padding-top: .55rem; }
    .hero__head { text-align: center; margin-bottom: .7rem; }
    .hero__head h1 { font-size: 1.65rem; margin: .15rem 0 .25rem; }
    .hero__head .page-sub { font-size: .8rem; margin: 0 auto; max-width: 68ch; line-height: 1.35; }
    .hero__grid { display: grid; grid-template-columns: 262px minmax(0, 1fr); gap: 1.1rem; align-items: start; padding: .9rem 1.1rem 1rem; }
    .meter-column { display: grid; gap: .5rem; }
    .side-column { display: grid; gap: .5rem; min-width: 0; }
    .server-bar { display: flex; gap: .6rem; align-items: center; }
    .server-bar .grow { flex: 1; min-width: 0; }
    .server-bar .input { min-height: 32px; padding: .25rem .5rem; font-size: .76rem; }
    .server-bar label { font-size: .68rem; }
    .server-location { display: inline-block; min-width: 6.5rem; text-align: right; white-space: nowrap; color: var(--nv-muted); font-size: .7rem; }
    .compact-alert { padding: .35rem .6rem; font-size: .75rem; }
    .metric-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: .45rem; }
    .metric-grid .stat { padding: .42rem .6rem; border-radius: 9px; min-width: 0; }
    .metric-grid .stat__label { font-size: .6rem; letter-spacing: .05em; }
    .metric-grid .stat__value { font-size: 1.08rem; margin-top: .1rem; line-height: 1.15; }
    .metric-grid .stat__value small { font-size: .56rem; color: var(--nv-muted); margin-left: .2rem; font-family: var(--nv-font); }
    .metric-grid .stat__sub { font-size: .6rem; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .metric-card { position: relative; overflow: hidden; }
    .metric-card::before { content:''; position:absolute; left:0; top:0; bottom:0; width:2px; background: var(--metric-color, var(--nv-border-strong)); }
    .go-row { display: grid; justify-items: center; gap: .25rem; }
    .btn--lg { min-height: 44px; padding: 0 1.4rem; font-size: .82rem; border-radius: 10px; }
    .go-btn { min-width: 132px; }
    .phase-steps { display: flex; justify-content: center; gap: .25rem; }
    .phase-step { font-size: .56rem; text-transform: uppercase; letter-spacing: .06em; padding: .16rem .4rem; border-radius: 99px; border: 1px solid var(--nv-muted); color: var(--nv-muted); }
    .phase-step--active { color: var(--nv-accent); border-color: var(--nv-accent); background: var(--nv-accent-soft); }
    .phase-step--done { color: var(--nv-excellent); border-color: var(--nv-excellent); }
    .progress-track { height: 3px; border-radius: 99px; background: var(--nv-panel-3); overflow: hidden; }
    .progress-fill { height: 100%; background: linear-gradient(90deg, var(--nv-accent), var(--nv-accent-2)); transition: width .25s linear; }
    .chart-card { padding: .45rem .6rem; border-radius: 9px; background: var(--nv-panel-2); border: 1px solid var(--nv-border); min-width: 0; }
    .chart-head { justify-content: space-between; margin-bottom: .1rem; }
    .connection-strip { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: .4rem; padding: .42rem .6rem; border-radius: 9px; background: var(--nv-panel-2); border: 1px solid var(--nv-border); }
    .connection-strip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; font-size: .66rem; }
    .connection-strip strong { color: var(--nv-muted); font-weight: 600; margin-right: .25rem; }
    .connection-strip em, .device-chip em { font-style: normal; color: var(--nv-moderate); font-size: .56rem; margin-left: .2rem; }
    .location-row { display: flex; align-items: center; gap: .4rem; }
    .location-row .flag { font-size: .9rem; }
    .location-row button { margin-left: auto; }
    .companion-card, .install-card { display: grid; gap: .3rem; padding: .42rem .6rem; border-radius: 9px; border: 1px solid var(--nv-border); background: var(--nv-panel-2); color: var(--nv-text-2); font-size: .68rem; }
    .install-card { display: flex; gap: .5rem; align-items: start; color: var(--nv-moderate); }
    .device-list { display: flex; gap: .8rem; flex-wrap: wrap; }
    .device-list strong { color: var(--nv-muted); margin-right: .2rem; }
    .device-chips { display: flex; gap: .3rem; flex-wrap: wrap; max-height: 40px; overflow: hidden; }
    .device-chip { display: inline-flex; align-items: center; gap: .2rem; padding: .1rem .35rem; border-radius: 99px; background: var(--nv-panel-3); font-family: var(--nv-mono); font-size: .6rem; }
    @media (max-width: 1180px) { .btn--lg, .btn--link.btn--sm, .server-bar .input { min-height: 44px; } }
    @media (max-width: 1100px) { .hero__grid { grid-template-columns: 240px minmax(0,1fr); gap: .8rem; } }
    @media (max-width: 900px) { .hero__grid { grid-template-columns: 1fr; } .meter-column { max-width: 270px; margin-inline: auto; width: 100%; } }
    @media (max-width: 640px) { .hero__head h1 { font-size: 1.4rem; } .metric-grid { grid-template-columns: repeat(2, minmax(0,1fr)); } .connection-strip { grid-template-columns: 1fr; } }
  `],
})
export class HomePage implements OnInit, OnDestroy {
  readonly test = inject(SpeedTestService);
  readonly servers = inject(ServerService);
  readonly net = inject(NetworkInfoService);
  readonly companion = inject(CompanionService);
  private readonly scoring = inject(ScoringService);
  private readonly seo = inject(SeoService);

  readonly steps = [
    { key: 'ping', label: 'Latency' }, { key: 'download', label: 'Download' },
    { key: 'upload', label: 'Upload' }, { key: 'done', label: 'Done' },
  ];
  readonly colors = {
    excellent: 'var(--nv-excellent)', good: 'var(--nv-good)', moderate: 'var(--nv-moderate)',
    poor: 'var(--nv-poor)', critical: 'var(--nv-critical)', unknown: 'var(--nv-muted)',
  };

  readonly mode = signal(connectionModeLabel());
  readonly modeReason = signal(connectionModeReason());
  readonly banner = computed(() => {
    const errors = [this.test.error(), this.net.error()].filter((v): v is string => !!v);
    return errors.length ? [...new Set(errors)].join(' · ') : null;
  });

  private readonly refreshTimer = setInterval(() => {
    this.mode.set(connectionModeLabel());
    this.modeReason.set(connectionModeReason());
  }, 5000);

  constructor() {
    this.seo.set({ title: 'Internet Speed Test', description: 'Real internet speed test measuring download, upload, latency, jitter, probe loss and loaded latency against the Cloudflare edge.', path: '/' });
  }

  ngOnInit(): void {
    void this.servers.discover();
    // Network lookup and companion detection never block first paint.
    setTimeout(() => void this.net.collect(), 0);
    setTimeout(() => void this.companion.detect(), 800);
  }

  ngOnDestroy(): void { clearInterval(this.refreshTimer); }

  start(): void { void this.test.start(); }
  retryBackend(): void { void this.servers.discover(); }
  usePreciseLocation(): void { void this.net.requestPreciseLocation(); }
  isPublicShare(): boolean {
    const path = location.pathname;
    return /^\/(result|r)\//.test(path) || new URLSearchParams(location.search).has('share');
  }

  isStepActive(key: string): boolean {
    if (key === 'done') return this.test.phase() === 'complete';
    return this.test.phase() === key;
  }
  isStepDone(key: string): boolean {
    const order: Record<string, number> = { ping: 1, download: 2, upload: 3, done: 4 };
    const current = this.test.phase() === 'complete' ? 4 : (order[this.test.phase()] ?? 0);
    return (order[key] ?? 0) <= current && current > 0;
  }

  readonly phaseLabel = computed(() => ({
    idle: 'READY TO TEST', preparing: 'PREPARING', ping: 'MEASURING LATENCY', download: 'DOWNLOAD',
    upload: 'UPLOAD', diagnostics: 'DIAGNOSTICS', complete: 'COMPLETE', error: 'TEST FAILED', cancelled: 'CANCELLED',
  })[this.test.phase()]);

  readonly downloadNumber = computed(() =>
    this.test.result()?.measurements.downloadMbps ?? (this.test.activeMetric() === 'download' ? this.test.liveMbps() : null));
  readonly uploadNumber = computed(() =>
    this.test.result()?.measurements.uploadMbps ?? (this.test.activeMetric() === 'upload' ? this.test.liveMbps() : null));
  readonly latency = computed(() => this.test.result()?.measurements.latency ?? null);
  readonly loadedNumber = computed(() => {
    const l = this.latency();
    const values = [l?.loadedDownload, l?.loadedUpload].filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    return values.length ? Math.max(...values) : null;
  });
  readonly downloadColor = computed(() => this.colors[this.scoring.level('downloadMbps', this.downloadNumber())]);
  readonly uploadColor = computed(() => this.colors[this.scoring.level('uploadMbps', this.uploadNumber())]);
  readonly latencyColor = computed(() => this.colors[this.scoring.level('idleMs', this.latency()?.avg ?? null)]);
  readonly jitterColor = computed(() => this.colors[this.scoring.level('jitterMs', this.latency()?.jitter ?? null)]);
  readonly lossColor = computed(() => this.colors[this.scoring.level('lossPct', this.latency()?.packetLossPct ?? null)]);
  readonly loadedColor = computed(() => this.colors[this.scoring.level('loadedMs', this.loadedNumber())]);

  resultNumber(metric: string): number | null {
    const l = this.latency();
    if (!l) return null;
    if (metric === 'idleMs') return l.avg;
    if (metric === 'jitterMs') return l.jitter;
    if (metric === 'lossPct') return l.packetLossPct;
    return null;
  }

  readonly isp = computed(() => this.net.snapshot()?.ipv4.isp ?? (this.net.loading() ? 'Detecting…' : 'Unavailable'));
  readonly publicIp = computed(() => this.net.snapshot()?.ipv4.ip ?? (this.net.loading() ? 'Detecting…' : 'Unavailable'));
  readonly location = computed(() => {
    const info = this.net.snapshot()?.ipv4;
    if (info?.city && info.countryCode) return `${info.city}, ${info.countryCode}`;
    if (info?.city || info?.country) return info.city ?? info.country;
    return this.net.loading() ? 'Detecting…' : 'Unavailable';
  });
  readonly serverLocation = computed(() => {
    const s = this.test.currentServer() ?? this.servers.selected();
    return s ? `${s.city}${s.countryCode ? ', ' + s.countryCode : ''}` : 'Cloudflare edge';
  });
  readonly serverFlag = computed(() => this.flagClass(this.test.currentServer()?.countryCode ?? this.servers.selected()?.countryCode));

  flagClass(code: string | null | undefined): string {
    return code && /^[a-z]{2}$/i.test(code) ? `fi-${code.toLowerCase()}` : '';
  }

  deviceIcon(device: CompanionDevice): string {
    const c = device.category;
    if (c === 'phone') return 'phone';
    if (c === 'laptop') return 'laptop';
    if (c === 'tv') return 'tv';
    if (c === 'tablet') return 'tablet';
    if (c === 'router') return 'router';
    return 'device';
  }

  fmtNum = (v: number | null | undefined): string => v === null || v === undefined ? '—' : String(v);

  onServerChange(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    this.servers.select(id);
  }
}
