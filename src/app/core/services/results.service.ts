import { Injectable, inject, signal } from '@angular/core';
import { TestResult } from '../models/models';
import { ApiService } from './api.service';
import { AppConfigService } from './app-config.service';

const KEY = 'nv-test-history';

@Injectable({ providedIn: 'root' })
export class ResultsService {
  private api = inject(ApiService);
  private config = inject(AppConfigService);
  readonly history = signal<TestResult[]>(this.read());

  private persistence: boolean | undefined;
  private persistenceCheckedAt = 0;

  saveLocal(result: TestResult): void {
    const next = [result, ...this.history().filter(r => r.id !== result.id)].slice(0, 60);
    this.history.set(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage full or blocked */ }
  }

  removeLocal(id: string): void {
    const next = this.history().filter(r => r.id !== id);
    this.history.set(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }

  private async canPersist(): Promise<boolean> {
    const now = Date.now();
    const ttl = this.persistence ? 60_000 : 15_000;
    if (this.persistence !== undefined && now - this.persistenceCheckedAt < ttl) return this.persistence;
    try {
      const health = await firstValue(this.api.get<{ persistence?: boolean }>('/health'));
      this.persistence = health.persistence !== false;
    } catch {
      this.persistence = false;
    }
    this.persistenceCheckedAt = Date.now();
    return this.persistence;
  }

  async persist(result: TestResult): Promise<TestResult> {
    if (!(await this.canPersist())) {
      this.saveLocal(result);
      return result;
    }
    try {
      const saved = await firstValue(this.api.post<TestResult>('/results', result));
      this.saveLocal(saved);
      return saved;
    } catch {
      this.persistence = false;
      this.persistenceCheckedAt = Date.now();
      this.saveLocal(result);
      return result;
    }
  }

  get(id: string, ownerToken?: string | null): Promise<TestResult> {
    return firstValue(this.api.get<TestResult>(`/results/${encodeURIComponent(id)}`, undefined, ownerToken ? { 'X-Result-Token': ownerToken } : undefined));
  }

  getShared(token: string): Promise<TestResult> { return firstValue(this.api.get<TestResult>(`/share/${encodeURIComponent(token)}`)); }
  stats(): Promise<unknown> { return firstValue(this.api.get('/stats/global')); }

  /** Creates a private share token for an owned local result when persistence is available. */
  async ensureShareToken(result: TestResult): Promise<TestResult> {
    if (result.shareToken || !result.ownerToken) return result;
    try {
      const share = this.permitted(result);
      const res = await firstValue(this.api.put<{ shareToken: string }>(
        `/results/${encodeURIComponent(result.id)}/share`, share, { 'X-Result-Token': result.ownerToken },
      ));
      const updated: TestResult = { ...result, shareToken: res.shareToken, share };
      this.saveLocal(updated);
      return updated;
    } catch { return result; }
  }

  shareUrl(result: TestResult): string {
    return result.shareToken ? `${this.config.siteUrl}/result/${result.shareToken}` : `${this.config.siteUrl}/r/${result.id}`;
  }

  exportCsv(result: TestResult): void {
    const permitted = this.permitted(result);
    const rows: [string, string | number | null][] = [
      ['result_id', result.id], ['date', result.createdAt], ['server', result.server.name],
      ['server_location', `${result.server.city}, ${result.server.country}`],
      ['download_mbps', result.measurements.downloadMbps], ['upload_mbps', result.measurements.uploadMbps],
      ['ping_avg_ms', result.measurements.latency.avg], ['ping_min_ms', result.measurements.latency.min],
      ['ping_max_ms', result.measurements.latency.max], ['jitter_ms', result.measurements.latency.jitter],
      ['probe_loss_pct', result.measurements.latency.packetLossPct],
      ['loaded_download_ms', result.measurements.latency.loadedDownload],
      ['loaded_upload_ms', result.measurements.latency.loadedUpload],
      ['stability', result.measurements.stability.rating],
      ['stability_deviation_pct', result.measurements.stability.deviationPct],
      ['quality_score', result.score.overall], ['connections', result.measurements.connections],
      ['bytes_downloaded', result.measurements.bytesDownloaded], ['bytes_uploaded', result.measurements.bytesUploaded],
      ['analysis_provider', result.analysis.provider],
      ['isp', permitted.isp ? result.network.ipv4.isp : null],
      ['public_ip', permitted.ip ? result.network.ipv4.ip : null],
    ];
    const csv = rows.map(([k, v]) => `${k},"${String(v ?? '').replace(/"/g, '""')}"`).join('\r\n');
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `netvelox-${result.id}.csv`);
  }

