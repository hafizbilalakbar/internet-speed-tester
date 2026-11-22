import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../shared/icon/icon';
import { ResultsService } from '../../core/services/results.service';
import { SeoService } from '../../core/services/seo.service';
import { TestResult } from '../../core/models/models';

@Component({
  selector: 'nv-history-page',
  imports: [DatePipe, DecimalPipe, RouterLink, IconComponent],
  template: `
    <div class="nv-container">
      <div class="page-head nv-row" style="justify-content:space-between;align-items:end">
        <div><span class="eyebrow">Your measurements</span><h1>Test history</h1><p>Results stored in this browser. Select two tests to compare them side by side.</p></div>
        <a class="btn btn--primary btn--sm" routerLink="/"><nv-icon name="play" [size]="15"/> Run new test</a>
      </div>

      @if (compare().length === 2) {
        <div class="panel panel--pad" style="margin-bottom:1rem">
          <div class="nv-row" style="justify-content:space-between"><h3>Comparison</h3><button class="btn btn--sm" (click)="compare.set([])">Clear selection</button></div>
          <div class="table-wrap"><table class="nv-table"><thead><tr><th>Metric</th><th>{{ compare()[0].createdAt | date:'short' }}</th><th>{{ compare()[1].createdAt | date:'short' }}</th><th>Change</th></tr></thead>
            <tbody>
              @for (row of comparisonRows(); track row.label) {
                <tr><td>{{ row.label }}</td><td class="mono">{{ row.a }}</td><td class="mono">{{ row.b }}</td><td class="mono" [style.color]="row.positive ? 'var(--nv-excellent)' : 'var(--nv-critical)'">{{ row.delta }}</td></tr>
              }
            </tbody>
          </table></div>
        </div>
      }

      @if (results.history().length === 0) {
        <div class="panel panel--pad center" style="padding:4rem 1rem">
          <nv-icon name="clockrewind" [size]="34"/>
          <h3 style="margin-top:1rem">No results yet</h3>
          <p class="text-2">Run your first test to build a private history on this device.</p>
          <a class="btn btn--primary" routerLink="/">Start a speed test</a>
        </div>
      } @else {
        <div class="panel"><div class="table-wrap"><table class="nv-table">
          <thead><tr><th></th><th>Date</th><th>Download</th><th>Upload</th><th>Ping</th><th>Jitter</th><th>Loss</th><th>Score</th><th>Server</th><th></th></tr></thead>
          <tbody>@for (r of results.history(); track r.id) {
            <tr>
              <td><input type="checkbox" [checked]="compare().some(c => c.id === r.id)" (change)="toggleCompare(r)" [disabled]="compare().length === 2 && !compare().some(c => c.id === r.id)" aria-label="Select for comparison"></td>
              <td>{{ r.createdAt | date:'short' }}</td>
              <td class="mono">{{ (r.measurements.downloadMbps ?? 0) | number:'1.2-2' }} Mbps</td>
              <td class="mono">{{ (r.measurements.uploadMbps ?? 0) | number:'1.2-2' }} Mbps</td>
              <td class="mono">{{ r.measurements.latency.avg ?? '—' }} ms</td>
              <td class="mono">{{ r.measurements.latency.jitter ?? '—' }} ms</td>
              <td class="mono">{{ r.measurements.latency.packetLossPct ?? '—' }}%</td>
              <td class="mono">{{ r.score.overall }}</td>
              <td>{{ r.server.name }}</td>
              <td class="nv-row" style="gap:.3rem">
                <a class="btn btn--sm" [routerLink]="r.shareToken ? ['/result', r.shareToken] : ['/r', r.id]">Open</a>
                <button class="btn btn--sm btn--danger" (click)="results.removeLocal(r.id)" aria-label="Delete result"><nv-icon name="trash" [size]="14"/></button>
              </td>
            </tr>
          }</tbody>
        </table></div></div>
      }
      <p class="tiny muted" style="margin-top:1rem">History is local to this browser and can be cleared at any time. Server-side retention policies are documented in the deployment guide.</p>
    </div>`,
})
export class HistoryPage {
  readonly results = inject(ResultsService);
  readonly compare = signal<TestResult[]>([]);
  private seo = inject(SeoService);
  constructor() { this.seo.set({ title: 'Test History', description: 'Review and compare your previous internet speed test measurements.', path: '/history' }); }

  toggleCompare(r: TestResult): void {
    this.compare.update(list => list.some(x => x.id === r.id) ? list.filter(x => x.id !== r.id) : list.length < 2 ? [...list, r] : list);
  }

  comparisonRows = computed(() => {
    const [a, b] = this.compare();
    if (!a || !b) return [];
    const rows: { label: string; a: number | null; b: number | null; higherBetter: boolean }[] = [
      { label: 'Download (Mbps)', a: a.measurements.downloadMbps, b: b.measurements.downloadMbps, higherBetter: true },
      { label: 'Upload (Mbps)', a: a.measurements.uploadMbps, b: b.measurements.uploadMbps, higherBetter: true },
      { label: 'Idle latency (ms)', a: a.measurements.latency.avg, b: b.measurements.latency.avg, higherBetter: false },
      { label: 'Jitter (ms)', a: a.measurements.latency.jitter, b: b.measurements.latency.jitter, higherBetter: false },
      { label: 'Probe loss (%)', a: a.measurements.latency.packetLossPct, b: b.measurements.latency.packetLossPct, higherBetter: false },
      { label: 'Quality score', a: a.score.overall, b: b.score.overall, higherBetter: true },
    ];
    return rows.map(r => {
      const delta = r.a !== null && r.b !== null ? r.b - r.a : null;
      const positive = delta === null ? false : (r.higherBetter ? delta > 0 : delta < 0);
      return {
        label: r.label,
        a: r.a === null ? '—' : String(r.a), b: r.b === null ? '—' : String(r.b),
        delta: delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`,
        positive,
      };
    });
  });
}
