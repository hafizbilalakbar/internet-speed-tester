import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppConfigService } from '../../core/services/app-config.service';
import { SeoService } from '../../core/services/seo.service';

@Component({
  selector: 'nv-contact-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="nv-container nv-container--narrow">
      <div class="page-head"><span class="eyebrow">Contact</span><h1>Get in touch</h1>
        <p class="text-2">Netvelox is deployed by individual operators. Support contact details are configured per deployment, not by the application itself.</p>
      </div>
      <div class="panel panel--pad prose">
        @if (config.supportEmail) {
          <h2>Support email</h2>
          <p><a [href]="'mailto:' + config.supportEmail">{{ config.supportEmail }}</a></p>
        } @else {
          <h2>No support address configured</h2>
          <p>This deployment has not published a contact email. Use the support channel provided by the organisation operating this Netvelox instance.</p>
        }
        <h2>Self-check before contacting support</h2>
        <ul>
          <li>Run a test and save the result ID shown on the report page.</li>
          <li>Check <a routerLink="/status">Service status</a> to see whether the API and measurement nodes are reachable.</li>
          <li>Note your browser, OS, network type and whether a VPN or proxy is active.</li>
          <li>Do not include your public IP or share links unless you explicitly intend to share them.</li>
        </ul>
        <p class="tiny muted">Share links redact IP, ISP and location by default. Those values are never sent to support automatically.</p>
      </div>
    </div>`,
})
export class ContactPage {
  readonly config = inject(AppConfigService);
  private seo = inject(SeoService);

  constructor() { this.seo.set({ title: 'Contact', description: 'Contact information and self-check guidance for this Netvelox deployment.', path: '/contact' }); }
}
