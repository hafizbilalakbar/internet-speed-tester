import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IconComponent } from '../../shared/icon/icon';
import { SeoService } from '../../core/services/seo.service';
import { GUIDES } from './guide-data';

@Component({
  selector: 'nv-guide-detail-page',
  imports: [RouterLink, IconComponent],
  template: `
    @if (guide(); as g) {
      <article class="nv-container nv-container--narrow prose" style="padding:3rem 0">
        <a class="small" routerLink="/guides">← All guides</a>
        <span class="eyebrow" style="display:block;margin-top:1.5rem">{{ g.category }} · {{ g.readMinutes }} min read</span>
        <h1>{{ g.title }}</h1><p class="text-2">{{ g.description }}</p>
        @for (s of g.sections; track s.heading) {
          <section><h2>{{ s.heading }}</h2>
            @for (p of s.paragraphs; track p) { <p>{{ p }}</p> }
            @if (s.bullets) { <ul>@for (b of s.bullets; track b) { <li>{{ b }}</li> }</ul> }
          </section>
        }
        <div class="panel panel--pad" style="margin-top:2rem">
          <h3>Put it into practice</h3>
          <p class="small text-2">Run a full measurement to see these metrics on your own connection.</p>
          <a class="btn btn--primary" routerLink="/"><nv-icon name="play" [size]="16"/> Start a speed test</a>
        </div>
      </article>
    } @else {
      <div class="nv-container page-head"><h1>Guide not found</h1><a class="btn" routerLink="/guides">Browse guides</a></div>
    }`,
})
export class GuideDetailPage {
  private route = inject(ActivatedRoute);
  private seo = inject(SeoService);
  readonly guide = computed(() => GUIDES.find(g => g.slug === this.route.snapshot.paramMap.get('slug')) ?? null);
  constructor() {
    const g = this.guide();
    this.seo.set({ title: g?.title ?? 'Guide', description: g?.description ?? 'Internet guide', path: `/guides/${g?.slug ?? ''}` });
  }
}
