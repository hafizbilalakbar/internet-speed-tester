import { Injectable, effect, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(this.initial());
  readonly soundEnabled = signal<boolean>(this.read('nv-sound') === 'true');

  constructor() {
    effect(() => {
      const t = this.theme();
      if (typeof document === 'undefined') return;
      document.documentElement.setAttribute('data-theme', t);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'light' ? '#F5F7FC' : '#070B16');
      try { localStorage.setItem('nv-theme', t); } catch { /* storage blocked */ }
    });
    effect(() => {
      try { localStorage.setItem('nv-sound', String(this.soundEnabled())); } catch { /* storage blocked */ }
    });
  }

  toggle(): void { this.theme.update(t => t === 'dark' ? 'light' : 'dark'); }
  setTheme(t: Theme): void { this.theme.set(t); }
  toggleSound(): void { this.soundEnabled.update(v => !v); }

  private read(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } }
  private initial(): Theme {
    const saved = this.read('nv-theme');
    if (saved === 'light' || saved === 'dark') return saved;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) return 'light';
    return 'dark';
  }
}
