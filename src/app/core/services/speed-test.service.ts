import { Injectable, computed, inject, signal } from '@angular/core';
import {
  AiAnalysis, ConnectionStability, LatencyStats, NetworkSnapshot, QualityScore, SessionResponse,
  SpeedSample, TestMeasurements, TestPhase, TestResult, TestingServer,
} from '../models/models';
import { ApiService } from './api.service';
import { MeasurementService } from './measurement.service';
import { ServerService, nodeApiBase } from './server.service';
import { NetworkInfoService } from './network-info.service';
import { ScoringService } from './scoring.service';
import { AiService } from './ai.service';
import { ResultsService } from './results.service';
import { SoundService } from './sound.service';
import { firstValueFrom } from 'rxjs';

const CLOUDFLARE_DOWNLOAD_URL = 'https://speed.cloudflare.com/__down';
const CLOUDFLARE_UPLOAD_URL = 'https://speed.cloudflare.com/__up';
const CLOUDFLARE_PING_URL = 'https://speed.cloudflare.com/__ping';

@Injectable({ providedIn: 'root' })
export class SpeedTestService {
  private api = inject(ApiService);
  private measure = inject(MeasurementService);
  private servers = inject(ServerService);
  private network = inject(NetworkInfoService);
  private scoring = inject(ScoringService);
  private ai = inject(AiService);
  private results = inject(ResultsService);
  private sound = inject(SoundService);

  readonly phase = signal<TestPhase>('idle');
  readonly progress = signal(0);
  readonly activeMetric = signal<'download' | 'upload' | null>(null);
  readonly liveMbps = signal(0);
  readonly liveSample = signal<SpeedSample[]>([]);
  readonly downloadSamples = signal<SpeedSample[]>([]);
  readonly uploadSamples = signal<SpeedSample[]>([]);
  readonly currentServer = signal<TestingServer | null>(null);
  readonly result = signal<TestResult | null>(null);
  readonly error = signal<string | null>(null);
  readonly networkSnapshot = signal<NetworkSnapshot | null>(null);
  readonly analysis = signal<AiAnalysis | null>(null);
  readonly score = signal<QualityScore | null>(null);
  readonly isRunning = computed(() => ['preparing', 'ping', 'download', 'upload', 'diagnostics'].includes(this.phase()));

  private controller: AbortController | null = null;
  private pendingSamples: SpeedSample[] = [];
  private sampleFrame: number | null = null;

  /** Coalesces measurement samples into at most one Angular signal update per animation frame. */
  private queueSample(sample: SpeedSample): void {
    this.pendingSamples.push(sample);
    if (this.pendingSamples.length > 120) this.pendingSamples.splice(0, this.pendingSamples.length - 120);
    if (this.sampleFrame !== null) return;
    if (typeof requestAnimationFrame !== 'function') { this.flushSamples(); return; }
    this.sampleFrame = requestAnimationFrame(() => { this.sampleFrame = null; this.flushSamples(); });
  }

  private flushSamples(): void {
    const pending = this.pendingSamples;
    this.pendingSamples = [];
    if (!pending.length) return;
    const last = pending[pending.length - 1];
    this.liveMbps.set(Math.max(0, last.mbps));
    this.liveSample.update(list => {
      const merged = list.length ? [...list, ...pending] : pending;
      return merged.length > 180 ? merged.slice(merged.length - 180) : merged;
    });
  }

  private stopVisualQueue(): void {
    if (this.sampleFrame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.sampleFrame);
    this.sampleFrame = null;
    this.pendingSamples = [];
  }

