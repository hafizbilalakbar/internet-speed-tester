import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BrandComponent } from '../../shared/brand/brand';
import { IconComponent } from '../../shared/icon/icon';

@Component({
  selector: 'nv-footer',
  imports: [RouterLink, BrandComponent, IconComponent],
  template: `
    <footer class="nv-footer">
      <div class="nv-container">
        <div class="footer-grid">
          <div class="footer-brand">
            <nv-brand />
            <p class="text-2 small" style="max-width:32ch;margin-top:.8rem">Measure what matters. Real internet speed, latency and network intelligence for everyone.</p>
            <p class="tiny muted">Measurements come from real data transfers to configured servers. Probe loss is application-layer, not ICMP.</p>
            <div class="footer-badges"><span class="chip chip--good"><nv-icon name="shield" [size]="13"/> Privacy-first</span><span class="chip"><nv-icon name="activity" [size]="13"/> Real transfers</span></div>
          </div>
          <div><h4>Test</h4>
            <a routerLink="/">Internet Speed Test</a><a routerLink="/wifi-speed-test">Wi-Fi Speed Test</a>
            <a routerLink="/download-speed-test">Download Test</a><a routerLink="/upload-speed-test">Upload Test</a>
            <a routerLink="/ping-test">Ping Test</a><a routerLink="/jitter-test">Jitter Test</a>
          </div>
          <div><h4>Platform</h4>
            <a routerLink="/servers">Test Servers</a><a routerLink="/tools">Network Tools</a>
            <a routerLink="/diagnostics">Diagnostics</a><a routerLink="/analytics">Global Analytics</a>
            <a routerLink="/history">My Results</a><a routerLink="/status">Service Status</a>
          </div>
          <div><h4>Learn</h4>
            <a routerLink="/guides">All Guides</a><a routerLink="/guides/understanding-jitter">Understanding Jitter</a>
            <a routerLink="/guides/internet-troubleshooting">Troubleshooting</a><a routerLink="/guides/isp-information">ISP Information</a>
            <a routerLink="/about">How It Works</a>
          </div>
          <div><h4>Company &amp; legal</h4>
            <a routerLink="/about">About</a><a routerLink="/privacy">Privacy Policy</a>
            <a routerLink="/terms">Terms of Service</a><a routerLink="/cookies">Cookie Policy</a>
            <a routerLink="/accessibility">Accessibility</a><a routerLink="/admin">Admin</a>
          </div>
        </div>
        <div class="footer-bottom">
          <span>© {{ year }} Netvelox. Built for accurate, transparent network measurement.</span>
          <span class="nv-row" style="gap:.4rem"><nv-icon name="shield" [size]="14"/> No silent precise location · No fabricated results</span>
        </div>
      </div>
    </footer>`,
  styles: `.footer-badges { display:flex; gap:.4rem; flex-wrap:wrap; margin-top:1rem; }`,
})
export class FooterComponent {
  readonly year = new Date().getFullYear();
}
