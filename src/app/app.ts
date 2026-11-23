import { Component, inject } from '@angular/core';
import { NavigationStart, Router, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
  private readonly test = inject(SpeedTestService);
  private readonly router = inject(Router);

  constructor() {
    // Abort every in-flight measurement, timer and animation when leaving the test page.
    this.router.events.pipe(takeUntilDestroyed()).subscribe(event => {
      if (event instanceof NavigationStart && this.test.isRunning()) this.test.cancel();
    });
  }
}
