import { config } from '../config.js';
import { MeasurementsForScore } from './scoring.js';

type Level = 'info' | 'warning' | 'critical' | 'success';

function ruleBased(m: MeasurementsForScore, serverName: string) {
  const d = m.downloadMbps ?? 0, u = m.uploadMbps ?? 0;
  const p = m.latency.avg, j = m.latency.jitter, loss = m.latency.packetLossPct;
  const loaded = Math.max(m.latency.loadedDownload ?? 0, m.latency.loadedUpload ?? 0);
  const insights: { category: string; level: Level; title: string; text: string }[] = [
    { category: 'download', level: d >= 50 ? 'success' : d >= 20 ? 'info' : 'warning', title: 'Download performance', text: d >= 50 ? `Your ${d.toFixed(1)} Mbps download handles 4K streaming and large downloads comfortably.` : d >= 20 ? `Your ${d.toFixed(1)} Mbps download suits everyday browsing and HD streaming.` : `Your ${d.toFixed(1)} Mbps download may feel slow for multiple users or 4K video.` },
    { category: 'upload', level: u >= 15 ? 'success' : u >= 5 ? 'info' : 'warning', title: 'Upload performance', text: u >= 15 ? `${u.toFixed(1)} Mbps upload supports high-quality video calls and cloud backups.` : `${u.toFixed(1)} Mbps upload may affect large uploads and video calls.` },
  ];
  if (p !== null) insights.push({ category: 'latency', level: p <= 30 ? 'success' : p <= 70 ? 'info' : 'warning', title: 'Latency', text: p <= 30 ? `${p} ms idle latency is good for responsive browsing and gaming.` : `${p} ms idle latency is relatively high for competitive gaming.` });
  if (j !== null) insights.push({ category: 'jitter', level: j <= 10 ? 'success' : 'warning', title: 'Jitter', text: j <= 10 ? `${j} ms jitter indicates a stable connection.` : `${j} ms jitter indicates possible instability during calls.` });
  if (p !== null && loaded > p * 1.8) insights.push({ category: 'bufferbloat', level: 'warning', title: 'Bufferbloat detected', text: `Latency rose from ${p} ms idle to ${loaded.toFixed(0)} ms under load; downloads can cause lag.` });
  if (loss !== null && loss > 1) insights.push({ category: 'loss', level: 'critical', title: 'Probe loss', text: `${loss.toFixed(1)}% of HTTP probes failed. Check Wi-Fi signal, cabling or ISP stability.` });
  insights.push({ category: 'server', level: 'info', title: 'Test server', text: `Measurements were taken against ${serverName}.` });

  const grade = (n: number) => n >= 85 ? 'Excellent' : n >= 70 ? 'Good' : n >= 50 ? 'Fair' : 'Poor';
  const game = clamp(Math.round(100 - (p ?? 150) * 1.1 - (j ?? 30) * 1.4 - (loss ?? 0) * 8));
  const conf = clamp(Math.round(Math.min(100, u * 6 + Math.max(0, 70 - (j ?? 40)) * .5)));
  const stream = clamp(Math.round(Math.min(100, d * 2.4)));
  return {
    summary: `Measured ${d.toFixed(1)} Mbps down, ${u.toFixed(1)} Mbps up and ${p ?? 'n/a'} ms latency against ${serverName}.`,
    insights,
    gaming: { score: game, label: grade(game), note: (p ?? 999) <= 40 ? 'Suitable for competitive gaming.' : 'Higher latency may affect competitive play.' },
    conferencing: { score: conf, label: grade(conf), note: u >= 5 ? 'Suitable for video conferencing.' : 'Upload and jitter may reduce call quality.' },
    streaming: { score: stream, label: grade(stream), note: d >= 25 ? 'Suitable for 4K streaming.' : d >= 5 ? 'Suitable for HD streaming.' : 'May buffer at higher resolutions.' },
    bottleneck: p !== null && p > 70 ? 'Likely high latency on the ISP or peering path.' : d < 20 && u < 10 ? 'Possible access-network or Wi-Fi limitation.' : 'No single dominant bottleneck identified from these metrics.',
    recommendations: [
      d < 50 ? 'Place the router centrally, away from thick walls and metal objects.' : 'Keep router firmware updated for best performance.',
      j !== null && j > 15 ? 'Prefer 5 GHz or wired Ethernet if Wi-Fi jitter is high.' : 'Use wired Ethernet for latency-sensitive devices where practical.',
      loss !== null && loss > 1 ? 'Contact your ISP with this result if probe loss persists.' : 'Re-run the test at different times to establish a baseline.',
    ],
    provider: 'rule-based' as 'rule-based' | 'ai',
    generatedAt: new Date().toISOString(),
  };
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));

export async function analyze(m: MeasurementsForScore, serverName: string): Promise<ReturnType<typeof ruleBased>> {
  const fallback = ruleBased(m, serverName);
  if (config.ai.provider === 'rule-based' || !config.ai.apiKey) return fallback;
  try {
    const facts = {
      downloadMbps: m.downloadMbps, uploadMbps: m.uploadMbps,
      idleLatencyMs: m.latency.avg, jitterMs: m.latency.jitter,
      probeLossPct: m.latency.packetLossPct,
      loadedDownloadMs: m.latency.loadedDownload, loadedUploadMs: m.latency.loadedUpload,
      stabilityDeviationPct: m.stability.deviationPct, server: serverName,
      score: fallback,
    };
    const res = await fetch(`${config.ai.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.ai.apiKey}` },
      body: JSON.stringify({
        model: config.ai.model, temperature: 0.2, response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are a network analysis assistant. Return ONLY JSON matching the provided score object shape, with keys summary, insights, gaming, conferencing, streaming, bottleneck, recommendations. Never invent, estimate or modify any measurement value. Use only the supplied facts. Keep text concise.' },
          { role: 'user', content: JSON.stringify(facts) },
        ],
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return fallback;
    const body = await res.json() as { choices?: { message?: { content?: string } }[] };
    const parsed = JSON.parse(body.choices?.[0]?.message?.content ?? '{}') as Record<string, unknown>;
    if (typeof parsed.summary !== 'string' || !Array.isArray(parsed.insights) || !Array.isArray(parsed.recommendations)) return fallback;
    return {
      ...fallback,
      summary: String(parsed.summary).slice(0, 800),
      insights: (parsed.insights as any[]).slice(0, 10).map(i => ({
        category: String(i.category ?? 'general'),
        level: ['info', 'warning', 'critical', 'success'].includes(i.level) ? i.level : 'info',
        title: String(i.title ?? 'Insight').slice(0, 120),
        text: String(i.text ?? '').slice(0, 600),
      })),
      recommendations: (parsed.recommendations as unknown[]).slice(0, 8).map(r => String(r).slice(0, 300)),
      bottleneck: String(parsed.bottleneck ?? fallback.bottleneck).slice(0, 300),
      gaming: validGrade(parsed.gaming, fallback.gaming),
      conferencing: validGrade(parsed.conferencing, fallback.conferencing),
      streaming: validGrade(parsed.streaming, fallback.streaming),
      provider: 'ai',
      generatedAt: new Date().toISOString(),
    };
  } catch { return fallback; }
}

function validGrade(v: unknown, fallback: { score: number; label: string; note: string }) {
  if (!v || typeof v !== 'object') return fallback;
  const g = v as Record<string, unknown>;
  return {
    score: typeof g.score === 'number' && g.score >= 0 && g.score <= 100 ? Math.round(g.score) : fallback.score,
    label: String(g.label ?? fallback.label).slice(0, 40),
    note: String(g.note ?? fallback.note).slice(0, 300),
  };
}
