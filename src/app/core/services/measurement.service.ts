import { Injectable } from '@angular/core';
import { LatencyStats, SpeedSample } from '../models/models';

export interface ThroughputResult {
  /** Payload bytes transferred after the warm-up window (headers are never counted). */
  bytes: number;
  samples: SpeedSample[];
  /** Real measurement duration after warm-up. */
  durationMs: number;
  interruptions: number;
  /** Average payload throughput of the stable window. */
  mbps: number;
}

export interface ThroughputOptions {
  url: string;
  connections: number;
  durationMs: number;
  warmupMs: number;
  /** Start of this phase. Drives timeouts and the warm-up window. */
  startedAt: number;
  /** Start of the whole test. Drives the chart's relative time axis. */
  timelineStart?: number;
  signal: AbortSignal;
  onSample: (sample: SpeedSample) => void;
}

export interface EdgeMeta {
  ip: string | null;
  country: string | null;
  city: string | null;
  colo: string | null;
  asn: string | null;
  timezone: string | null;
}

export interface TraceInfo extends EdgeMeta {
  organization: string | null;
  httpProtocol: string | null;
  tlsVersion: string | null;
}

const SAMPLE_MS = 200;
const WINDOW_MS = 1000;

interface RateWindow {
  buckets: Array<{ t: number; bytes: number }>;
  stableBytes: number;
  lastSampleAt: number;
  origin: number;
}

function createWindow(origin: number): RateWindow {
  return { buckets: [], stableBytes: 0, lastSampleAt: -Infinity, origin };
}

function addBytes(w: RateWindow, count: number, at: number, warmupEnd: number): void {
  if (count <= 0) return;
  if (at >= warmupEnd) w.stableBytes += count;
  w.buckets.push({ t: at, bytes: count });
  const cutoff = at - WINDOW_MS - SAMPLE_MS;
  while (w.buckets.length && w.buckets[0].t < cutoff) w.buckets.shift();
}

function sampleWindow(w: RateWindow, at: number, warmupEnd: number, lane: 'download' | 'upload'): SpeedSample | null {
  if (at < warmupEnd || at - w.lastSampleAt < SAMPLE_MS - 20) return null;
  w.lastSampleAt = at;
  const from = at - WINDOW_MS;
  let bytes = 0;
  for (const b of w.buckets) if (b.t >= from && b.t <= at) bytes += b.bytes;
  const spanMs = Math.max(1, Math.min(WINDOW_MS, at - warmupEnd));
  const mbps = (bytes * 8) / (spanMs / 1000) / 1_000_000;
  return { t: Math.max(0, Math.round(at - w.origin)), mbps: +Math.max(0, mbps).toFixed(2), lane };
}

/** Bytes actually transferred in the stable window divided by its real duration. */
function stableRate(stableBytes: number, stableMs: number): number {
  return stableMs > 0 ? Math.max(0, (stableBytes * 8) / (stableMs / 1000) / 1_000_000) : 0;
}

function cap(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }

