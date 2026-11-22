import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AppConfigService } from './app-config.service';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private http = inject(HttpClient);
  private config = inject(AppConfigService);
  readonly token = signal<string | null>(sessionStorage.getItem('nv-admin-token'));
  readonly user = signal<{ email: string; role: string } | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  private get base(): string { return `${this.config.apiBase}/admin`; }
  private headers(): HttpHeaders {
    const t = this.token();
    return new HttpHeaders(t ? { Authorization: `Bearer ${t}` } : {});
  }

  async login(email: string, password: string): Promise<boolean> {
    this.loading.set(true); this.error.set(null);
    try {
      const res = await firstValueFrom(this.http.post<{ token: string; user: { email: string; role: string } }>(`${this.base}/login`, { email, password }));
      this.token.set(res.token); this.user.set(res.user);
      sessionStorage.setItem('nv-admin-token', res.token);
      return true;
    } catch (e) { this.error.set((e as { message?: string }).message ?? 'Login failed'); return false; }
    finally { this.loading.set(false); }
  }

  logout(): void { this.token.set(null); this.user.set(null); sessionStorage.removeItem('nv-admin-token'); }

  async get<T>(path: string): Promise<T> {
    return firstValueFrom(this.http.get<T>(`${this.base}${path}`, { headers: this.headers() }));
  }
  async post<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.post<T>(`${this.base}${path}`, body, { headers: this.headers() }));
  }
  async put<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.put<T>(`${this.base}${path}`, body, { headers: this.headers() }));
  }
}
