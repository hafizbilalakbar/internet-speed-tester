import { Component, inject, signal, OnInit } from '@angular/core';
import { DatePipe, JsonPipe } from '@angular/common';
import { IconComponent } from '../../shared/icon/icon';
import { AdminService } from '../../core/services/admin.service';
import { SeoService } from '../../core/services/seo.service';
import { FormsModule } from '@angular/forms';
import { TestingServer } from '../../core/models/models';

@Component({
  selector: 'nv-admin-page',
  imports: [IconComponent, DatePipe, JsonPipe, FormsModule],
  template: `
    <div class="nv-container">
      <div class="page-head"><span class="eyebrow">Operations</span><h1>Admin console</h1><p>Secured with role-based access. No credentials or API keys are ever exposed to the browser bundle.</p></div>

      @if (!admin.token()) {
        <div class="panel panel--pad" style="max-width:440px;margin-inline:auto">
          <h2>Sign in</h2>
          <form (submit)="login($event)" class="nv-stack">
            <div class="field"><label for="email">Email</label><input id="email" class="input" type="email" name="email" required autocomplete="username"></div>
            <div class="field"><label for="password">Password</label><input id="password" class="input" type="password" name="password" required autocomplete="current-password"></div>
            @if (admin.error()) { <div class="alert alert--error">{{ admin.error() }}</div> }
            <div class="nv-row"><button class="btn btn--primary" [disabled]="admin.loading()">{{ admin.loading() ? 'Signing in…' : 'Sign in' }}</button>
              <span class="tiny muted">Set ADMIN_PASSWORD_HASH on the server to enable login.</span></div>
          </form>
        </div>
      } @else {
        <div class="nv-row" style="justify-content:space-between;margin-bottom:1rem">
          <div class="chip chip--accent"><nv-icon name="shield" [size]="13"/> Signed in as {{ admin.user()?.email }} ({{ admin.user()?.role }})</div>
          <button class="btn btn--sm" (click)="admin.logout()"><nv-icon name="logout" [size]="15"/> Sign out</button>
        </div>

        @if (loadError()) { <div class="alert alert--error">{{ loadError() }}</div> }
        @if (!overview()) { <div class="skeleton" style="height:150px"></div> }
        @else if (overview(); as o) {
          <div class="nv-grid nv-grid--4">
            <div class="stat"><div class="stat__label">Total tests</div><div class="stat__value">{{ o.totalTests }}</div></div>
            <div class="stat"><div class="stat__label">Today / 7d / 30d</div><div class="stat__value" style="font-size:1.2rem">{{ o.dailyTests }} / {{ o.weeklyTests }} / {{ o.monthlyTests }}</div></div>
            <div class="stat"><div class="stat__label">Avg download</div><div class="stat__value">{{ o.avgDownloadMbps ?? '—' }}<small> Mbps</small></div></div>
            <div class="stat"><div class="stat__label">Avg upload</div><div class="stat__value">{{ o.avgUploadMbps ?? '—' }}<small> Mbps</small></div></div>
            <div class="stat"><div class="stat__label">Active sessions</div><div class="stat__value">{{ o.activeSessions }}</div></div>
            <div class="stat"><div class="stat__label">Servers online</div><div class="stat__value">{{ o.onlineServers }}/{{ o.serverCount }}</div></div>
            <div class="stat"><div class="stat__label">AI analyses</div><div class="stat__value">{{ o.aiAnalyses }}</div><div class="stat__sub">{{ o.aiProvider }} provider</div></div>
            <div class="stat"><div class="stat__label">Reported errors</div><div class="stat__value">{{ o.failedTests }}</div></div>
          </div>
        }

        <div class="segmented" style="margin:1.5rem 0">
          @for (t of tabs; track t) { <button [class.active]="tab() === t" (click)="selectTab(t)">{{ t }}</button> }
        </div>

        @if (tab() === 'Servers') {
          <div class="panel"><div class="table-wrap"><table class="nv-table">
            <thead><tr><th>ID</th><th>Name</th><th>Region</th><th>Status</th><th>Latency</th><th>Load</th><th>Protocol</th><th>Enabled</th></tr></thead>
            <tbody>@for (s of servers(); track s.id) {
              <tr><td class="mono">{{ s.id }}</td><td>{{ s.name }}</td><td>{{ s.city }}, {{ s.country }}</td>
                <td>{{ s.status }}</td><td>{{ s.latencyMs ?? '—' }}</td><td>{{ s.loadPct ?? '—' }}</td><td>{{ s.protocols.join(', ') }}</td>
                <td><button class="switch" role="switch" [attr.aria-checked]="s.status !== 'offline'" [attr.aria-label]="'Enable ' + s.name" (click)="toggleServer(s)"></button></td></tr>
            }</tbody>
          </table></div></div>
          <div class="panel panel--pad" style="margin-top:1rem">
            <h3>Add regional node</h3>
            <p class="small muted">The node must run this API, be reachable over HTTPS and allow this origin in its CORS configuration.</p>
            <form (submit)="addServer($event)" class="nv-grid nv-grid--3">
              <input class="input" name="id" placeholder="eu-fra" required>
              <input class="input" name="name" placeholder="Frankfurt" required>
              <input class="input" name="city" placeholder="Frankfurt" required>
              <input class="input" name="country" placeholder="Germany" required>
              <input class="input" name="countryCode" placeholder="DE" required>
              <input class="input" name="host" placeholder="https://speed.example.com" required>
              <input class="input" name="region" placeholder="Europe" required>
              <input class="input" name="latitude" type="number" step="any" placeholder="50.11" required>
              <input class="input" name="longitude" type="number" step="any" placeholder="8.68" required>
              <input class="input" name="provider" placeholder="Netvelox EU" required>
              <button class="btn btn--primary" style="align-self:end">Register node</button>
            </form>
            @if (actionMsg()) { <p class="small" style="margin-top:.8rem">{{ actionMsg() }}</p> }
          </div>
        }

        @if (tab() === 'Results') {
          <div class="panel"><div class="table-wrap"><table class="nv-table">
            <thead><tr><th>Result</th><th>Date</th><th>Server</th><th>Download</th><th>Upload</th><th>Score</th></tr></thead>
            <tbody>@for (r of recentResults(); track r.id) {
              <tr><td class="mono">{{ r.id }}</td><td>{{ r.created_at | date:'medium' }}</td><td>{{ r.server_id }}</td>
                <td class="mono">{{ r.measurements?.downloadMbps ?? '—' }}</td><td class="mono">{{ r.measurements?.uploadMbps ?? '—' }}</td><td class="mono">{{ r.score?.overall ?? '—' }}</td></tr>
            } @empty { <tr><td colspan="6" class="muted center">No stored results yet.</td></tr> }
            </tbody>
          </table></div></div>
        }

        @if (tab() === 'Errors') {
          <div class="panel panel--pad">
            @for (e of errors(); track e.id) { <div class="alert alert--error" style="margin-bottom:.5rem">{{ e.created_at | date:'medium' }} · {{ e.path || 'server' }} · {{ e.message }}</div> }
            @if (!errors().length) { <p class="muted">No operational errors recorded.</p> }
          </div>
        }

        @if (tab() === 'Configuration') {
          <div class="panel panel--pad">
            <h3>Effective server configuration</h3>
            @if (config(); as c) { <pre class="code-block">{{ c | json }}</pre> }
            <p class="small muted">Runtime test tuning and AI credentials are environment variables on the server and require a restart. Branding and SEO metadata are part of the frontend build.</p>
          </div>
        }
      }
    </div>`,
  styles: `.code-block { background:var(--nv-panel-2); padding:1rem; border-radius:10px; overflow:auto; font-size:.76rem; }`,
})
export class AdminPage implements OnInit {
  readonly admin = inject(AdminService);
  private seo = inject(SeoService);
  readonly tabs = ['Servers', 'Results', 'Errors', 'Configuration'] as const;
  readonly tab = signal<'Servers' | 'Results' | 'Errors' | 'Configuration'>('Servers');
  readonly overview = signal<any>(null);
  readonly servers = signal<TestingServer[]>([]);
  readonly recentResults = signal<any[]>([]);
  readonly errors = signal<any[]>([]);
  readonly config = signal<any>(null);
  readonly loadError = signal('');
  readonly actionMsg = signal('');