@Injectable({ providedIn: 'root' })
export class MeasurementService {
  /** Streamed, uncached payload bytes; 4 parallel connections, warm-up excluded. */
  async download(opts: ThroughputOptions): Promise<ThroughputResult> {
    const { url, durationMs, warmupMs, startedAt, signal, onSample } = opts;
    const origin = opts.timelineStart ?? startedAt;
    const w = createWindow(origin);
    const warmupEnd = startedAt + warmupMs;
    const streams = cap(Math.round(opts.connections) || 4, 4, 6);
    const samples: SpeedSample[] = [];
    let interruptions = 0;
    let seq = 0;
    let chunk = 1024 * 1024;
    const active = new Set<AbortController>();

    const sampler = window.setInterval(() => {
      const sample = sampleWindow(w, performance.now(), warmupEnd, 'download');
      if (sample) { samples.push(sample); onSample(sample); }
    }, SAMPLE_MS);

    const worker = async () => {
      while (!signal.aborted && performance.now() - startedAt < durationMs) {
        const ctrl = new AbortController();
        active.add(ctrl);
        const onAbort = () => ctrl.abort();
        signal.addEventListener('abort', onAbort, { once: true });
        try {
          const res = await fetch(`${url}?bytes=${chunk}&n=${++seq}&r=${Math.random()}`, {
            cache: 'no-store', signal: ctrl.signal,
            headers: { 'Cache-Control': 'no-cache, no-transform', Accept: 'application/octet-stream' },
          });
          if (!res.ok || !res.body) throw new Error(`Edge download returned ${res.status}`);
          const reader = res.body.getReader();
          while (!signal.aborted && performance.now() - startedAt < durationMs) {
            const { done, value } = await reader.read();
            if (done) break;
            addBytes(w, value.byteLength, performance.now(), warmupEnd);
          }
          if (signal.aborted) {
            try { await reader.cancel(); } catch { /* stream already closed */ }
          } else if (performance.now() - startedAt >= durationMs) {
            // Drain the in-flight chunk instead of cancelling it: no failed requests
            // in DevTools, and no counted bytes after the measurement window.
            try { while (!(await reader.read()).done) { /* discard */ } } catch { /* stream closed */ }
          }
          const elapsed = Math.max(0.1, (performance.now() - startedAt - warmupMs) / 1000);
          const bytesPerSecond = w.stableBytes / elapsed;
          chunk = Math.round(cap(bytesPerSecond * 1.15, 256 * 1024, 4 * 1024 * 1024) / 65536) * 65536;
        } catch {
          if (!signal.aborted) interruptions++;
        } finally {
          signal.removeEventListener('abort', onAbort);
          active.delete(ctrl);
          ctrl.abort();
        }
      }
    };

    try { await Promise.all(Array.from({ length: streams }, () => worker())); }
    finally {
      clearInterval(sampler);
      for (const c of active) c.abort();
    }
    const stableMs = Math.max(0, performance.now() - startedAt - warmupMs);
    return {
      bytes: w.stableBytes, samples, durationMs: stableMs, interruptions,
      mbps: stableRate(w.stableBytes, stableMs),
    };
  }

