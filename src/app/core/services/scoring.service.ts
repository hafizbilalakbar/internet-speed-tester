import { Injectable } from '@angular/core';
import { QualityLevel, TestMeasurements, QualityScore } from '../models/models';

@Injectable({ providedIn: 'root' })
export class ScoringService {
  /** Transparent, configurable thresholds. Not an industry-certified standard. */
  readonly thresholds = {
    downloadMbps: { excellent: 100, good: 50, moderate: 20, poor: 5 },
    uploadMbps: { excellent: 30, good: 15, moderate: 5, poor: 2 },
    idleMs: { excellent: 15, good: 35, moderate: 70, poor: 150 },
    loadedMs: { excellent: 25, good: 60, moderate: 120, poor: 250 },
    jitterMs: { excellent: 5, good: 15, moderate: 30, poor: 60 },
    lossPct: { excellent: 0, good: 0.5, moderate: 2, poor: 5 },
  } as const;

  level(metric: 'downloadMbps' | 'uploadMbps' | 'idleMs' | 'loadedMs' | 'jitterMs' | 'lossPct', value: number | null): QualityLevel {
    if (value === null || !Number.isFinite(value)) return 'unknown';
    const t = this.thresholds[metric];
    if (metric === 'downloadMbps' || metric === 'uploadMbps') {
      if (value >= t.excellent) return 'excellent';
      if (value >= t.good) return 'good';
      if (value >= t.moderate) return 'moderate';
      if (value >= t.poor) return 'poor';
      return 'critical';
    }
    if (value <= t.excellent) return 'excellent';
    if (value <= t.good) return 'good';
    if (value <= t.moderate) return 'moderate';
    if (value <= t.poor) return 'poor';
    return 'critical';
  }

  score(m: TestMeasurements): QualityScore {
    const d = m.downloadMbps;
    const u = m.uploadMbps;
    const ping = m.latency.avg;
    const loaded = Math.max(m.latency.loadedDownload ?? ping ?? 0, m.latency.loadedUpload ?? ping ?? 0) || null;
    const jitter = m.latency.jitter;
    const loss = m.latency.packetLossPct;

    const grades: Record<string, number> = {
      download: this.logScore(d, 500),
      upload: this.logScore(u, 150),
      idleLatency: this.inverseScore(ping, 10, 200),
      loadedLatency: this.inverseScore(loaded, 20, 300),
      jitter: this.inverseScore(jitter, 2, 100),
      packetLoss: this.inverseScore(loss, 0, 8),
      stability: m.stability.deviationPct === null ? 60 : this.inverseScore(m.stability.deviationPct, 2, 60),
    };
    const weights: Record<string, number> = { download: .22, upload: .14, idleLatency: .16, loadedLatency: .14, jitter: .09, packetLoss: .13, stability: .12 };
    const overall = Math.round(Object.entries(weights).reduce((sum, [k, w]) => sum + (grades[k] ?? 0) * w, 0));
    const label = overall >= 88 ? 'Excellent' : overall >= 74 ? 'Very good' : overall >= 58 ? 'Good' : overall >= 40 ? 'Fair' : 'Poor';
    return {
      overall, grades, label,
      methodology: 'Netvelox Quality Score: weighted combination of measured download (22%), upload (14%), idle latency (16%), loaded latency (14%), jitter (9%), HTTP probe loss (13%) and stability (12%). Logarithmic scaling for throughput; linear inverse scaling for latency-like metrics. This is a transparent Netvelox heuristic, not an industry certification.',
    };
  }

  suitability(score: QualityScore, m: TestMeasurements): Record<string, number> {
    const d = m.downloadMbps ?? 0, u = m.uploadMbps ?? 0;
    const p = m.latency.avg ?? 200, j = m.latency.jitter ?? 100, l = m.latency.packetLossPct ?? 10;
    const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
    return {
      browsing: clamp(score.grades['download'] * .5 + score.grades['idleLatency'] * .3 + score.grades['packetLoss'] * .2),
      gaming: clamp(score.grades['idleLatency'] * .4 + this.inverseScore(j, 3, 50) * .3 + this.inverseScore(l, 0, 3) * .3 - (p > 60 ? 12 : 0)),
      conferencing: clamp(score.grades['upload'] * .35 + this.inverseScore(j, 5, 45) * .3 + score.grades['loadedLatency'] * .2 + this.inverseScore(l, 0, 3) * .15),
      hdStreaming: clamp(Math.min(100, d / 8 * 100) * .55 + score.grades['stability'] * .3 + score.grades['packetLoss'] * .15),
      uhdStreaming: clamp(Math.min(100, d / 30 * 100) * .6 + score.grades['stability'] * .25 + score.grades['packetLoss'] * .15),
      fileTransfer: clamp(score.grades['download'] * .65 + score.grades['upload'] * .35),
    };
  }

  private logScore(v: number | null, reference: number): number {
    if (v === null || v <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((Math.log10(1 + v) / Math.log10(1 + reference)) * 100)));
  }
  private inverseScore(v: number | null, best: number, worst: number): number {
    if (v === null || !Number.isFinite(v)) return 50;
    return Math.max(0, Math.min(100, Math.round(100 - ((v - best) / (worst - best)) * 100)));
  }
}
