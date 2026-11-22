import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { SeoService } from '../../core/services/seo.service';
import { TestingServer } from '../../core/models/models';
import { firstValueFrom } from 'rxjs';

interface HealthResponse { ok: boolean; service: string; time: number; persistence: boolean; }

@Component({
  selector: 'nv-status-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="nv-container nv-container--narrow">
      <div class="page-head"><span class="eyebrow">Live operational status</span><h1>Service status</h1>
        <p class="text-2">This page reads the API's current health and server registry. It does not show cached or invented availability.</p>
      </div>

      @if (loading()) { <div class="panel panel--pad"><p class="muted">Checking live endpoints…</p></div> }
      @else {
        <div class="nv-grid nv-grid--3">
          <div class="panel panel--pad"><span class="stat__label">API</span><h2 [style.color]="health()?.ok ? 'var(--nv-excellent)' : 'var(--nv-critical)'">{{ health()?.ok ? 'Operational' : 'Unavailable' }}</h2>
            <p class="tiny muted">{{ health()?.service ?? 'No response' }}</p></div>
          <div class="panel panel--pad"><span class="stat__label">Persistence</span><h2 [style.color]="health()?.persistence ? 'var(--nv-excellent)' : 'var(--nv-moderate)'">{{ health()?.persistence ? 'Connected' : 'Local only' }}</h2>
            <p class="tiny muted">Results are stored on this device when no database is configured.</p></div>
          <div class="panel panel--pad"><span class="stat__label">Measurement nodes</span><h2>{{ servers().length }}</h2>
            <p class="tiny muted">Configured nodes returned by the live registry.</p></div>
        </div>

        @if (error()) { <div class="alert alert--error" style="margin-top:1rem">{{ error() }}</div> }
        <div class="panel panel--pad" style="margin-top:1rem">
          <h3>Node health</h3>
          @if (!servers().length) { <p class="small muted">No nodes are currently registered.</p> }
          @else {
            <div class="table-wrap">
              <table class="data-table small">
                <thead><tr><th>Node</th><th>Region</th><th>Endpoint</th><th>Status</th><th>Probe</th></tr></thead>
                <tbody>
                  @for (s of servers(); track s.id) {
                    <tr><td>{{ s.name }}</td><td>{{ s.city }}, {{ s.country }}</td><td class="mono tiny">{{ s.host }}</td>
                      <td><span class="chip" [class.chip--good]="s.status === 'online'">{{ s.status }}</span></td>
                      <td class="mono">{{ s.latencyMs ?? '—' }} ms</td></tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      }
      <p class="small" style="margin-top:1rem"><a routerLink="/">Return to the speed test</a></p>
    </div>`,
})
export class StatusPage implements OnInit {
  private api = inject(ApiService);
  private seo = inject(SeoService);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly health = signal<HealthResponse | null>(null);
  readonly servers = signal<TestingServer[]>([]);

  constructor() { this.seo.set({ title: 'Service Status', description: 'Live status of Netvelox API health and configured measurement nodes.', path: '/status' }); }

  ngOnInit(): void {
    Promise.all([
      firstValueFrom(this.api.get<HealthResponse>('/health')),
      firstValueFrom(this.api.get<TestingServer[]>('/servers')),
    ]).then(([health, servers]) => {
      this.health.set(health); this.servers.set(Array.isArray(servers) ? servers : []); this.loading.set(false);
    }).catch(e => {
      this.error.set((e as { message?: string }).message ?? 'Status endpoints are unreachable.');
      this.loading.set(false);
    });
  }
}
