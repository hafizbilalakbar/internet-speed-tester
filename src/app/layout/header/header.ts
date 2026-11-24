import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { RouterLink, Router, RouterLinkActive } from '@angular/router';
import { IconComponent } from '../../shared/icon/icon';
import { ThemeService } from '../../core/services/theme.service';

interface MenuLink { label: string; path: string; hint: string; icon: string; }

@Component({
  selector: 'nv-header',
  imports: [RouterLink, RouterLinkActive, IconComponent],
  template: `
    <header class="nv-header">
      <div class="nv-container nv-header__inner">
        <a routerLink="/" class="nv-brand" aria-label="Netvelox home"><img src="brand/mark.svg" alt="" width="34" height="34"/><span>netvelox</span></a>

        <nav id="primary-nav" class="nv-nav" [class.open]="menuOpen()" aria-label="Primary navigation">
          <div class="nav-group" (mouseenter)="openMenu.set('test')" (mouseleave)="openMenu.set(null)">
            <button class="nav-trigger" type="button" aria-controls="menu-test" [attr.aria-expanded]="openMenu() === 'test'" (click)="toggleMenu('test')">
              Speed tests <nv-icon name="chevron" [size]="13" class="nav-chevron"/>
            </button>
            <div class="mega" id="menu-test" [class.open]="openMenu() === 'test'">
              <div class="mega__intro"><span class="eyebrow">Run a test</span><strong>Measure the connection you actually have.</strong><p class="tiny muted">Real transfers, one clear report, no invented numbers.</p></div>
              <div class="mega__links">
                @for (link of testMenu; track link.path) {
                  <a [routerLink]="link.path" (click)="closeAll()"><nv-icon [name]="link.icon" [size]="16"/><span><strong>{{ link.label }}</strong><small>{{ link.hint }}</small></span></a>
                }
              </div>
            </div>
          </div>

          <div class="nav-group" (mouseenter)="openMenu.set('platform')" (mouseleave)="openMenu.set(null)">
            <button class="nav-trigger" type="button" aria-controls="menu-platform" [attr.aria-expanded]="openMenu() === 'platform'" (click)="toggleMenu('platform')">
              Platform <nv-icon name="chevron" [size]="13" class="nav-chevron"/>
            </button>
            <div class="mega" id="menu-platform" [class.open]="openMenu() === 'platform'">
              <div class="mega__intro"><span class="eyebrow">Network intelligence</span><strong>See what is happening, not just a number.</strong><p class="tiny muted">Real edge details and browser-visible network checks.</p></div>
              <div class="mega__links">
                @for (link of platformMenu; track link.path) {
                  <a [routerLink]="link.path" (click)="closeAll()"><nv-icon [name]="link.icon" [size]="16"/><span><strong>{{ link.label }}</strong><small>{{ link.hint }}</small></span></a>
                }
              </div>
            </div>
          </div>

          <div class="nav-group" (mouseenter)="openMenu.set('company')" (mouseleave)="openMenu.set(null)">
            <button class="nav-trigger" type="button" aria-controls="menu-company" [attr.aria-expanded]="openMenu() === 'company'" (click)="toggleMenu('company')">
              Company <nv-icon name="chevron" [size]="13" class="nav-chevron"/>
            </button>
            <div class="mega" id="menu-company" [class.open]="openMenu() === 'company'">
              <div class="mega__intro"><span class="eyebrow">About Netvelox</span><strong>Open about how measurements work.</strong><p class="tiny muted">Methodology, privacy commitments and legal terms.</p></div>
              <div class="mega__links">
                @for (link of companyMenu; track link.path) {
                  <a [routerLink]="link.path" (click)="closeAll()"><nv-icon [name]="link.icon" [size]="16"/><span><strong>{{ link.label }}</strong><small>{{ link.hint }}</small></span></a>
                }
              </div>
            </div>
          </div>

          <a routerLink="/guides" routerLinkActive="active" (click)="closeAll()">Guides</a>
          <a routerLink="/history" routerLinkActive="active" (click)="closeAll()">History</a>
        </nav>

        <div class="nv-spacer"></div>
        <button class="btn btn--sm btn--icon" (click)="theme.toggleSound()" [attr.aria-label]="theme.soundEnabled() ? 'Disable sounds' : 'Enable sounds'" [title]="theme.soundEnabled() ? 'Sounds on' : 'Sounds off'">
          <nv-icon [name]="theme.soundEnabled() ? 'volume' : 'volumeoff'" [size]="17"/>
        </button>
        <button class="btn btn--sm btn--icon" (click)="theme.toggle()" [attr.aria-label]="theme.theme() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'" [title]="theme.theme() === 'dark' ? 'Light theme' : 'Dark theme'">
          <nv-icon [name]="theme.theme() === 'dark' ? 'sun' : 'moon'" [size]="17"/>
        </button>
        <a class="btn btn--primary btn--sm nav-cta" routerLink="/" (click)="closeAll()">Test now</a>
        <button class="btn btn--sm btn--icon nav-toggle" (click)="menuOpen.update(v => !v)" aria-label="Toggle navigation" aria-controls="primary-nav" [attr.aria-expanded]="menuOpen()">
          <nv-icon [name]="menuOpen() ? 'x' : 'menu'" [size]="19"/>
        </button>
      </div>
    </header>`,
  styles: `
    .nav-cta { margin-left: .1rem; }
    .nav-group { position: relative; }
    .nav-trigger { display:inline-flex; align-items:center; gap:.3rem; min-height:44px; padding:.45rem .7rem; border:0; border-radius:9px; background:transparent; color:var(--nv-text-2); font-size:.84rem; font-weight:600; }
    .nav-trigger:hover, .nav-trigger[aria-expanded='true'] { color:var(--nv-text); background:var(--nv-panel-2); }
    .nav-chevron { transform:rotate(90deg); transition:transform .18s; }
    .nav-trigger[aria-expanded='true'] .nav-chevron { transform:rotate(-90deg); }
    .nv-nav > a { display:inline-flex; align-items:center; min-height:44px; }
    .mega {
      position:absolute; top:calc(100% + .4rem); left:-1rem; z-index:60; width:min(660px, 90vw);
      display:grid; grid-template-columns:minmax(180px,.8fr) 1.2fr; gap:1.2rem;
      padding:1.2rem; border-radius:16px; border:1px solid var(--nv-border-strong);
      background:var(--nv-panel); box-shadow:var(--nv-shadow);
      opacity:0; visibility:hidden; transform:translateY(-6px); pointer-events:none; transition:.16s ease;
    }
    .mega.open { opacity:1; visibility:visible; transform:none; pointer-events:auto; }
    .mega__intro { display:grid; align-content:start; gap:.4rem; padding-right:1rem; border-right:1px solid var(--nv-border); }
    .mega__intro p { margin:0; }
    .mega__links { display:grid; grid-template-columns:1fr 1fr; gap:.35rem; }
    .mega__links a { display:flex; align-items:flex-start; gap:.6rem; padding:.6rem; border-radius:11px; color:var(--nv-text); }
    .mega__links a:hover { background:var(--nv-panel-2); text-decoration:none; }
    .mega__links nv-icon { color:var(--nv-accent); margin-top:.15rem; }
    .mega__links span { display:grid; gap:.1rem; }
    .mega__links small { color:var(--nv-muted); font-size:.7rem; line-height:1.35; }
    @media (max-width: 1180px) {
      .nv-header__inner { gap:.5rem; padding-top:env(safe-area-inset-top); }
      .nav-toggle { display:inline-flex; }
      .nv-header .btn { min-height:44px; }
      /* Off-canvas slide-in navigation. */
      .nv-nav {
        position:fixed; top:56px; right:0; z-index:70; display:flex;
        flex-direction:column; align-items:stretch; gap:.15rem;
        width:min(320px, 86vw); height:calc(100dvh - 56px);
        padding:.75rem max(1rem, env(safe-area-inset-right)) calc(1rem + env(safe-area-inset-bottom)) 1rem;
        background:var(--nv-bg); border-left:1px solid var(--nv-border); box-shadow:var(--nv-shadow);
        transform:translateX(103%); opacity:0; visibility:hidden;
        transition:transform .22s ease, opacity .22s ease, visibility .22s;
        max-height:none; overflow:auto;
      }
      .nv-nav.open { transform:none; opacity:1; visibility:visible; }
      .nv-nav > a, .nav-trigger { width:100%; justify-content:flex-start; min-height:44px; }
      .nv-nav > a { padding:.7rem .8rem; }
      .mega { position:static; width:auto; grid-template-columns:1fr; opacity:1; visibility:visible; transform:none; pointer-events:auto; display:none; box-shadow:none; border:0; padding:.4rem 0 .6rem; background:transparent; }
      .mega.open { display:grid; }
      .mega__intro { border-right:0; border-bottom:1px solid var(--nv-border); padding:0 0 .6rem; }
      .mega__links { grid-template-columns:1fr; }
      .mega__links a { min-height:44px; }
    }
    @media (max-width: 640px) { .nav-cta { display:none; } }
  `,
})
export class HeaderComponent {
  readonly theme = inject(ThemeService);
  readonly menuOpen = signal(false);
  readonly openMenu = signal<string | null>(null);
  private router = inject(Router);
  private host = inject(ElementRef<HTMLElement>);