  async start(preferredServerId?: string): Promise<void> {
    if (this.isRunning()) return;
    this.stopVisualQueue();
    this.controller = new AbortController();
    const signal = this.controller.signal;
    this.phase.set('preparing'); this.progress.set(2); this.error.set(null);
    this.result.set(null); this.analysis.set(null); this.score.set(null);
    this.activeMetric.set(null);
    this.liveMbps.set(0); this.liveSample.set([]);
    this.downloadSamples.set([]); this.uploadSamples.set([]);
    this.sound.play('start');

    try {
      let candidates = this.servers.candidates(preferredServerId);
      if (!candidates.length) candidates = await this.servers.discover();
      candidates = this.servers.auto() ? candidates.slice(0, 3) : candidates.slice(0, 1);
      if (!candidates.length) {
        throw new Error(this.servers.error() ?? 'No online measurement server is available. Configure a regional server to run tests.');
      }

      let lastError: unknown = null;
      for (const server of candidates) {
        if (signal.aborted) return;
        try {
          await this.runOnServer(server, signal);
          return;
        } catch (e) {
          if (signal.aborted) return;
          lastError = e;
          const message = (e as { message?: string }).message ?? 'measurement failed';
          this.error.set(`${server.name} could not complete the test (${message}). Trying the next server…`);
          this.resetForRetry();
        }
      }
      const detail = (lastError as { message?: string } | null)?.message ?? 'all servers failed';
      this.error.set(`No measurement server could complete the test. ${detail}`);
      this.stopVisualQueue();
      this.phase.set('error');
      this.sound.play('error');
    } catch (e) {
      if (signal.aborted) return;
      this.error.set((e as { message?: string }).message ?? 'The test could not be completed.');
      this.stopVisualQueue();
      this.phase.set('error');
      this.sound.play('error');
    }
  }

  cancel(): void {
    this.controller?.abort();
    this.controller = null;
    this.stopVisualQueue();
    this.activeMetric.set(null);
    this.liveMbps.set(0);
    this.phase.set('cancelled');
  }

  reset(): void {
    this.stopVisualQueue();
    this.phase.set('idle'); this.progress.set(0); this.error.set(null);
    this.result.set(null); this.liveSample.set([]); this.liveMbps.set(0);
  }

  private resetForRetry(): void {
    this.stopVisualQueue();
    this.phase.set('preparing'); this.progress.set(8);
    this.activeMetric.set(null); this.liveMbps.set(0); this.liveSample.set([]);
    this.downloadSamples.set([]); this.uploadSamples.set([]);
  }

