import { Injectable } from '@angular/core';
import { LatencyStats, SpeedSample } from '../models/models';

export interface ThroughputResult {
  bytes: number;
  samples: SpeedSample[];
  durationMs: number;
  interruptions: number;
}

const SAMPLE_MS = 250;

@Injectable({ providedIn: 'root' })
export class MeasurementService {
  /** Real byte counting from a no-cache streaming endpoint; parallel adaptive connections. */
  async download(opts: {
    url: string; sessionId: string; connections: number; durationMs: number; chunkBytes: number;
    signal: AbortSignal; onSample: (sample: SpeedSample) => void;
  }): Promise<ThroughputResult> {
    const { url, sessionId, connections, durationMs, signal } = opts;
    const started = performance.now();
    let bytes = 0;
    let interruptions = 0;
    const samples: SpeedSample[] = [];
    let lastBytes = 0;
    let lastAt = started;

    const sampler = window.setInterval(() => {
      const now = performance.now();
      const dt = (now - lastAt) / 1000;
      if (dt <= 0) return;
      const mbps = ((bytes - lastBytes) * 8) / dt / 1_000_000;
      const sample = { t: Math.round(now - started), mbps: Math.max(0, mbps) };
      samples.push(sample);
      lastBytes = bytes; lastAt = now;
      opts.onSample(sample);
    }, SAMPLE_MS);

    let seq = 0;
    const active = new Set<AbortController>();
    const worker = async () => {
      let size = opts.chunkBytes;
      while (!signal.aborted && performance.now() - started < durationMs) {
        const ctrl = new AbortController();
        active.add(ctrl);
        const onAbort = () => ctrl.abort();
        signal.addEventListener('abort', onAbort, { once: true });
        try {
          const res = await fetch(`${url}?session=${encodeURIComponent(sessionId)}&size=${size}&n=${++seq}&r=${Math.random()}`, {
            cache: 'no-store', signal: ctrl.signal,
            headers: { 'Cache-Control': 'no-cache, no-transform', Accept: 'application/octet-stream' },
          });
          if (!res.ok || !res.body) throw new Error(`Download endpoint returned ${res.status}`);
          const reader = res.body.getReader();
          while (!signal.aborted) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (performance.now() - started >= durationMs) {
              try { await reader.cancel(); } catch { /* ignore */ }
              ctrl.abort();
              break;
            }
          }
          // Adapt chunk size to keep each connection busy without excessive requests.
          const elapsed = (performance.now() - started) / 1000;
          const perConn = elapsed > 0 ? bytes / elapsed / connections : 0;
          size = Math.min(32 * 1024 * 1024, Math.max(opts.chunkBytes, Math.round(perConn * 0.6 / 262144) * 262144));
        } catch (e) {
          if (!signal.aborted) interruptions++;
        } finally {
          signal.removeEventListener('abort', onAbort);
          active.delete(ctrl);
          ctrl.abort();
        }
      }
    };

