export interface MeasurementsForScore {
  downloadMbps: number | null;
  uploadMbps: number | null;
  latency: { avg: number | null; jitter: number | null; packetLossPct: number | null; loadedDownload: number | null; loadedUpload: number | null };
  stability: { deviationPct: number | null };
}

const logScore = (v: number | null, ref: number) => v && v > 0 ? clamp(Math.round(Math.log10(1 + v) / Math.log10(1 + ref) * 100)) : 0;
const inverse = (v: number | null, best: number, worst: number) => v === null || !Number.isFinite(v) ? 50 : clamp(Math.round(100 - ((v - best) / (worst - best)) * 100));
const clamp = (n: number) => Math.max(0, Math.min(100, n));

export function computeScore(m: MeasurementsForScore) {
  const loaded = Math.max(m.latency.loadedDownload ?? m.latency.avg ?? 0, m.latency.loadedUpload ?? m.latency.avg ?? 0) || null;
  const grades = {
    download: logScore(m.downloadMbps, 500),
    upload: logScore(m.uploadMbps, 150),
    idleLatency: inverse(m.latency.avg, 10, 200),
    loadedLatency: inverse(loaded, 20, 300),
    jitter: inverse(m.latency.jitter, 2, 100),
    packetLoss: inverse(m.latency.packetLossPct, 0, 8),
    stability: m.stability.deviationPct === null ? 60 : inverse(m.stability.deviationPct, 2, 60),
  };
  const weights: Record<string, number> = { download: .22, upload: .14, idleLatency: .16, loadedLatency: .14, jitter: .09, packetLoss: .13, stability: .12 };
  const overall = Math.round(Object.entries(weights).reduce((sum, [k, w]) => sum + grades[k as keyof typeof grades] * w, 0));
  return {
    overall,
    grades,
    label: overall >= 88 ? 'Excellent' : overall >= 74 ? 'Very good' : overall >= 58 ? 'Good' : overall >= 40 ? 'Fair' : 'Poor',
    methodology: 'Netvelox Quality Score: weighted combination of measured download (22%), upload (14%), idle latency (16%), loaded latency (14%), jitter (9%), HTTP probe loss (13%) and stability (12%). Logarithmic scaling for throughput; linear inverse scaling for latency-like metrics. Transparent heuristic, not an industry certification.',
  };
}