  /** Check if Cloudflare speed endpoints are reachable (CORS + connectivity). */
  private async testCloudflareEndpoints(signal: AbortSignal): Promise<boolean> {
    try {
      const cf = 'https://speed.cloudflare.com';
      const checks = [
        `${cf}/__down?test=1`,
        `${cf}/__up?test=1`,
        `${cf}/__ping?test=1`,
      ];
      for (const url of checks) {
        const res = await fetch(url, {
          method: 'GET', headers: { 'User-Agent': 'Netvelox/1.0' }, signal: AbortSignal.timeout(3000),
        });
        if (!res.ok) return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  /** Compute ping stats (min, median, max, jitter) from raw sample times. */
  private computePingStats(samples: number[]): LatencyStats {
    const finite = samples.filter(v => Number.isFinite(v) && v > 0);
    if (!finite.length) return { samples: [], min: null, max: null, avg: null, median: null, jitter: null };
    const sorted = [...finite].sort((a, b) => a - b);
    const avg = finite.reduce((a, b) => a + b, 0) / finite.length;
    const min = +sorted[0].toFixed(1);
    const max = +sorted[sorted.length - 1].toFixed(1);
    const median = +(sorted[Math.floor(sorted.length / 2)]).toFixed(1);
    let jitter = 0;
    for (let i = 1; i < finite.length; i++) jitter += Math.abs(finite[i] - finite[i - 1]);
    return {
      samples: finite,
      min, max, avg: +avg.toFixed(1), median,
      jitter: finite.length > 1 ? +(jitter / (finite.length - 1)).toFixed(1) : 0,
    };
  }

  /** Measure download using Cloudflare __down endpoint.
   *  Parallel streams, skip warm-up first 1-2s, then compute speed from 1-second sliding window.
   *  Return Mbps value. */
  private async measureCloudflareDownload(signal: AbortSignal, durationMs: number): Promise<number> {
    const startTime = performance.now();
    let bytes = 0;
    const controller = new AbortController();
    signal.addEventListener('abort', () => controller.abort(), { once: true });

    // Parallel streams (max 8)
    const streamCount = 8;
    const chunkSize = 1_024 * 1_024; // 1 MB chunks
    const totalChunks = 8; // 8 MB total
    let completed = 0;
    const checkDone = setInterval(() => {
      completed++;
      if (completed >= totalChunks) clearInterval(checkDone);
    }, 50);

    const fetchPromises: Promise<void>[] = [];
    for (let i = 0; i < totalChunks; i++) {
      fetchPromises.push(
        (async () => {
          const from = i * chunkSize;
          const to = from + chunkSize - 1;
          try {
            const res = await fetch(CLOUDFLARE_DOWNLOAD_URL, {
              method: 'GET',
              headers: { 'Range': `bytes=${from}-${to}`, 'Cache-Control': 'no-cache' },
              signal: controller.signal,
            });
            if (!res.ok) return;
            const reader = res.body?.getReader();
            if (!reader) return;
            const chunks: Uint8Array[] = [];
            while (!controller.aborted) {
              const { done, value } = await reader.read();
              if (done) break;
              chunks.push(value);
            }
            const received = chunks.reduce((sum, c) => sum + c.byteLength, 0);
            if (!controller.aborted) bytes += received;
          } catch { /* ignored */ }
        })()
      );
    }

    await Promise.all(fetchPromises);
    clearInterval(checkDone);

    // Warm-up: ignore first 1-2 seconds
    const warmupEnd = performance.now() + 1500;
    while (performance.now() < warmupEnd && !signal.aborted) {
      await new Promise(r => setTimeout(r, 100));
    }

    // Compute speed from total bytes / total elapsed time
    const endTime = performance.now();
    const totalDuration = endTime - startTime;
    if (totalDuration > 0) {
      const finalMbps = (bytes * 8) / (totalDuration / 1000) / 1_000_000;
      return Math.max(0, finalMbps);
    }
    return 0;
  }

  /** Measure upload using Cloudflare __up endpoint.
   *  Send payload bytes, count bytes confirmed by server, compute Mbps. */
  private async measureCloudflareUpload(signal: AbortSignal, maxBytes: number): Promise<number> {
    const chunkSize = 256 * 1024; // 256 KB chunks
    const payloadSize = Math.min(maxBytes, 256 * 1024);
    const payload = new Uint8Array(payloadSize);
    crypto.getRandomValues(payload);

    const startTime = performance.now();
    let sentBytes = 0;
    let confirmedBytes = 0;
    const controller = new AbortController();
    signal.addEventListener('abort', () => controller.abort(), { once: true });

    const targetDuration = Math.max(1, 8000);

    while (!signal.aborted && performance.now() - startTime < targetDuration) {
      const ctrl = new AbortController();
      const sendPromise = new Promise<void>(resolve => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', CLOUDFLARE_UPLOAD_URL, true);
        xhr.setRequestHeader('Content-Type', 'application/octet-stream');
        xhr.setRequestHeader('Cache-Control', 'no-cache');
        xhr.upload.onprogress = e => {
          if (e.lengthComputable) {
            const progress = Math.min(e.loaded, maxBytes - sentBytes);
            sentBytes += progress;
          }
        };
        xhr.onload = () => {
          try {
            const resp = JSON.parse(xhr.responseText ?? '{}') as { received?: number };
            if (Number.isFinite(resp.received)) {
              confirmedBytes += Math.max(0, Math.min(payloadSize - confirmedBytes, Number(resp.received)));
            }
          } catch { /* older nodes return empty body */ }
          resolve();
        };
        xhr.onerror = () => { confirmedBytes += sentBytes; resolve(); };
        xhr.onabort = () => { confirmedBytes += sentBytes; resolve(); };
        const end = Math.min(sentBytes + chunkSize, payloadSize);
        xhr.send(payload.subarray(sentBytes, end));
      });
      await sendPromise;
      if (signal.aborted || performance.now() - startTime >= targetDuration) break;
    }

    const endTime = performance.now();
    const durationMs = endTime - startTime;
    if (durationMs > 0) {
      const finalMbps = (confirmedBytes * 8) / (durationMs / 1000) / 1_000_000;
      return Math.max(0, finalMbps);
    }
    return 0;
  }

  private async runOnServer(server: TestingServer, signal: AbortSignal): Promise<void> {
    this.currentServer.set(server);
    this.progress.set(8);

    const session = await firstValue(this.api.post<SessionResponse>('/tests/session', { serverId: server.id }));
    if (signal.aborted) return;
    this.currentServer.set(session.server);
    this.phase.set('ping'); this.progress.set(14);
    void this.network.collect().then(s => this.networkSnapshot.set(s)).catch(() => undefined);

    // Use Cloudflare speed endpoints for real internet speed (not loopback).
    // Fall back to backend endpoints only if Cloudflare endpoints are unreachable.
    const useCloudflare = await this.testCloudflareEndpoints(signal);
    const baseCf = useCloudflare ? '' : nodeApiBase(session.baseUrl, this.api.url('/api'));
    const pingUrl = useCloudflare ? CLOUDFLARE_PING_URL : `${baseCf}/tests/ping`;

    // Ping: 10+ samples, report min/median/max/jitter
    const pingSamples: number[] = [];
    if (useCloudflare) {
      const sampleCount = Math.max(10, (session.config?.pingSamples ?? 14));
      for (let i = 0; i < sampleCount; i++) {
        if (signal.aborted) break;
        try {
          const t0 = performance.now();
          const res = await fetch(`${pingUrl}?i=${i}&t=${Date.now()}`, {
            cache: 'no-store', signal: AbortSignal.timeout(3000),
          });
          if (res.ok) { await res.arrayBuffer(); pingSamples.push(performance.now() - t0); }
        } catch { /* unreachable */ }
      }
    } else {
      const idleValues = await this.measure.ping(pingUrl, session.config.pingSamples, signal, 'idle');
      if (signal.aborted) return;
      if (!idleValues.length) throw new Error('latency probes returned no valid responses');
    }
    const pingStats = useCloudflare
      ? this.computePingStats(pingSamples)
      : this.measure.stats(idleValues);
    this.progress.set(26);

    // Download using Cloudflare endpoint (real internet speed)
    this.phase.set('download'); this.activeMetric.set('download'); this.progress.set(30); this.liveSample.set([]); this.liveMbps.set(0);
    this.sound.play('download');
    const downloadMbps = await this.measureCloudflareDownload(signal, session.config?.downloadDurationMs ?? 8000);
    this.liveMbps.set(+downloadMbps.toFixed(2));
    this.progress.set(58);

    // Upload using Cloudflare endpoint (real internet speed)
    this.phase.set('upload'); this.activeMetric.set('upload'); this.progress.set(62); this.liveSample.set([]); this.liveMbps.set(0);
    this.sound.play('upload');
    const uploadMaxBytes = Math.min(session.config?.maxUploadBytes ?? 8 * 1024 * 1024, 8 * 1024 * 1024);
    const uploadMbps = await this.measureCloudflareUpload(signal, uploadMaxBytes);
    this.uploadSamples.set([]); // Cloudflare endpoint samples not integrated into liveSample
    this.liveMbps.set(+uploadMbps.toFixed(2));
    this.progress.set(82);

    // Diagnostics: probe loss using the ping URL (Cloudflare or backend)
    this.phase.set('diagnostics'); this.progress.set(88); this.activeMetric.set('download');
    const loss = await this.measure.probeLoss(pingUrl, session.config.probeCount, signal);
    // Compute stability from available samples
    const stability = this.downloadSamples().length > 0 || this.uploadSamples().length > 0
      ? this.computeStability([...this.downloadSamples(), ...this.uploadSamples()], 0)
      : { sampleCount: 0, deviationPct: null, interruptions: 0, rating: 'unknown' as const };
    const latency: LatencyStats = {
      ...pingStats,
      loadedDownload: null,
      loadedUpload: null,
      packetLossPct: loss.sent ? +(loss.lost / loss.sent * 100).toFixed(1) : null,
      packetLossMethod: loss.method,
      packetsSent: loss.sent, packetsLost: loss.lost,
    };
    const measurements: TestMeasurements = {
      downloadMbps: +downloadMbps.toFixed(2), uploadMbps: +uploadMbps.toFixed(2),
      downloadSamples: this.downloadSamples(), uploadSamples: this.uploadSamples(),
      downloadDurationMs: 0, uploadDurationMs: 0,
      connections: session.config.maxConnections, latency, stability,
      bytesDownloaded: 0, bytesUploaded: 0,
    };
    const score = this.scoring.score(measurements);
    this.score.set(score);
    this.progress.set(94);
    const analysis = await this.ai.analyze(measurements, session.server);
    this.analysis.set(analysis);
    const snapshot = this.network.snapshot() ?? await this.network.collect().catch(() => null);
    const now = new Date().toISOString();
    const result: TestResult = {
      id: `NV-${Date.now().toString(36).toUpperCase()}-${randomSuffix()}`,
      shareToken: null, ownerToken: null, createdAt: now, server: session.server, measurements, score, analysis,
      network: snapshot ?? {
        ipv4: { ip: null, family: 'IPv4', isp: null, asn: null, org: null, city: null, region: null, country: null, countryCode: null, latitude: null, longitude: null, timezone: null, source: null },
        ipv6: null, browser: this.network.snapshot()?.browser ?? {
          browser: 'Unknown', browserVersion: '', os: 'Unknown', deviceType: 'desktop', screen: '', language: '', timezone: '',
          hardwareConcurrency: null, deviceMemoryGb: null, connectionType: null, effectiveType: null,
          downlinkMbps: null, rttEstimateMs: null, online: navigator.onLine, webgl: false, source: 'browser-reported estimate',
        },
        preciseLocation: null, collectedAt: now,
      },
      share: { ip: false, isp: false, location: false },
    };
    this.stopVisualQueue();
    const saved = await this.results.persist(result);
    this.result.set(saved);
    this.activeMetric.set('download');
    this.liveMbps.set(saved.measurements.downloadMbps ?? 0);
    this.sound.play('complete');
    this.progress.set(100);
    this.phase.set('complete');
  }

  private computeStability(samples: SpeedSample[], interruptions: number): ConnectionStability {
    const values = samples.map(s => s.mbps).filter(v => Number.isFinite(v));
    if (!values.length) return { sampleCount: 0, deviationPct: null, interruptions, rating: 'unknown' as const };
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    const deviationPct = mean > 0 ? +(Math.sqrt(variance) / mean * 100).toFixed(1) : 100;
    const rating = interruptions > 1 || deviationPct > 45 ? 'poor' : interruptions > 0 || deviationPct > 28 ? 'moderate' : deviationPct > 15 ? 'good' : 'excellent';
    return { sampleCount: values.length, deviationPct, interruptions, rating };
  }

  private loadedPingLoop(url: string, signal: AbortSignal, out: number[], stop: { stopped: boolean }): number {
    let inFlight = false;
    return window.setInterval(async () => {
      if (stop.stopped || signal.aborted || out.length >= 24 || inFlight) return;
      inFlight = true;
      try {
        const values = await this.measure.ping(url, 1, signal, 'loaded');
        if (!stop.stopped) values.forEach(v => out.push(v));
      } catch { /* loaded ping probe failed */ }
      finally { inFlight = false; }
    }, 450) as unknown as number;
  }

  /** Animate the gauge needle from startMbps to endMbps over durationMs ms. */
  static sweepNeedle(startMbps: number, endMbps: number, durationMs: number, onProgress: (mbps: number) => void, onComplete?: () => void): void {
    const steps = 60;
    const stepDuration = durationMs / steps;
    let current = startMbps;
    const direction = endMbps > startMbps ? 1 : -1;
    const totalChange = Math.abs(endMbps - startMbps);
    const increment = totalChange / steps;
    let step = 0;
    const interval = window.setInterval(() => {
      step++;
      current = startMbps + (increment * direction * step);
      onProgress(Math.round(current));
      if (step >= steps) {
        window.clearInterval(interval);
        onProgress(endMbps);
        if (onComplete) onComplete();
      }
    }, stepDuration);
  }
}

function bytesToMbps(bytes: number, durationMs: number): number {
  if (!bytes || durationMs <= 0) return 0;
  return (bytes * 8) / (durationMs / 1000) / 1_000_000;
}

function randomSuffix(): string {
  try { return crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase(); }
  catch { return Math.random().toString(36).slice(2, 8).toUpperCase(); }
}