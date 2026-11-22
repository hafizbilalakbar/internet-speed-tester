import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SeoService } from '../../core/services/seo.service';

interface LegalSection { heading: string; paragraphs: string[]; bullets?: string[]; }

const PAGES: Record<string, { title: string; lede: string; path: string; sections: LegalSection[] }> = {
  about: {
    title: 'About Netvelox',
    lede: 'Netvelox is a speed-test and network-intelligence interface built around transparent measurement, clear privacy choices and honest reporting.',
    path: '/about',
    sections: [
      { heading: 'What we measure', paragraphs: ['Download and upload are calculated from real byte streams transferred to a configured measurement node. Idle latency, jitter, loaded latency and HTTP probe loss are measured from sequenced round trips to that node. Probes are application-layer HTTP requests, not ICMP packets.'], bullets: ['Multi-connection throughput with bounded session budgets.', 'No-store, no-cache, identity-encoded transfer responses.', 'Quality scores are transparent heuristics, not industry certifications.'] },
      { heading: 'How servers work', paragraphs: ['Each deployment runs the same API as a measurement node. The local node is available by default; additional regional nodes can be configured through environment variables or the admin console. Server latency shown in the interface is measured from your browser to the published node endpoint.'] },
      { heading: 'What we do not do', paragraphs: ['Netvelox does not invent results, generate placeholder rankings, request precise location without explicit permission, or present browser-reported estimates as measured throughput. When a measurement cannot be completed, the test fails clearly instead of substituting a number.'] },
    ],
  },
  terms: {
    title: 'Terms of service',
    lede: 'These terms govern use of a Netvelox deployment. They are written to be readable, not to hide behaviour behind legal language.',
    path: '/terms',
    sections: [
      { heading: 'Acceptable use', paragraphs: ['Use the service to measure connections you are authorised to test and to view your own results. Do not attempt to exhaust measurement capacity, bypass rate limits, probe private network addresses through the tools endpoints, or interfere with other users or deployed nodes.'], bullets: ['Automated bulk testing is rate-limited.', 'Measurement endpoints require a short-lived test session.', 'Upload and download transfers are bounded per session.'] },
      { heading: 'Accuracy and limitations', paragraphs: ['Results reflect the path between your browser and the selected measurement node at the time of the test. Browser throttling, VPNs, proxying, congestion, server load and device limits can affect outcomes. Probe loss is an HTTP approximation and does not equal ICMP packet loss.'] },
      { heading: 'Results and intellectual property', paragraphs: ['You retain responsibility for information you choose to publish through share links. Share links redact IP, ISP and location by default; enabling those options is an explicit choice. Netvelox branding and interface code belong to the deployment operator.'] },
      { heading: 'Availability and changes', paragraphs: ['The service is provided without a guarantee of uninterrupted availability. Measurement nodes may be added, removed or withdrawn. These terms may be updated as the platform changes; the current version is always published at this page.'] },
    ],
  },
  cookies: {
    title: 'Cookie and local-storage policy',
    lede: 'Netvelox does not use advertising or cross-site tracking cookies. The interface stores a small amount of data locally to remember your preferences and results.',
    path: '/cookies',
    sections: [
      { heading: 'What is stored', paragraphs: ['The application uses browser local storage for theme preference, sound preference and your locally saved test history. Admin sessions are held in session storage and are discarded when the tab closes. No third-party analytics or advertising cookies are set by Netvelox.'], bullets: ['nv-theme — light or dark preference.', 'nv-sound — measurement sound preference.', 'nv-test-history — your completed results on this device.', 'nv-privacy-intro — acknowledgement of the first-visit privacy notice.', 'Companion agent token — only if you explicitly enable the optional LAN diagnostics agent.'] },
      { heading: 'Why it is stored', paragraphs: ['These values keep the interface usable across refreshes, preserve results when the database is unavailable, and avoid asking for the same preference repeatedly. They are not used to build advertising profiles.'] },
      { heading: 'Your choices', paragraphs: ['You can clear site data in your browser at any time. Clearing local storage removes saved results and preferences on that device. Results already stored by a configured backend remain subject to that deployment’s retention policy.'] },
    ],
  },
  accessibility: {
    title: 'Accessibility commitment',
    lede: 'Netvelox is designed to be usable with keyboard, screen readers, reduced-motion settings and touch input.',
    path: '/accessibility',
    sections: [
      { heading: 'What is implemented', paragraphs: ['The interface provides a skip-to-content link, semantic landmarks, labelled controls, focus-visible styles, aria-live status regions for test progress and errors, and reduced-motion handling. Interactive controls meet a minimum 44px touch target where practical.'], bullets: ['Keyboard-operable navigation, menus, switches and dialogs.', 'Text alternatives for icons and status indicators.', 'Responsive layouts from 320px upward.', 'Dark and light themes with explicit contrast-aware metric colours.'] },
      { heading: 'Known limitations', paragraphs: ['The optional 3D globe is decorative, hidden on small screens and skipped when WebGL is unavailable. Data tables are horizontally scrollable on narrow viewports. If you encounter a barrier, report it to the operator of your Netvelox deployment.'] },
    ],
  },
};

@Component({
  selector: 'nv-legal-page',
  imports: [RouterLink],
  template: `
    <div class="nv-container nv-container--narrow">
      @if (page(); as p) {
        <div class="page-head"><span class="eyebrow">Netvelox policy</span><h1>{{ p.title }}</h1><p>{{ p.lede }}</p></div>
        <div class="prose panel panel--pad">
          @for (section of p.sections; track section.heading) {
            <section>
              <h2>{{ section.heading }}</h2>
              @for (paragraph of section.paragraphs; track paragraph) { <p>{{ paragraph }}</p> }
              @if (section.bullets) {
                <ul>@for (bullet of section.bullets; track bullet) { <li>{{ bullet }}</li> }</ul>
              }
            </section>
          }
          <p class="tiny muted">Last reviewed: {{ reviewed }}</p>
          <p class="small"><a routerLink="/">Return to the speed test</a> · <a routerLink="/privacy">Privacy policy</a></p>
        </div>
      }
    </div>`,
})
export class LegalPage {
  private route = inject(ActivatedRoute);
  private seo = inject(SeoService);
  readonly reviewed = '22 November 2026';
  readonly page = signal(PAGES[String(this.route.snapshot.data['page'] ?? 'about')] ?? PAGES['about']);

  constructor() {
    const p = this.page();
    this.seo.set({ title: p.title, description: p.lede, path: p.path });
  }
}