  async exportPdf(result: TestResult): Promise<void> {
    const { jsPDF } = await import('jspdf');
    const permitted = this.permitted(result);
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const m = result.measurements;
    doc.setFillColor(8, 16, 31); doc.rect(0, 0, 210, 38, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(22);
    doc.text('Netvelox', 18, 20);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.text('Internet Speed Test Report', 18, 28);
    doc.setTextColor(20, 30, 50); doc.setFontSize(11);
    doc.text(`Result ID: ${result.id}`, 18, 50);
    doc.text(`Date: ${new Date(result.createdAt).toLocaleString()}`, 18, 57);
    doc.text(`Server: ${result.server.name} - ${result.server.city}, ${result.server.country}`, 18, 64);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
    doc.text(`${(m.downloadMbps ?? 0).toFixed(2)} Mbps`, 18, 84);
    doc.text(`${(m.uploadMbps ?? 0).toFixed(2)} Mbps`, 78, 84);
    doc.text(`${m.latency.avg ?? '-'} ms`, 138, 84);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text('DOWNLOAD', 18, 90); doc.text('UPLOAD', 78, 90); doc.text('PING', 138, 90);
    doc.setDrawColor(210, 218, 232); doc.line(18, 98, 192, 98);
    const lines = [
      `Jitter: ${m.latency.jitter ?? '-'} ms    Probe loss: ${m.latency.packetLossPct ?? '-'} %    Quality score: ${result.score.overall}/100`,
      `Idle latency: ${m.latency.avg ?? '-'} ms    Loaded (download): ${m.latency.loadedDownload ?? '-'} ms    Loaded (upload): ${m.latency.loadedUpload ?? '-'} ms`,
      `Connection mode: ${m.connections > 1 ? 'Multi-connection' : 'Single connection'}    Stability: ${m.stability.rating} (${m.stability.deviationPct ?? '-'}% variation)`,
      `ISP: ${permitted.isp ? (result.network.ipv4.isp ?? 'not available') : 'hidden'}    IP: ${permitted.ip ? (result.network.ipv4.ip ?? 'not available') : 'hidden'}`,
      `Bottleneck: ${result.analysis.bottleneck}`,
      `Method: real byte transfer over configured test servers; HTTP probe loss is an application-layer approximation.`,
    ];
    lines.forEach((l, i) => doc.text(l, 18, 108 + i * 8));
    doc.setFont('helvetica', 'bold'); doc.text(`ANALYSIS (${result.analysis.provider})`, 18, 158);
    doc.setFont('helvetica', 'normal');
    const analysisLines = doc.splitTextToSize(result.analysis.summary, 172) as string[];
    analysisLines.slice(0, 8).forEach((l: string, i: number) => doc.text(l, 18, 166 + i * 6));
    doc.setFontSize(8); doc.setTextColor(100, 110, 130);
    doc.text('Netvelox Quality Score is a transparent heuristic and not an industry certification.', 18, 282);
    doc.save(`netvelox-${result.id}.pdf`);
  }

  private permitted(result: TestResult): { ip: boolean; isp: boolean; location: boolean } {
    return {
      ip: !!result.share?.ip,
      isp: !!result.share?.isp,
      location: !!result.share?.location,
    };
  }

  private read(): TestResult[] {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]') as TestResult[];
      return Array.isArray(parsed) ? parsed.filter(r => r && typeof r.id === 'string' && r.measurements && r.score) : [];
    } catch { return []; }
  }
}

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

import { firstValueFrom } from 'rxjs';
function firstValue<T>(o: import('rxjs').Observable<T>): Promise<T> { return firstValueFrom(o); }