  /** XHR progress is sampled for the graph; the edge's acknowledged bytes set the final rate. */
  async upload(opts: ThroughputOptions & { payload: Blob }): Promise<ThroughputResult> {
    const { url, payload, durationMs, warmupMs, startedAt, signal, onSample } = opts;
    const origin = opts.timelineStart ?? startedAt;
    const w = createWindow(origin);
    const warmupEnd = startedAt + warmupMs;
    const streams = cap(Math.round(opts.connections) || 4, 4, 6);
    const samples: SpeedSample[] = [];
    let interruptions = 0;
    let n = 0;
    let sentStable = 0;
    let acknowledgedStable = 0;
    const active = new Set<XMLHttpRequest>();

    const sampler = window.setInterval(() => {
      const sample = sampleWindow(w, performance.now(), warmupEnd, 'upload');
      if (sample) { samples.push(sample); onSample(sample); }
    }, SAMPLE_MS);

    const send = () => new Promise<void>(resolve => {
      const xhr = new XMLHttpRequest();
      active.add(xhr);
      let counted = 0;
      xhr.open('POST', `${url}?bytes=${payload.size}&n=${++n}`);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.setRequestHeader('Cache-Control', 'no-cache');
      xhr.upload.onprogress = e => {
        if (!e.lengthComputable) return;
        const now = performance.now();
        const delta = Math.max(0, e.loaded - counted);
        counted = e.loaded;
        addBytes(w, delta, now, warmupEnd);
        if (now >= warmupEnd) sentStable += delta;
      };
      const finish = () => {
        active.delete(xhr);
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const received = Number((JSON.parse(xhr.responseText || '{}') as { received?: number }).received);
            if (Number.isFinite(received)) {
              acknowledgedStable += cap(received, 0, payload.size);
              if (performance.now() >= warmupEnd) addBytes(w, 0, performance.now(), warmupEnd);
            }
          } catch { /* progress bytes remain authoritative when no acknowledgement is returned */ }
        } else if (!signal.aborted) interruptions++;
        resolve();
      };
      xhr.onload = finish; xhr.onerror = finish; xhr.onabort = () => { active.delete(xhr); resolve(); };
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
      try { xhr.send(payload); } catch { if (!signal.aborted) interruptions++; resolve(); }
    });

    const workers = Array.from({ length: streams }, async () => {
      while (!signal.aborted && performance.now() - startedAt < durationMs) await send();
    });
    try { await Promise.all(workers); }
    finally {
      clearInterval(sampler);
      if (signal.aborted) active.forEach(x => x.abort());
    }
    const stableMs = Math.max(0, performance.now() - startedAt - warmupMs);
    const ratio = sentStable > 0 ? cap(acknowledgedStable / sentStable, 0, 1) : 1;
    const adjusted = samples.map(s => ({ ...s, mbps: +(s.mbps * ratio).toFixed(2) }));
    const acknowledgedBytes = Math.round(acknowledgedStable * cap(stableMs / Math.max(1, durationMs - warmupMs), 0, 1));
    return {
      bytes: Math.round(w.stableBytes * ratio) || acknowledgedBytes,
      samples: adjusted, durationMs: stableMs, interruptions,
      mbps: stableRate(acknowledgedStable || w.stableBytes * ratio, stableMs),
    };
  }

  /**
   * Warm up the connection, then measure Resource Timing request→first-byte on
   * distinct no-store probes. The median of 12+ samples removes cold-start and
   * queueing outliers; responseStart is zero without Timing-Allow-Origin, so the
   * edge worker exposes it to browsers.
   */
  async ping(url: string, count: number, signal: AbortSignal, warmup: boolean | string = true): Promise<number[]> {
    // Repeated tests must not lose newest probes to the browser's Resource Timing buffer.
    try {
      if (typeof performance.setResourceTimingBufferSize === 'function') performance.setResourceTimingBufferSize(2000);
      if (count >= 8) performance.clearResourceTimings();
    } catch { /* buffer management is best-effort */ }
    // A string here is a legacy tool label; only the literal true asks for warm-up.
    if (warmup === true) {
      try {
        const warmUrl = `${url}?bytes=256&warm=${Date.now()}`;
        await fetch(warmUrl, { cache: 'no-store', signal, headers: { 'Cache-Control': 'no-cache' } });
      } catch { /* a failed warm-up is ignored; real samples still decide */ }
    }
    const values: number[] = [];
    for (let i = 0; i < count; i++) {
      if (signal.aborted) break;
      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), 3000);
      const combined = typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, ctrl.signal]) : signal;
      const probeUrl = `${url}?bytes=256&p=${i}&t=${Date.now()}-${Math.random().toString(36).slice(2)}`;
      try {
        const res = await fetch(probeUrl, { cache: 'no-store', signal: combined, headers: { 'Cache-Control': 'no-cache' } });
        if (!res.ok) continue;
        await res.arrayBuffer();
        const entry = performance.getEntriesByName(probeUrl).at(-1) as PerformanceResourceTiming | undefined;
        const rtt = entry && entry.responseStart > entry.requestStart && entry.requestStart > 0
          ? entry.responseStart - entry.requestStart
          : entry?.duration;
        if (typeof rtt === 'number' && Number.isFinite(rtt) && rtt > 0) values.push(+rtt.toFixed(1));
      } catch { if (signal.aborted) break; }
      finally { clearTimeout(timer); }
    }
    return values;
  }

  /** Application-layer probe loss (not ICMP). */
  async probeLoss(url: string, count: number, signal: AbortSignal): Promise<{ sent: number; lost: number; method: string }> {
    let sent = 0, lost = 0;
    for (let i = 0; i < count; i++) {
      if (signal.aborted) break;
      sent++;
      const ctrl = new AbortController();
      const onAbort = () => ctrl.abort();
      signal.addEventListener('abort', onAbort, { once: true });
      const timer = window.setTimeout(() => ctrl.abort(), 2000);
      try {
        const res = await fetch(`${url}?bytes=256&probe=${i}&t=${Date.now()}`, { cache: 'no-store', signal: ctrl.signal });
        if (!res.ok) lost++; else await res.arrayBuffer();
      } catch { lost++; }
      finally { clearTimeout(timer); signal.removeEventListener('abort', onAbort); }
    }
    return { sent, lost, method: 'HTTP/HTTPS sequenced probes (application-layer approximation, not ICMP)' };
  }

  /** Cloudflare metadata exposed on every no-store measurement response. */
  async edgeMeta(url: string, signal: AbortSignal): Promise<EdgeMeta | null> {
    try {
      const res = await fetch(`${url}?bytes=256&r=meta&t=${Date.now()}`, { cache: 'no-store', signal });
      if (!res.ok) return null;
      await res.arrayBuffer();
      const h = (name: string) => res.headers.get(name);
      const meta: EdgeMeta = {
        ip: h('cf-meta-ip') ?? h('cf-meta-client-ip') ?? null,
        country: h('cf-meta-country') ?? h('country') ?? null,
        city: h('cf-meta-city') ?? h('city') ?? null,
        colo: h('cf-meta-colo') ?? h('colo') ?? null,
        asn: h('asn') ?? h('cf-meta-asn') ?? null,
        timezone: h('timezone') ?? null,
      };
      return Object.values(meta).some(Boolean) ? meta : null;
    } catch { return null; }
  }

  /** Cloudflare trace: real edge city/colo/IP from the same Worker, browser-readable CORS. */
  async trace(base: string, signal: AbortSignal): Promise<TraceInfo | null> {
    try {
      const res = await fetch(`${base.replace(/\/$/, '')}/trace?t=${Date.now()}`, { cache: 'no-store', signal });
      if (!res.ok) return null;
      const text = await res.text();
      const fields = new Map(text.split('\n').map(line => {
        const at = line.indexOf('=');
        return at < 0 ? ['', ''] : [line.slice(0, at).trim(), line.slice(at + 1).trim()];
      }));
      const ip = fields.get('ip') || null;
      const country = fields.get('country') || null;
      if (!ip && !country) return null;
      return {
        ip, country, city: fields.get('city') || null, colo: fields.get('colo') || null,
        asn: fields.get('asn') || null, organization: fields.get('org') || null,
        timezone: null, httpProtocol: fields.get('http') || null, tlsVersion: fields.get('tls') || null,
      };
    } catch { return null; }
  }

  static stats(values: number[]): Pick<LatencyStats, 'min' | 'max' | 'avg' | 'median' | 'jitter' | 'samples'> {
    const s = values.filter(v => Number.isFinite(v) && v > 0);
    if (!s.length) return { samples: [], min: null, max: null, avg: null, median: null, jitter: null };
    const sorted = [...s].sort((a, b) => a - b);
    const avg = s.reduce((a, b) => a + b, 0) / s.length;
    let jitter = 0;
    for (let i = 1; i < s.length; i++) jitter += Math.abs(s[i] - s[i - 1]);
    return {
      samples: s,
      min: +sorted[0].toFixed(1),
      max: +sorted[sorted.length - 1].toFixed(1),
      avg: +avg.toFixed(1),
      median: +sorted[Math.floor(sorted.length / 2)].toFixed(1),
      jitter: s.length > 1 ? +(jitter / (s.length - 1)).toFixed(1) : 0,
    };
  }

  static randomPayload(bytes: number): Blob {
    const chunk = 64 * 1024;
    const parts: Uint8Array[] = [];
    for (let i = 0; i < bytes; i += chunk) {
      const buf = new Uint8Array(Math.min(chunk, bytes - i));
      crypto.getRandomValues(buf);
      parts.push(buf);
    }
    return new Blob(parts as BlobPart[], { type: 'application/octet-stream' });
  }
}
