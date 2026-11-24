import { Component, inject } from '@angular/core';
import { IconComponent } from '../../shared/icon/icon';
import { SeoService } from '../../core/services/seo.service';
import { GUIDES } from './guide-data';

/** All guide content lives on this single page; no detail stubs or filler links. */
@Component({
  selector: 'nv-guides-page',
  imports: [IconComponent],
  template: `
    <div class="nv-container">
      <div class="page-head"><span class="eyebrow">Knowledge base</span><h1>Internet guides</h1><p>Practical, measurement-based explanations of speed, latency, Wi-Fi and network diagnostics.</p></div>
      <nav class="panel panel--pad toc" aria-label="Guide contents">
        @for (g of guides; track g.slug) { <a [href]="'#' + g.slug">{{ g.title }}</a> }
      </nav>
      @for (g of guides; track g.slug) {
        <article class="panel panel--pad guide" [id]="g.slug">
          <div class="nv-row" style="justify-content:space-between;gap:.8rem;flex-wrap:wrap">
            <span class="chip">{{ g.category }}</span>
            <span class="tiny muted"><nv-icon name="clock" [size]="13"/> {{ g.readMinutes }} min read</span>
          </div>
          <h2>{{ g.title }}</h2>
          <p class="text-2 muted">{{ g.description }}</p>
          @for (section of g.sections; track section.heading) {
            <section class="guide__section">
              <h3>{{ section.heading }}</h3>
              @for (p of section.paragraphs; track p) { <p>{{ p }}</p> }
              @if (section.bullets?.length) {
                <ul>@for (b of section.bullets; track b) { <li>{{ b }}</li> }</ul>
              }
            </section>
          }
        </article>
      }
    </div>`,
  styles: `.toc { display:flex; flex-wrap:wrap; gap:.5rem 1rem; margin-bottom:1rem; }
           .toc a { color:var(--nv-accent); font-size:.8rem; }
           .guide { margin-bottom:1rem; scroll-margin-top:90px; }
           .guide h2 { margin:.7rem 0 .3rem; }
           .guide__section { margin-top:1.2rem; }
           .guide__section h3 { font-size:1rem; margin-bottom:.4rem; }
           .guide__section p, .guide__section li { font-size:.86rem; line-height:1.6; color:var(--nv-text-2); }
           .guide__section ul { padding-left:1.2rem; }`,
})
export class GuidesPage {
  readonly guides = GUIDES;
  private seo = inject(SeoService);
  constructor() { this.seo.set({ title: 'Internet Guides', description: 'Guides to internet speed, jitter, ping, Wi-Fi optimisation, ISP information and global statistics.', path: '/guides' }); }
}
