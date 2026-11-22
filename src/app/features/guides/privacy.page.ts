import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../core/services/seo.service';

@Component({
  selector: 'nv-privacy-page',
  imports: [RouterLink],
  template: `
    <div class="nv-container nv-container--narrow prose" style="padding:3rem 0">
      <span class="eyebrow">Privacy</span><h1>Privacy policy</h1>
      <p class="text-2">Netvelox is designed to measure network performance with the minimum necessary data. This page explains what is collected, why, and how you control it.</p>

      <h2>Data used to run a test</h2>
      <p>Your public IP address is necessarily visible to the measurement server when data is transferred. With each test we may record a result ID, timestamp, selected server, measured values, user-agent string and public IP. IP-based ISP, ASN and approximate location are externally inferred by a third-party lookup service and are labelled as such.</p>
      <p>Browser and device details (browser version, operating system, screen size, language, timezone, hardware concurrency and browser-reported network estimates) are read locally in your browser. We do not use silent fingerprinting techniques.</p>

      <h2>Precise location</h2>
      <p>Precise GPS location is never read automatically. If you choose “Share precise location”, your browser asks for permission. Coordinates are attached only to your own result and are hidden from public share links unless you explicitly enable location sharing. You can revoke the permission in your browser at any time.</p>

      <h2>Local network information</h2>
      <p>A website cannot enumerate devices on your Wi-Fi router. We do not claim to do so. The optional companion agent is a separate application you install yourself; it binds to localhost, requires a token you control and reads only the operating system neighbour cache. Netvelox cannot enable it remotely.</p>

      <h2>Sharing and retention</h2>
      <p>Result links hide IP, ISP and location by default. You can change these settings on the result page at any time. Results stored server-side follow the retention period configured by the operator (see deployment documentation). Local history lives only in this browser and can be deleted from the History page.</p>

      <h2>AI analysis</h2>
      <p>Analysis is generated from the measured values you produced. If an external AI provider is configured, only numeric measurements and derived scores are sent to the backend provider; credentials are never exposed to the browser. The rule-based fallback runs without any external AI service.</p>

      <h2>Your controls</h2>
      <ul><li>Clear local test history on the History page.</li><li>Change public result visibility on the result page.</li><li>Control precise location through browser permissions.</li><li>Disable optional sound effects in the header.</li></ul>
      <p>Questions about a deployment's specific retention settings should be directed to the operator of that Netvelox instance.</p>
      <a class="btn" routerLink="/">Back to the speed test</a>
    </div>`,
})
export class PrivacyPage {
  constructor() { inject(SeoService).set({ title: 'Privacy Policy', description: 'How Netvelox collects, uses and protects network measurement data.', path: '/privacy' }); }
}