    try {
      await Promise.all(Array.from({ length: Math.max(1, connections) }, () => worker()));
    } finally {
      window.clearInterval(sampler);
      for (const c of active) c.abort();
    }
    const duration = performance.now() - started;
    return { bytes, samples, durationMs: duration, interruptions };
  }

  /** XHR is used for uploads because fetch has no upload progress events. Bytes are only counted as delivered when the server confirms them. */
  async upload(opts: {
    url: string; sessionId: string; payload: Blob; connections: number; durationMs: number;
    signal: AbortSignal; onSample: (sample: SpeedSample) => void;
  }): Promise<ThroughputResult> {
    const { url, sessionId, connections, durationMs, signal, payload } = opts;
    const started = performance.now();
    let sentBytes = 0;
    let confirmedBytes = 0;
    let interruptions = 0;
    const samples: SpeedSample[] = [];
    let lastBytes = 0, lastAt = started;

    const sampler = window.setInterval(() => {
      const now = performance.now();
      const dt = (now - lastAt) / 1000;
      if (dt <= 0) return;
      const mbps = ((sentBytes - lastBytes) * 8) / dt / 1_000_000;
      const sample = { t: Math.round(now - started), mbps: Math.max(0, mbps) };
      samples.push(sample); lastBytes = sentBytes; lastAt = now;
      opts.onSample(sample);
    }, SAMPLE_MS);

    let n = 0;
    const active = new Set<XMLHttpRequest>();
    const send = () => new Promise<void>(resolve => {
      const xhr = new XMLHttpRequest();
      active.add(xhr);
      let counted = 0;
      xhr.open('POST', `${url}?session=${encodeURIComponent(sessionId)}&n=${++n}`);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.setRequestHeader('Cache-Control', 'no-cache');
      xhr.upload.onprogress = e => {
        if (e.lengthComputable) sentBytes += Math.max(0, e.loaded - counted);
        counted = e.loaded;
      };
      const finish = () => {
        active.delete(xhr);
        if (xhr.status >= 200 && xhr.status < 300) {
          // Trust the server's acknowledgement, not the browser's upload-progress estimate.
          let acknowledged = payload.size;
          try {
            const response = JSON.parse(xhr.responseText ?? '') as { received?: number };
            if (Number.isFinite(response.received)) acknowledged = Math.max(0, Math.min(payload.size, Number(response.received)));
          } catch { /* older nodes return an empty body */ }
          confirmedBytes += acknowledged;
        } else if (!signal.aborted) interruptions++;
        resolve();
      };
      xhr.onload = finish; xhr.onerror = finish; xhr.onabort = () => { active.delete(xhr); resolve(); };
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
      xhr.send(payload);
    });

    const workers = Array.from({ length: Math.max(1, connections) }, async () => {
      while (!signal.aborted && performance.now() - started < durationMs) await send();
    });
    try {
      await Promise.all(workers);
    } finally {
      window.clearInterval(sampler);
      signal.aborted && active.forEach(x => x.abort());
    }
    const duration = performance.now() - started;
    // Final result is based on bytes the server acknowledged, not bytes merely sent.
    const ratio = sentBytes > 0 ? Math.min(1, confirmedBytes / sentBytes) : 0;
    const finalSamples = samples.map(s => ({ ...s, mbps: s.mbps * ratio }));
    return { bytes: confirmedBytes, samples: finalSamples, durationMs: duration, interruptions };
  }

  /** Sequential HTTP timing samples. RTT is measured client-side; no fabricated values. */
  async ping(url: string, count: number, signal: AbortSignal, label = 'ping'): Promise<number[]> {
    const values: number[] = [];
    for (let i = 0; i < count; i++) {
      if (signal.aborted) break;
      const ctrl = new AbortController();
      const combined = typeof AbortSignal.any === 'function'
        ? AbortSignal.any([signal, ctrl.signal])
        : signal;
      const timer = window.setTimeout(() => ctrl.abort(), 3000);
      const t0 = performance.now();
      try {
        const res = await fetch(`${url}?kind=${label}&seq=${i}&t=${Date.now()}`, {
          cache: 'no-store', signal: combined,
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (!res.ok) continue;
        await res.arrayBuffer();
        values.push(performance.now() - t0);
      } catch { if (signal.aborted) break; }
      finally {
        window.clearTimeout(timer);
      }
    }
    return values;
  }

  /** HTTP probe loss: counts failed/timed-out application-layer probes. Not ICMP packet loss. */
  async probeLoss(url: string, count: number, signal: AbortSignal): Promise<{ sent: number; lost: number; method: string }> {
    let lost = 0, sent = 0;
    for (let i = 0; i < count; i++) {
      if (signal.aborted) break;
      sent++;
      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), 2000);
      const onAbort = () => ctrl.abort();
      signal.addEventListener('abort', onAbort, { once: true });
      try {
        const res = await fetch(`${url}?kind=probe&seq=${i}&t=${Date.now()}`, { cache: 'no-store', signal: ctrl.signal });
        if (!res.ok) lost++; else await res.arrayBuffer();
      } catch { lost++; }
      finally { window.clearTimeout(timer); signal.removeEventListener('abort', onAbort); }
    }
    return { sent, lost, method: 'HTTP/HTTPS sequenced probes (application-layer approximation, not ICMP)' };
  }

  static stats(values: number[]): Pick<LatencyStats, 'min' | 'max' | 'avg' | 'median' | 'jitter' | 'samples'> {
    // Keep measurement order: jitter is the mean variation between consecutive RTTs.
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
      median: +(sorted[Math.floor(sorted.length / 2)]).toFixed(1),
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
