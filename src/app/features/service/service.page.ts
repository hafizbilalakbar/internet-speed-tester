import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IconComponent } from '../../shared/icon/icon';
import { SeoService } from '../../core/services/seo.service';

interface ServiceContent {
  path: string; eyebrow: string; title: string; description: string; intro: string;
  points: { title: string; text: string }[]; method: string; faq: { q: string; a: string }[];
}

const CONTENT: ServiceContent[] = [
  {
    path: 'wifi-speed-test', eyebrow: 'Wireless performance', title: 'Wi-Fi Speed Test',
    description: 'Test the real speed of your Wi-Fi connection with byte-level download and upload measurements, latency and stability analysis.',
    intro: 'Wi-Fi performance changes with distance, interference and the device you test from. Netvelox measures actual data transfer from your current device so the result reflects the connection you are using right now — not an average for your area.',
    points: [
      { title: 'Measure from this device', text: 'Download and upload tests use parallel no-cache transfers and count every received byte.' },
      { title: 'Check loaded latency', text: 'We sample latency while data is flowing to reveal bufferbloat that causes lag during downloads.' },
      { title: 'Compare bands fairly', text: 'Run a test on 2.4 GHz and 5 GHz (or wired Ethernet) using the same server to see the real difference.' },
    ],
    method: 'The browser opens multiple parallel HTTP transfers to a configured regional node, counts received bytes and calculates Mbps from elapsed time. Upload tests send randomly generated payloads and count only bytes the server confirms.',
    faq: [
      { q: 'Why do Wi-Fi speeds vary between tests?', a: 'Radio interference, channel congestion, signal strength and background devices all change throughput. Run several tests at different times to establish a range.' },
      { q: 'Can this test see every device on my Wi-Fi?', a: 'No. Browsers cannot enumerate router clients. An optional local companion agent can read the operating system neighbour cache with your explicit permission.' },
    ],
  },
  {
    path: 'download-speed-test', eyebrow: 'Throughput', title: 'Download Speed Test',
    description: 'Measure real download speed in Mbps using parallel, uncached transfers from regional test servers.',
    intro: 'Download speed determines how quickly your connection receives data from the internet. Netvelox uses real file transfers, not simulated values, and shows a live throughput graph so you can see how the connection behaves over time.',
    points: [
      { title: 'Real byte counting', text: 'Every chunk received from the server is counted and converted to Mbps using measured elapsed time.' },
      { title: 'Adaptive parallelism', text: 'Multiple connections keep high-bandwidth links busy while avoiding unnecessary requests on slow links.' },
      { title: 'Cache bypass', text: 'No-store headers and unique request parameters prevent proxy or browser caching from inflating results.' },
    ],
    method: 'A session is created against a latency-ranked regional node. The browser streams random data from no-cache endpoints for a fixed interval, sampling transfer bytes four times per second. The final value is total bytes divided by total elapsed time.',
    faq: [
      { q: 'Why is my download lower than my plan?', a: 'Wi-Fi signal, router quality, congestion, server distance and device limitations can all reduce realised throughput.' },
      { q: 'Does download speed affect gaming?', a: 'Latency and jitter usually matter more than raw download speed for gaming, but large downloads can raise latency if bufferbloat is present.' },
    ],
  },
  {
    path: 'upload-speed-test', eyebrow: 'Upstream capacity', title: 'Upload Speed Test',
    description: 'Test upload speed with randomly generated payloads sent to a real server that confirms every received byte.',
    intro: 'Upload speed affects video calls, cloud backups and sharing large files. Netvelox generates fresh random data in your browser and only counts upload bytes that the server acknowledges.',
    points: [
      { title: 'Acknowledged bytes only', text: 'The final score uses bytes the server received successfully, not bytes merely queued by the browser.' },
      { title: 'Live progress', text: 'Upload progress is sampled during transfer and displayed in real time.' },
      { title: 'Size limits', text: 'Server-side request limits protect the infrastructure while allowing high-speed links to saturate.' },
    ],
    method: 'Cryptographically random payloads are POSTed as application/octet-stream. The server counts incoming bytes and returns an acknowledgement. Throughput is confirmed bytes multiplied by eight, divided by elapsed time.',
    faq: [
      { q: 'Why is upload often slower than download?', a: 'Most consumer broadband plans are asymmetric by design, and home networking equipment can further limit upstream performance.' },
      { q: 'How much upload do video calls need?', a: 'HD video calls typically work well above 3 Mbps; high-bitrate 1080p and simultaneous uploads benefit from 10 Mbps or more.' },
    ],
  },
  {
    path: 'ping-test', eyebrow: 'Responsiveness', title: 'Ping Test',
    description: 'Measure round-trip latency to a real server with repeated uncached requests and report min, average and max.',
    intro: 'Ping is the time a small request takes to travel to a server and back. Lower latency makes browsing, gaming and calls feel more responsive. Netvelox reports the distribution of measured round trips, not a single number.',
    points: [
      { title: 'Repeated samples', text: 'Multiple sequential uncached requests produce min, average, median and maximum values.' },
      { title: 'Loaded comparison', text: 'The full speed test also measures latency during download and upload to detect bufferbloat.' },
      { title: 'Honest limits', text: 'HTTP timing is not ICMP ping; it measures application-layer round trips to our endpoint.' },
    ],
    method: 'The browser records a high-resolution timestamp before each fetch to a no-store endpoint and another when the response body completes. The difference is the observed round-trip time.',
    faq: [
      { q: 'What is a good ping?', a: 'Under 30 ms is excellent for most uses; 30–70 ms is acceptable; above 100 ms becomes noticeable in competitive gaming.' },
      { q: 'Why does ping change between servers?', a: 'Network paths differ. A geographically closer server normally has lower latency, but routing and peering also matter.' },
    ],
  },
  {
    path: 'jitter-test', eyebrow: 'Consistency', title: 'Jitter Test',
    description: 'Measure latency variation with repeated round-trip samples to identify an unstable connection.',
    intro: 'Jitter is the variation in latency between consecutive packets. High jitter causes choppy voice calls, stuttering video and inconsistent gaming even when the speedometer looks fast.',
    points: [
      { title: 'Consecutive variation', text: 'Jitter is calculated as the mean absolute difference between adjacent measured round trips.' },
      { title: 'Call impact', text: 'Video conferencing is particularly sensitive to jitter above roughly 20–30 ms.' },
      { title: 'Actionable insight', text: 'The analysis explains whether instability appears to come from Wi-Fi, congestion or the wider network path.' },
    ],
    method: 'The browser collects a series of real round-trip timings to the test endpoint. Jitter is the average of absolute differences between consecutive samples; the raw timeline is shown on the result page.',
    faq: [
      { q: 'Can jitter be fixed?', a: 'Often yes: use a closer server, reduce Wi-Fi interference, prefer 5 GHz or Ethernet, and limit background uploads during calls.' },
      { q: 'Is jitter the same as packet loss?', a: 'No. Jitter is timing variation; packet loss is data that never arrives. They can occur together but are separate metrics.' },
    ],
  },
];

