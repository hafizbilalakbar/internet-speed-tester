import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../shared/icon/icon';
import { SeoService } from '../../core/services/seo.service';

@Component({
  selector: 'nv-not-found-page',
  imports: [RouterLink, IconComponent],
  template: `
    <div class="nv-container center" style="padding:6rem 0">
      <nv-icon name="network" [size]="48"/>
      <span class="eyebrow" style="display:block;margin-top:1.5rem">Error 404</span>
      <h1>Signal lost</h1>
      <p class="text-2">This page does not exist — but your connection might be just fine.</p>
      <div class="nv-row" style="justify-content:center;margin-top:1.5rem">
        <a class="btn btn--primary" routerLink="/"><nv-icon name="gauge" [size]="16"/> Test your speed</a>
        <a class="btn" routerLink="/guides">Browse guides</a>
      </div>
    </div>`,
})
export class NotFoundPage {
  constructor() { inject(SeoService).set({ title: 'Page Not Found', description: 'The requested page was not found.', path: '/404' }); }
}
