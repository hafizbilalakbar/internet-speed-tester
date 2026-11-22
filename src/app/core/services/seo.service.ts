import { Injectable, inject } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';
import { AppConfigService } from './app-config.service';

@Injectable({ providedIn: 'root' })
export class SeoService {
  private config = inject(AppConfigService);

  constructor(private title: Title, private meta: Meta) {}

  set(page: { title: string; description: string; path?: string; type?: string; noIndex?: boolean }): void {
    const full = page.title.includes('Netvelox') ? page.title : `${page.title} | Netvelox`;
    this.title.setTitle(full);
    this.meta.updateTag({ name: 'description', content: page.description });
    this.meta.updateTag({ property: 'og:title', content: full });
    this.meta.updateTag({ property: 'og:description', content: page.description });
    this.meta.updateTag({ property: 'og:type', content: page.type ?? 'website' });
    this.meta.updateTag({ name: 'twitter:title', content: full });
    this.meta.updateTag({ name: 'twitter:description', content: page.description });
    this.meta.updateTag({ name: 'robots', content: page.noIndex ? 'noindex, nofollow, noarchive' : 'index, follow, max-snippet:-1, max-image-preview:large' });
    if (page.path) {
      const url = `${this.config.siteUrl.replace(/\/$/, '')}${page.path}`;
      this.meta.updateTag({ property: 'og:url', content: url });
      let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical); }
      canonical.href = page.noIndex ? `${this.config.siteUrl.replace(/\/$/, '')}/` : url;
    }
  }
}
