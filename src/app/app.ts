import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './layout/header/header';
import { FooterComponent } from './layout/footer/footer';
import { SpeedTestService } from './core/services/speed-test.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, HeaderComponent, FooterComponent],
  template: `
    <a class="skip-link" href="#main">Skip to content</a>
    <nv-header />
    <main id="main"><router-outlet /></main>
    <nv-footer />
  `,
  styles: `.skip-link { position: absolute; left: -999px; top: 0; z-index: 100; background: var(--nv-panel); padding: .6rem 1rem; border-radius: 8px; }
           .skip-link:focus { left: 1rem; top: 1rem; }`,
})
export class App {
  constructor() { inject(SpeedTestService); }
}
