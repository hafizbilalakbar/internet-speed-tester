import { Injectable } from '@angular/core';
import { LatencyStats, SpeedSample } from '../models/models';

export interface ThroughputResult {
  /** Real bytes transferred after the warm-up window. */
  bytes: number;
  samples: SpeedSample[];
  /** Real measurement duration after warm-up. */
  durationMs: number;
  interruptions: number;
  /** Average of the stable one-second windows. */
  mbps: number;
}

export interface ThroughputOptions {
  url: string;
  connections: number;
  durationMs: number;
  warmupMs: number;
  /** performance.now() timestamp shared by every phase, so the chart has one real time axis. */
  startedAt: number;
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

const SAMPLE_MS = 500;
const WINDOW_MS = 1000;

interface RateWindow {
  /** Plain arrays, never signals: sampling must not trigger change detection. */
  buckets: Array<{ t: number; bytes: number }>;
  stableBytes: number;
  rates: number[];
  lastSampleAt: number;
}

function createWindow(): RateWindow {
  return { buckets: [], stableBytes: 0, rates: [], lastSampleAt: 0 };
}

function addBytes(w: RateWindow, count: number, at: number, warmupEnd: number): void {
  if (count <= 0) return;
  if (at >= warmupEnd) w.stableBytes += count;
  w.buckets.push({ t: at, bytes: count });
  const cutoff = at - WINDOW_MS - SAMPLE_MS;
  while (w.buckets.length && w.buckets[0].t < cutoff) w.buckets.shift();
}

function sampleWindow(w: RateWindow, at: number, warmupEnd: number, lane: 'download' | 'upload'): SpeedSample | null {
  if (at < warmupEnd || at - w.lastSampleAt < SAMPLE_MS - 30) return null;
  w.lastSampleAt = at;
  const from = at - WINDOW_MS;
  let bytes = 0;
  for (const b of w.buckets) if (b.t >= from && b.t <= at) bytes += b.bytes;
  const spanMs = Math.min(WINDOW_MS, at - warmupEnd);
  const mbps = spanMs > 0 ? (bytes * 8) / (spanMs / 1000) / 1_000_000 : 0;
  w.rates.push(mbps);
  return { t: Math.round(at), mbps: +Math.max(0, mbps).toFixed(2), lane };
}

/** Average of the stable part, discarding the fastest and slowest decile. */
function stableRate(w: RateWindow, stableBytes: number, stableMs: number): number {
  const values = [...w.rates].sort((a, b) => a - b);
  const trim = Math.floor(values.length * 0.1);
  const kept = values.slice(trim, Math.max(trim + 1, values.length - trim)).filter(Number.isFinite);
  const fromRates = kept.length ? kept.reduce((a, b) => a + b, 0) / kept.length : 0;
  const fromBytes = stableMs > 0 ? (stableBytes * 8) / (stableMs / 1000) / 1_000_000 : 0;
  return Math.max(0, Math.min(fromRates || fromBytes, fromBytes || fromRates));
}

function cap(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }

@Injectable({ providedIn: 'root' })
export class MeasurementService {
  /** Real byte counting from the Cloudflare edge with no-store responses and capped parallel streams. */
  async download(opts: ThroughputOptions): Promise<ThroughputResult> {
    const { url, durationMs, warmupMs, startedAt, signal, onSample } = opts;
    const w = createWindow();
    const warmupEnd = startedAt + warmupMs;
    const streams = cap(Math.round(opts.connections) || 4, 4, 6);
    const samples: SpeedSample[] = [];
    let interruptions = 0;
    let seq = 0;
    // Small response chunks keep each stream read below one browser task quanta.
    let chunk = 32 * 1024;
    const active = new Set<AbortController>();

    const sampler = setInterval(() => {
      const sample = sampleWindow(w, performance.now(), warmupEnd, 'download');
      if (sample) samples.push(sample), onSample(sample);
    }, SAMPLE_MS);

    const worker = async () => {
      while (!signal.aborted && performance.now() - startedAt < durationMs) {
        const ctrl = new AbortController();
        active.add(ctrl);
        const onAbort = () => ctrl.abort();
        signal.addEventListener('abort', onAbort, { once: true });
        try {
          const size = chunk;
          const res = await fetch(`${url}?bytes=${size}&n=${++seq}&r=${Math.random()}`, {
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
          if (signal.aborted || performance.now() - startedAt >= durationMs) {
            try { await reader.cancel(); } catch { /* stream already closed */ }
          }
          const elapsed = (performance.now() - startedAt) / 1000;
          if (elapsed > 0) {
            const perStream = w.stableBytes / Math.max(0.1, elapsed - warmupMs / 1000) / streams;
            chunk = Math.round(cap(perStream * 0.35, 16 * 1024, 128 * 1024) / 16384) * 16384;
          }
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
    const elapsed = performance.now() - startedAt;
    const stableMs = Math.max(0, elapsed - warmupMs);
    return {
      bytes: w.stableBytes, samples,
      durationMs: stableMs, interruptions,
      mbps: stableRate(w, w.stableBytes, stableMs),
    };
  }

  /** XHR upload progress plus the edge's acknowledged byte count — no fabricated throughput. */
  async upload(opts: ThroughputOptions & { payload: Blob }): Promise<ThroughputResult> {
    const { url, payload, durationMs, warmupMs, startedAt, signal, onSample } = opts;
    const w = createWindow();
    const warmupEnd = startedAt + warmupMs;
    const streams = cap(Math.round(opts.connections) || 4, 4, 6);
    const samples: SpeedSample[] = [];
    let interruptions = 0;
    let n = 0;
    let sentStable = 0;
    let acknowledgedStable = 0;
    const active = new Set<XMLHttpRequest>();

    const sampler = setInterval(() => {
      const sample = sampleWindow(w, performance.now(), warmupEnd, 'upload');
      if (sample) samples.push(sample), onSample(sample);
    }, SAMPLE_MS);

    const send = () => new Promise<void>(resolve => {
      const xhr = new XMLHttpRequest();
      active.add(xhr);
      let counted = 0;
      let phaseStart = 0;
      xhr.open('POST', `${url}?bytes=${payload.size}&n=${++n}`);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.setRequestHeader('Cache-Control', 'no-cache');
      xhr.upload.onprogress = e => {
        if (!e.lengthComputable) return;
        const now = performance.now();
        if (!phaseStart) phaseStart = now;
        const delta = Math.max(0, e.loaded - counted);
        counted = e.loaded;
        addBytes(w, delta, now, warmupEnd);
        if (now >= warmupEnd) sentStable += delta;
      };
      const finish = () => {
        active.delete(xhr);
        if (xhr.status >= 200 && xhr.status < 300) {
          // The edge acknowledges the exact byte count in the JSON body; no custom
          // response header is read, so browsers never log unsafe-header warnings.
          try {
            const received = Number((JSON.parse(xhr.responseText || '{}') as { received?: number }).received);
            if (Number.isFinite(received)) acknowledgedStable += cap(received, 0, payload.size);
          } catch { /* acknowledgement is optional; XHR upload progress remains authoritative */ }
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
    const elapsed = performance.now() - startedAt;
    const stableMs = Math.max(0, elapsed - warmupMs);
    const ratio = sentStable > 0 ? cap(acknowledgedStable / sentStable, 0, 1) : 0;
    const measuredBytes = Math.round(w.stableBytes * ratio);
    const adjusted = samples.map(s => ({ ...s, mbps: +(s.mbps * ratio).toFixed(2) }));
    return {
      bytes: measuredBytes, samples: adjusted, durationMs: stableMs, interruptions,
      mbps: stableRate(w, w.stableBytes * ratio, stableMs),
    };
  }

  /** Client-side RTT samples against a real edge endpoint. */
  async ping(url: string, count: number, signal: AbortSignal, _kind?: string): Promise<number[]> {
    const values: number[] = [];
    for (let i = 0; i < count; i++) {
      if (signal.aborted) break;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3000);
      const combined = typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, ctrl.signal]) : signal;
      const t0 = performance.now();
      try {
        const res = await fetch(`${url}?bytes=256&r=${i}&t=${Date.now()}`, {
          cache: 'no-store', signal: combined, headers: { 'Cache-Control': 'no-cache' },
        });
        if (!res.ok) continue;
        await res.arrayBuffer();
        values.push(+(performance.now() - t0).toFixed(1));
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
      const timer = setTimeout(() => ctrl.abort(), 2000);
      try {
        const res = await fetch(`${url}?bytes=256&probe=${i}&t=${Date.now()}`, { cache: 'no-store', signal: ctrl.signal });
        if (!res.ok) lost++; else await res.arrayBuffer();
      } catch { lost++; }
      finally { clearTimeout(timer); signal.removeEventListener('abort', onAbort); }
    }
    return { sent, lost, method: 'HTTP/HTTPS sequenced probes (application-layer approximation, not ICMP)' };
  }

  /** Real Cloudflare metadata exposed on the no-store measurement response. */
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
