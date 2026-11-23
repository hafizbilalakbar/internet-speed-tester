import { Injectable, NgZone, OnDestroy, computed, inject, signal } from '@angular/core';
import {
  AiAnalysis, ConnectionStability, LatencyStats, NetworkSnapshot, QualityScore, SpeedSample,
  TestMeasurements, TestPhase, TestResult, TestingServer,
} from '../models/models';
import { AppConfigService } from './app-config.service';
import { MeasurementService } from './measurement.service';
import { ServerService } from './server.service';
import { NetworkInfoService } from './network-info.service';
import { ScoringService } from './scoring.service';
import { AiService } from './ai.service';
import { ResultsService } from './results.service';
import { SoundService } from './sound.service';

const WARMUP_MS = 1500;
const DOWNLOAD_MS = 8000;
const UPLOAD_MS = 8000;
const PING_SAMPLES = 12;
const PROBES = 16;
const STREAMS = 4;
const UPLOAD_PAYLOAD_BYTES = 256 * 1024;

@Injectable({ providedIn: 'root' })
export class SpeedTestService implements OnDestroy {
  private readonly zone = inject(NgZone);
  private readonly config = inject(AppConfigService);
  private readonly measure = inject(MeasurementService);
  private readonly servers = inject(ServerService);
  private readonly network = inject(NetworkInfoService);
  private readonly scoring = inject(ScoringService);
  private readonly ai = inject(AiService);
  private readonly results = inject(ResultsService);
  private readonly sound = inject(SoundService);

  readonly phase = signal<TestPhase>('idle');
  readonly progress = signal(0);
  readonly activeMetric = signal<'download' | 'upload' | null>(null);
  readonly liveMbps = signal(0);
  readonly chartSamples = signal<SpeedSample[]>([]);
  readonly currentServer = signal<TestingServer | null>(null);
  readonly result = signal<TestResult | null>(null);
  readonly error = signal<string | null>(null);
  readonly intro = signal(false);
  readonly analysis = signal<AiAnalysis | null>(null);
  readonly score = signal<QualityScore | null>(null);
  readonly isRunning = computed(() => ['preparing', 'ping', 'download', 'upload', 'diagnostics'].includes(this.phase()));

  private controller: AbortController | null = null;
  private timers = new Set<number>();
  private loadedStop: (() => void) | null = null;

  private get downUrl(): string { return `${this.config.speedBase}/__down`; }
  private get upUrl(): string { return `${this.config.speedBase}/__up`; }

  /** Publishing happens at the measurement sample rate (4 Hz), never per animation frame. */
  private publish(sample: SpeedSample): void {
    this.zone.run(() => {
      this.liveMbps.set(sample.mbps);
      this.chartSamples.update(list => [...list, sample].slice(-160));
    });
  }

