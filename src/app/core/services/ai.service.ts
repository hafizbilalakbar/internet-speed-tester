import { Injectable, inject } from '@angular/core';
import { AiAnalysis, TestMeasurements, TestingServer } from '../models/models';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class AiService {
  private api = inject(ApiService);

  async analyze(m: TestMeasurements, server: TestingServer): Promise<AiAnalysis> {
    try {
      const result = await firstValue(this.api.post<AiAnalysis>('/ai/analyze', { measurements: m, server }));
      return result;
    } catch {
      // Fully functional local rule engine when the AI service is unreachable.
      return this.local(m, server);
    }
  }

  private local(m: TestMeasurements, server: TestingServer): AiAnalysis {
    const d = m.downloadMbps ?? 0, u = m.uploadMbps ?? 0;
    const p = m.latency.avg, j = m.latency.jitter, loss = m.latency.packetLossPct;
    const loaded = Math.max(m.latency.loadedDownload ?? 0, m.latency.loadedUpload ?? 0);
    const insights: AiAnalysis['insights'] = [];
    insights.push({ category: 'download', level: d >= 50 ? 'success' : d >= 20 ? 'info' : 'warning', title: 'Download performance', text: d >= 50 ? `Your ${d.toFixed(1)} Mbps download handles 4K streaming and large downloads comfortably.` : d >= 20 ? `Your ${d.toFixed(1)} Mbps download is suitable for everyday browsing and HD streaming.` : `Your ${d.toFixed(1)} Mbps download may feel slow for multiple simultaneous users or 4K video.` });
    insights.push({ category: 'upload', level: u >= 15 ? 'success' : u >= 5 ? 'info' : 'warning', title: 'Upload performance', text: u >= 15 ? `An upload of ${u.toFixed(1)} Mbps supports high-quality video calls and cloud backups.` : `An upload of ${u.toFixed(1)} Mbps may affect large uploads and high-quality video calls.` });
    if (p !== null) insights.push({ category: 'latency', level: p <= 30 ? 'success' : p <= 70 ? 'info' : 'warning', title: 'Latency', text: p <= 30 ? `${p} ms idle latency is good for responsive browsing and gaming.` : `${p} ms idle latency is relatively high for competitive gaming.` });
    if (j !== null) insights.push({ category: 'jitter', level: j <= 10 ? 'success' : 'warning', title: 'Jitter', text: j <= 10 ? `${j} ms jitter indicates a stable connection.` : `${j} ms jitter indicates possible connection instability during calls.` });
    if (p !== null && loaded > p * 1.8) insights.push({ category: 'bufferbloat', level: 'warning', title: 'Bufferbloat detected', text: `Latency rose from ${p} ms idle to ${loaded.toFixed(0)} ms under load, which can cause lag while downloads run.` });
    if (loss !== null && loss > 1) insights.push({ category: 'loss', level: 'critical', title: 'Probe loss', text: `${loss.toFixed(1)}% of HTTP probes failed. Investigate Wi‑Fi signal, cabling or ISP stability.` });
    insights.push({ category: 'server', level: 'info', title: 'Test server', text: `Measurements were taken against ${server.name} in ${server.city}, ${server.country}.` });

    const grade = (v: number) => v >= 85 ? 'Excellent' : v >= 70 ? 'Good' : v >= 50 ? 'Fair' : 'Poor';
    const gameScore = Math.round(Math.max(0, 100 - (p ?? 150) * 1.1 - (j ?? 30) * 1.4 - (loss ?? 0) * 8));
    const confScore = Math.round(Math.min(100, u * 6 + Math.max(0, 70 - (j ?? 40)) * .5));
    const streamScore = Math.round(Math.min(100, d * 2.4));
    return {
      summary: `Measured ${d.toFixed(1)} Mbps down, ${u.toFixed(1)} Mbps up and ${p ?? 'n/a'} ms latency against ${server.name}. ${m.stability.rating === 'excellent' || m.stability.rating === 'good' ? 'The connection was stable during testing.' : 'Speed varied noticeably during testing.'}`,
      insights,
      gaming: { score: Math.max(0, Math.min(100, gameScore)), label: grade(gameScore), note: (p ?? 999) <= 40 ? 'Suitable for competitive gaming.' : 'Higher latency may affect competitive play.' },
      conferencing: { score: Math.max(0, Math.min(100, confScore)), label: grade(confScore), note: u >= 5 ? 'Suitable for video conferencing.' : 'Upload and jitter may reduce call quality.' },
      streaming: { score: Math.max(0, Math.min(100, streamScore)), label: grade(streamScore), note: d >= 25 ? 'Suitable for 4K streaming.' : d >= 5 ? 'Suitable for HD streaming.' : 'May buffer at higher resolutions.' },
      bottleneck: p !== null && p > 70 ? 'Likely high latency on the ISP or peering path.' : d < 20 && u < 10 ? 'Possible access-network or Wi‑Fi limitation.' : m.stability.deviationPct && m.stability.deviationPct > 30 ? 'Connection stability is the main limiting factor.' : 'No single dominant bottleneck identified from these metrics.',
      recommendations: [
        d < 50 ? 'Place the router centrally, away from thick walls and metal objects.' : 'Keep router firmware updated for best performance.',
        j !== null && j > 15 ? 'Prefer 5 GHz or wired Ethernet if Wi‑Fi jitter is high.' : 'Use wired Ethernet for latency-sensitive devices where practical.',
        loss !== null && loss > 1 ? 'Contact your ISP with this result if probe loss persists across tests.' : 'Re-run the test at different times to establish a baseline.',
      ],
      provider: 'rule-based', generatedAt: new Date().toISOString(),
    };
  }
}

import { firstValueFrom } from 'rxjs';
function firstValue<T>(o: import('rxjs').Observable<T>): Promise<T> { return firstValueFrom(o); }
