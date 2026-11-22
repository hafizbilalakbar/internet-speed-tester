import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../shared/icon/icon';
import { SeoService } from '../../core/services/seo.service';
import { GUIDES } from './guide-data';

@Component({
  selector: 'nv-guides-page',
  imports: [RouterLink, IconComponent],
  template: `
    <div class="nv-container">
      <div class="page-head"><span class="eyebrow">Knowledge base</span><h1>Internet guides</h1><p>Practical, measurement-based explanations of speed, latency, Wi-Fi and network diagnostics.</p></div>
      <div class="nv-grid nv-grid--3">
        @for (g of guides; track g.slug) {
          <a class="panel panel--pad guide-card" [routerLink]="['/guides', g.slug]">
            <span class="chip">{{ g.category }}</span>
            <h3 style="margin-top:.8rem">{{ g.title }}</h3>
            <p class="small muted">{{ g.description }}</p>
            <span class="tiny muted"><nv-icon name="clock" [size]="13"/> {{ g.readMinutes }} min read</span>
          </a>
        }
      </div>
    </div>`,
  styles: `.guide-card { color:var(--nv-text); text-decoration:none; transition:transform .2s,border-color .2s; }
           .guide-card:hover { text-decoration:none; transform:translateY(-3px); border-color:var(--nv-accent); }
           .guide-card .tiny { display:inline-flex; align-items:center; gap:.3rem; }`,
})
export class GuidesPage {
  readonly guides = GUIDES;
  private seo = inject(SeoService);
  constructor() { this.seo.set({ title: 'Internet Guides', description: 'Guides to internet speed, jitter, ping, Wi-Fi optimisation, ISP information and global statistics.', path: '/guides' }); }
}