@Component({
  selector: 'nv-service-page',
  imports: [IconComponent, RouterLink],
  template: `
    @if (content(); as c) {
      <div class="nv-container nv-container--narrow">
        <div class="page-head"><span class="eyebrow">{{ c.eyebrow }}</span><h1>{{ c.title }}</h1><p>{{ c.intro }}</p>
          <div class="nv-row"><a class="btn btn--primary" routerLink="/"><nv-icon name="play" [size]="16"/> Start {{ c.title }}</a>
          <a class="btn" routerLink="/guides">Read the guides</a></div>
        </div>
        <div class="nv-grid nv-grid--3">
          @for (p of c.points; track p.title) {
            <div class="panel panel--pad"><nv-icon name="check" [size]="20"/><h3 style="margin-top:.8rem">{{ p.title }}</h3><p class="small muted">{{ p.text }}</p></div>
          }
        </div>
        <section class="panel panel--pad" style="margin-top:1.5rem">
          <h2>How the measurement works</h2><p class="text-2">{{ c.method }}</p>
          <p class="small muted">All values are produced by live transfers from your browser. If the measurement API is unavailable, the test reports an error rather than showing sample data.</p>
        </section>
        <section style="margin-top:2rem"><h2>Frequently asked questions</h2>
          @for (f of c.faq; track f.q) {
            <details class="panel panel--pad" style="margin-top:.7rem"><summary><strong>{{ f.q }}</strong></summary><p class="text-2 small" style="margin-top:.8rem">{{ f.a }}</p></details>
          }
        </section>
      </div>
    }`,
})
export class ServicePage {
  private route = inject(ActivatedRoute);
  private seo = inject(SeoService);
  readonly content = computed(() => CONTENT.find(c => this.route.snapshot.url[0]?.path === c.path) ?? CONTENT[0]);
  constructor() {
    const c = this.content();
    this.seo.set({ title: c.title, description: c.description, path: `/${c.path}` });
  }
}