  constructor() { this.seo.set({ title: 'Admin Console', description: 'Netvelox administration console.', path: '/admin' }); }
  async ngOnInit(): Promise<void> { if (this.admin.token()) await this.loadAll(); }

  async login(e: Event): Promise<void> {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    if (await this.admin.login(String(fd.get('email') ?? ''), String(fd.get('password') ?? ''))) await this.loadAll();
  }

  async loadAll(): Promise<void> {
    try {
      this.overview.set(await this.admin.get('/overview'));
      this.servers.set(await this.admin.get('/servers'));
      await this.selectTab(this.tab());
    } catch (e) { this.loadError.set((e as { message?: string }).message ?? 'Unable to load admin data'); }
  }

  async selectTab(t: 'Servers' | 'Results' | 'Errors' | 'Configuration'): Promise<void> {
    this.tab.set(t);
    try {
      if (t === 'Results') this.recentResults.set(await this.admin.get('/results'));
      if (t === 'Errors') this.errors.set(await this.admin.get('/errors'));
      if (t === 'Configuration') this.config.set(await this.admin.get('/config'));
    } catch (e) { this.loadError.set((e as { message?: string }).message ?? 'Unable to load data'); }
  }

  async toggleServer(s: TestingServer): Promise<void> {
    try {
      await this.admin.put(`/servers/${encodeURIComponent(s.id)}`, { enabled: s.status === 'offline' });
      this.servers.set(await this.admin.get('/servers'));
      this.actionMsg.set(`${s.name} ${s.status === 'offline' ? 'enabled' : 'disabled'}.`);
    } catch (e) { this.actionMsg.set((e as Error).message); }
  }

  async addServer(e: Event): Promise<void> {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const body = Object.fromEntries(fd.entries()) as Record<string, unknown>;
    body['latitude'] = Number(body['latitude']); body['longitude'] = Number(body['longitude']);
    try {
      await this.admin.post('/servers', body);
      this.servers.set(await this.admin.get('/servers'));
      this.actionMsg.set('Regional node registered.');
    } catch (err) { this.actionMsg.set((err as Error).message); }
  }
}
