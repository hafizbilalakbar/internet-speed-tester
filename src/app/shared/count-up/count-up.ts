import { Directive, ElementRef,inject, Input, NgZone, OnChanges, OnDestroy } from '@angular/core';

/** Animates a numeric readout toward its latest real value entirely outside NgZone.
 *  Only the DOM text is touched per frame: no change detection, no signals, no allocations. */
@Directive({ selector: '[nvCountUp]', standalone: true })
export class CountUpDirective implements OnChanges, OnDestroy {
  @Input('nvCountUp') value: number | null | undefined = null;
  @Input() nvDecimals = 2;
  @Input() nvSuffix = '';

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);
  private target = 0;
  private current = 0;
  private frame: number | null = null;
  private started = false;

  ngOnChanges(): void {
    if (this.value === null || this.value === undefined || !Number.isFinite(this.value)) {
      this.stop();
      this.el.nativeElement.textContent = '—';
      return;
    }
    this.target = Math.max(0, this.value);
    if (!this.started) {
      this.started = true;
      this.current = this.target;
      this.write();
      return;
    }
    this.zone.runOutsideAngular(() => {
      if (this.frame !== null) return;
      const tick = () => {
        const diff = this.target - this.current;
        this.current += diff * 0.18;
        if (Math.abs(diff) < 0.005) this.current = this.target;
        this.write();
        if (this.current !== this.target) this.frame = requestAnimationFrame(tick);
        else this.frame = null;
      };
      this.frame = requestAnimationFrame(tick);
    });
  }

  private write(): void {
    const decimals = this.nvDecimals;
    this.el.nativeElement.textContent = `${this.current.toFixed(decimals)}${this.nvSuffix}`;
  }

  private stop(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  ngOnDestroy(): void { this.stop(); }
}