  readonly testMenu: MenuLink[] = [
    { label: 'Internet speed test', path: '/', hint: 'Download, upload, latency and loaded latency', icon: 'gauge' },
    { label: 'Results & history', path: '/history', hint: 'Measurements saved in this browser', icon: 'chart' },
  ];
  readonly platformMenu: MenuLink[] = [
    { label: 'Test servers', path: '/servers', hint: 'Cloudflare edge details', icon: 'server' },
    { label: 'Network tools', path: '/tools', hint: 'DNS, headers, TLS and IP checks', icon: 'terminal' },
  ];
  readonly companyMenu: MenuLink[] = [
    { label: 'About Netvelox', path: '/about', hint: 'Why and how this platform is built', icon: 'info' },
    { label: 'Privacy policy', path: '/privacy', hint: 'What is collected and why', icon: 'lock' },
    { label: 'Terms of service', path: '/terms', hint: 'Rules for using the service', icon: 'list' },
  ];

  readonly headerOffset = signal(0);
  private lastScrollY = 0;

  constructor() { this.router.events.subscribe(() => this.closeAll()); }

  @HostListener('window:scroll', [])
  onScroll(): void {
    const currentScrollY = (window as any).pageYOffset || (document.documentElement as any).scrollY || (document.body as any).scrollY || 0;
    const delta = currentScrollY - this.lastScrollY;
    this.lastScrollY = currentScrollY;

    // Only react to meaningful scroll delta
    if (Math.abs(delta) < 5) return;

    const newOffset = Math.max(0, Math.min(100, this.headerOffset() + (delta > 0 ? 10 : -10)));
    this.headerOffset.set(newOffset);
  }

  toggleMenu(name: string): void { this.openMenu.update(v => v === name ? null : name); }
  closeAll(): void { this.menuOpen.set(false); this.openMenu.set(null); }

  @HostListener('document:keydown.escape') onEscape(): void { this.closeAll(); }
  @HostListener('document:click', ['$event']) onDocumentClick(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) this.closeAll();
  }
}
