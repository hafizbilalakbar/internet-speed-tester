import { Component, input } from '@angular/core';

@Component({
  selector: 'nv-brand',
  template: `
    <span class="brand" [class.brand--sm]="small()">
      <svg class="brand__mark" viewBox="0 0 64 64" aria-hidden="true">
        <defs><linearGradient id="nvBrandGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2AF5C8"/><stop offset="1" stop-color="#4F6BFF"/></linearGradient></defs>
        <path d="M52 15v34M12 15v34M12 15l40 34M52 15 12 49" stroke="url(#nvBrandGrad)" stroke-width="2" fill="none" opacity=".4"/>
        <path d="M40 10 19 38h12l-5 17 19-27H33z" fill="url(#nvBrandGrad)"/>
        <circle cx="52" cy="15" r="2.8" fill="#2AF5C8"/><circle cx="12" cy="49" r="2.8" fill="#4F6BFF"/>
      </svg>
      @if (!markOnly()) { <span class="brand__word">netvelox</span> }
    </span>`,
  styles: `
    .brand { display: inline-flex; align-items: center; gap: .55rem; font-family: var(--nv-display); font-weight: 700; font-size: 1.3rem; letter-spacing: -.05em; color: var(--nv-text); }
    .brand--sm { font-size: 1.05rem; }
    .brand__mark { width: 34px; height: 34px; }
    .brand--sm .brand__mark { width: 27px; height: 27px; }
  `,
})
export class BrandComponent {
  readonly small = input(false);
  readonly markOnly = input(false);
}