  private wait(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise(resolve => {
      if (signal.aborted) { resolve(); return; }
      const id = window.setTimeout(() => { this.timers.delete(id); resolve(); }, ms);
      this.timers.add(id);
      const onAbort = () => { clearTimeout(id); this.timers.delete(id); resolve(); };
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  async start(): Promise<void> {
    if (this.isRunning()) return;
    this.cleanup();
    const controller = new AbortController();
    this.controller = controller;
    const signal = controller.signal;
    this.zone.run(() => {
      this.phase.set('preparing'); this.progress.set(2); this.error.set(null);
      this.result.set(null); this.analysis.set(null); this.score.set(null);
      this.activeMetric.set(null); this.intro.set(true);
      this.liveMbps.set(0); this.chartSamples.set([]);
    });
    this.sound.play('start');

    try {
      // Intro sweep runs once, before a single measurement request is made.
      await this.wait(1000, signal);
      if (signal.aborted) return;
      this.zone.run(() => { this.intro.set(false); this.phase.set('ping'); this.progress.set(8); });

      const edgeMeta = await this.measure.edgeMeta(this.downUrl, signal);
      const server = this.servers.edgeServer(edgeMeta);
      this.zone.run(() => this.currentServer.set(server));

      const pingValues = await this.measure.ping(this.downUrl, PING_SAMPLES, signal);
      if (signal.aborted) return;
      if (!pingValues.length) throw new Error('The edge did not return any valid latency samples.');
      const pingStats = MeasurementService.stats(pingValues) as LatencyStats;
      this.zone.run(() => this.progress.set(16));

      // ---- DOWNLOAD ----
      this.zone.run(() => {
        this.phase.set('download'); this.activeMetric.set('download');
        this.progress.set(20); this.liveMbps.set(0);
      });
      this.sound.play('download');
      const loadedDownload: number[] = [];
      const stopLoadedDownload = this.startLoadedPings(loadedDownload, signal);
      const startedAt = performance.now();
      const download = await this.measure.download({
        url: this.downUrl, connections: STREAMS, durationMs: DOWNLOAD_MS, warmupMs: WARMUP_MS,
        startedAt, signal, onSample: s => this.publish(s),
      });
      stopLoadedDownload();
      if (signal.aborted) return;
      this.zone.run(() => { this.liveMbps.set(+download.mbps.toFixed(2)); this.progress.set(52); });

      // Needle returns to zero before the upload phase begins.
      this.zone.run(() => { this.liveMbps.set(0); this.activeMetric.set(null); });
      await this.wait(550, signal);
      if (signal.aborted) return;

      // ---- UPLOAD ----
      this.zone.run(() => {
        this.phase.set('upload'); this.activeMetric.set('upload');
        this.progress.set(58); this.liveMbps.set(0);
      });
      this.sound.play('upload');
      const loadedUpload: number[] = [];
      const stopLoadedUpload = this.startLoadedPings(loadedUpload, signal);
      const uploadStartedAt = performance.now();
      const upload = await this.measure.upload({
        url: this.upUrl, payload: MeasurementService.randomPayload(UPLOAD_PAYLOAD_BYTES),
        connections: STREAMS, durationMs: UPLOAD_MS, warmupMs: WARMUP_MS,
        startedAt: uploadStartedAt, signal, onSample: s => this.publish(s),
      });
      stopLoadedUpload();
      if (signal.aborted) return;
      this.zone.run(() => { this.liveMbps.set(+upload.mbps.toFixed(2)); this.progress.set(86); });

      // ---- DIAGNOSTICS ----
      this.zone.run(() => { this.phase.set('diagnostics'); this.progress.set(90); });
      const loss = await this.measure.probeLoss(this.downUrl, PROBES, signal);
      if (signal.aborted) return;
      const allSamples = [...download.samples, ...upload.samples];
      const stability = this.computeStability(allSamples, download.interruptions + upload.interruptions);
      const latency: LatencyStats = {
        ...pingStats,
        loadedDownload: MeasurementService.stats(loadedDownload).avg ?? null,
        loadedUpload: MeasurementService.stats(loadedUpload).avg ?? null,
        packetLossPct: loss.sent ? +(loss.lost / loss.sent * 100).toFixed(1) : null,
        packetLossMethod: loss.method,
        packetsSent: loss.sent, packetsLost: loss.lost,
      };
      const measurements: TestMeasurements = {
        downloadMbps: +download.mbps.toFixed(2), uploadMbps: +upload.mbps.toFixed(2),
        downloadSamples: download.samples, uploadSamples: upload.samples,
        downloadDurationMs: download.durationMs, uploadDurationMs: upload.durationMs,
        connections: STREAMS, latency, stability,
        bytesDownloaded: download.bytes, bytesUploaded: upload.bytes,
      };
      const score = this.scoring.score(measurements);
      const analysis = await this.ai.analyze(measurements, server);
      const snapshot = this.network.snapshot() ?? await this.network.collect().catch(() => null);
      const now = new Date().toISOString();
      const result: TestResult = {
        id: `NV-${Date.now().toString(36).toUpperCase()}-${randomSuffix()}`,
        shareToken: null, ownerToken: null, createdAt: now, server, measurements, score, analysis,
        network: snapshot ?? this.emptySnapshot(now),
        share: { ip: false, isp: false, location: false },
      };
      // Persistence is best-effort: the speed test is already complete if the Node API is down.
      const saved = await this.results.persist(result);
      this.zone.run(() => {
        this.score.set(score); this.analysis.set(analysis);
        this.result.set(saved); this.activeMetric.set(null); this.liveMbps.set(0);
        this.chartSamples.set([...download.samples, ...upload.samples]);
        this.progress.set(100); this.phase.set('complete'); this.intro.set(false);
      });
      this.sound.play('complete');
    } catch (e) {
      if (signal.aborted) return;
      this.zone.run(() => {
        this.error.set((e as { message?: string }).message ?? 'The measurement could not be completed.');
        this.phase.set('error'); this.intro.set(false); this.liveMbps.set(0);
      });
      this.sound.play('error');
    }
  }

  /** Loaded latency probes run outside NgZone and are aborted with the test. */
  private startLoadedPings(out: number[], signal: AbortSignal): () => void {
    let inFlight = false;
    const id = this.zone.runOutsideAngular(() => window.setInterval(async () => {
      if (signal.aborted || inFlight || out.length >= 24) return;
      inFlight = true;
      try {
        const values = await this.measure.ping(this.downUrl, 1, signal);
        out.push(...values);
      } catch { /* a failed loaded probe is simply omitted */ }
      finally { inFlight = false; }
    }, 550));
    this.timers.add(id);
    const stop = () => {
      clearInterval(id); this.timers.delete(id);
      if (this.loadedStop === stop) this.loadedStop = null;
    };
    this.loadedStop = stop;
    return stop;
  }

  cancel(): void {
    this.controller?.abort();
    this.cleanup();
    this.zone.run(() => {
      this.phase.set('cancelled'); this.intro.set(false);
      this.liveMbps.set(0); this.activeMetric.set(null);
    });
  }

  reset(): void {
    this.controller?.abort();
    this.cleanup();
    this.zone.run(() => {
      this.phase.set('idle'); this.progress.set(0); this.error.set(null);
      this.result.set(null); this.liveMbps.set(0); this.chartSamples.set([]); this.intro.set(false);
    });
  }

  private cleanup(): void {
    this.loadedStop?.(); this.loadedStop = null;
    for (const id of this.timers) clearTimeout(id), clearInterval(id);
    this.timers.clear();
  }

  ngOnDestroy(): void { this.controller?.abort(); this.cleanup(); }

  private computeStability(samples: SpeedSample[], interruptions: number): ConnectionStability {
    const values = samples.map(s => s.mbps).filter(v => Number.isFinite(v));
    if (!values.length) return { sampleCount: 0, deviationPct: null, interruptions, rating: 'unknown' as const };
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    const deviationPct = mean > 0 ? +(Math.sqrt(variance) / mean * 100).toFixed(1) : 100;
    const rating = interruptions > 1 || deviationPct > 45 ? 'poor' : interruptions > 0 || deviationPct > 28 ? 'moderate' : deviationPct > 15 ? 'good' : 'excellent';
    return { sampleCount: values.length, deviationPct, interruptions, rating };
  }

  private emptySnapshot(now: string): NetworkSnapshot {
    return {
      ipv4: { ip: null, family: 'IPv4', isp: null, asn: null, org: null, city: null, region: null, country: null, countryCode: null, latitude: null, longitude: null, timezone: null, source: null },
      ipv6: null,
      browser: {
        browser: 'Unknown', browserVersion: '', os: 'Unknown', deviceType: 'desktop', screen: '', language: '', timezone: '',
        hardwareConcurrency: null, deviceMemoryGb: null, connectionType: null, effectiveType: null,
        downlinkMbps: null, rttEstimateMs: null, online: navigator.onLine, webgl: false, source: 'browser-reported estimate',
      },
      preciseLocation: null, preciseCity: null, locationDetail: null, collectedAt: now,
    };
  }
}

function randomSuffix(): string {
  try { return crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase(); }
  catch { return Math.random().toString(36).slice(2, 8).toUpperCase(); }
}
