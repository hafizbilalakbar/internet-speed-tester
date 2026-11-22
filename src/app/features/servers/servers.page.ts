import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IconComponent } from '../../shared/icon/icon';
import { ServerService } from '../../core/services/server.service';
import { SeoService } from '../../core/services/seo.service';
import { TestingServer } from '../../core/models/models';

@Component({
  selector: 'nv-servers-page',
  imports: [IconComponent],
  template: `
    <div class="nv-container">
      <div class="page-head nv-row" style="justify-content:space-between;align-items:end">
        <div><span class="eyebrow">Test infrastructure</span><h1>Regional test servers</h1>
          <p>Every server is probed from your browser and ranked by measured latency. Disabled or unreachable nodes are excluded from automatic selection.</p></div>
        <button class="btn" (click)="servers.discover()" [disabled]="servers.loading()"><nv-icon name="refresh" [size]="16"/> {{ servers.loading() ? 'Probing…' : 'Refresh servers' }}</button>
      </div>

      @if (servers.error()) { <div class="alert alert--error">{{ servers.error() }}</div> }

      <div class="panel">
        <div class="table-wrap">
          <table class="nv-table">
            <thead><tr><th>Server</th><th>Region</th><th>Provider</th><th>Latency</th><th>Status</th><th>Load</th><th>Capacity</th><th>Protocols</th><th></th></tr></thead>
            <tbody>
              @for (s of servers.servers(); track s.id) {
                <tr>
                  <td><strong>{{ s.name }}</strong><div class="tiny muted">{{ s.host }}</div></td>
                  <td>{{ s.city }}, {{ s.country }}</td>
                  <td>{{ s.provider }}</td>
                  <td class="mono">{{ s.latencyMs === null ? '—' : s.latencyMs + ' ms' }}</td>
                  <td><span class="chip" [class.chip--good]="s.status === 'online'" [class.chip--warn]="s.status === 'degraded'" [class.chip--bad]="s.status === 'offline'">{{ s.status }}</span></td>
                  <td>{{ s.loadPct === null ? 'not reported' : s.loadPct + '%' }}</td>
                  <td>{{ s.capacity ?? 'not reported' }}</td>
                  <td class="tiny">{{ s.protocols.join(', ') }}</td>
                  <td>
                    <button class="btn btn--sm" [class.btn--primary]="servers.selected()?.id === s.id" (click)="useServer(s)">
                      {{ servers.selected()?.id === s.id ? 'Selected' : 'Use server' }}
                    </button>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="9" class="center muted">No servers configured. Add a regional node in the admin console or via <code>REGIONAL_NODES</code>.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <div class="nv-grid nv-grid--3" style="margin-top:1.5rem">
        <div class="panel panel--pad"><nv-icon name="target" [size]="20"/><h3>Automatic selection</h3><p class="small muted">We send three real timing probes to each healthy node and choose the lowest observed latency. You can override it manually.</p></div>
        <div class="panel panel--pad"><nv-icon name="routing" [size]="20"/><h3>Failover</h3><p class="small muted">If the selected node is offline or a transfer fails, choose another node and re-run the test. Results record which node produced the numbers.</p></div>
        <div class="panel panel--pad"><nv-icon name="layers" [size]="20"/><h3>Add a region</h3><p class="small muted">Deploy this API as another node, set <code>PUBLIC_NODE_URL</code> and CORS, then register it via <code>REGIONAL_NODES</code> or the admin console. See <code>DEPLOYMENT.md</code>.</p></div>
      </div>
    </div>`,
})
export class ServersPage implements OnInit {
  readonly servers = inject(ServerService);
  private router = inject(Router);
  private seo = inject(SeoService);
  constructor() { this.seo.set({ title: 'Test Servers', description: 'View and select real regional speed test servers, ranked by measured latency.', path: '/servers' }); }
  ngOnInit(): void { void this.servers.discover(); }
  useServer(s: TestingServer): void { this.servers.select(s.id); void this.router.navigate(['/']); }
}
