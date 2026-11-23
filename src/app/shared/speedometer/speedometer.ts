import {
  AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, NgZone, OnDestroy,
  computed, effect, inject, input, viewChild,
} from '@angular/core';
import { ScoringService } from '../../core/services/scoring.service';

export const GAUGE = {
  cx: 200, cy: 200, radius: 150,
  startAngle: -135, endAngle: 135,
  needleTipRadius: 112, needleBaseRadius: 15, needleHalfWidth: 4.5,
} as const;

export interface GaugePoint { x: number; y: number; }
export interface Tick { x1: number; y1: number; x2: number; y2: number; major: boolean; value: number; }
export interface GaugeLabel { x: number; y: number; text: string; anchor: 'start' | 'end' | 'middle'; }

/** Speedtest.net-style non-linear scale. */
export const SCALE_BREAKPOINTS = [0, 5, 10, 50, 100, 250, 500, 750, 1000];

export function polarPoint(cx: number, cy: number, radius: number, angleDeg: number): GaugePoint {
  const a = angleDeg * Math.PI / 180;
  return { x: cx + radius * Math.sin(a), y: cy - radius * Math.cos(a) };
}

export function gaugeFraction(value: number | null | undefined, max: number | null | undefined): number {
  const ceiling = Math.max(1, Number(max) || 1000);
  const v = Math.max(0, Number(value) || 0);
  if (v <= 0) return 0;
  if (v >= ceiling) return 1;
  for (let i = 0; i < SCALE_BREAKPOINTS.length - 1; i++) {
    const start = SCALE_BREAKPOINTS[i], end = SCALE_BREAKPOINTS[i + 1];
    if (v <= end) return i / 8 + ((v - start) / (end - start)) / 8;
  }
  return 1;
}

/** Inverse of the piecewise scale, used for tick labels and geometry tests. */
export function gaugeValueAtFraction(fraction: number, _max?: number | null): number {
  const f = Math.max(0, Math.min(1, fraction));
  if (f >= 1) return SCALE_BREAKPOINTS[SCALE_BREAKPOINTS.length - 1];
  const index = Math.min(7, Math.floor(f * 8));
  const within = f * 8 - index;
  return SCALE_BREAKPOINTS[index] + within * (SCALE_BREAKPOINTS[index + 1] - SCALE_BREAKPOINTS[index]);
}

export function gaugeAngle(value: number | null | undefined, max: number | null | undefined): number {
  return GAUGE.startAngle + gaugeFraction(value, max) * (GAUGE.endAngle - GAUGE.startAngle);
}

export function needleTip(angleDeg: number): GaugePoint {
  return polarPoint(GAUGE.cx, GAUGE.cy, GAUGE.needleTipRadius, angleDeg);
}

export function arcPath(cx: number, cy: number, radius: number, startAngle: number, endAngle: number): string {
  const s = polarPoint(cx, cy, radius, startAngle);
  const e = polarPoint(cx, cy, radius, endAngle);
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${radius} ${radius} 0 ${Math.abs(endAngle - startAngle) > 180 ? 1 : 0} ${endAngle >= startAngle ? 1 : 0} ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

const TICKS: Tick[] = Array.from({ length: 33 }, (_, i) => {
  const angle = GAUGE.startAngle + (i / 32) * (GAUGE.endAngle - GAUGE.startAngle);
  const segment = Math.min(7, Math.floor(i / 4));
  const major = i % 4 === 0;
  const inner = polarPoint(GAUGE.cx, GAUGE.cy, GAUGE.radius - (major ? 24 : 13), angle);
  const outer = polarPoint(GAUGE.cx, GAUGE.cy, GAUGE.radius - 7, angle);
  return { x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y, major, value: SCALE_BREAKPOINTS[segment] };
});

@Component({
  selector: 'nv-speedometer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="speedo-wrap" role="img" [attr.aria-label]="ariaLabel()">
      <svg class="speedo" viewBox="0 0 400 400" aria-hidden="true">
        <defs>
          <radialGradient id="nvDialGlow" cx="50%" cy="50%" r="65%">
            <stop offset="0" #gradGlow stop-color="var(--nv-accent)" stop-opacity=".16"/>
            <stop offset="1" stop-color="var(--nv-accent)" stop-opacity="0"/>
          </radialGradient>
          <linearGradient id="nvProgressGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" #gradStart stop-color="var(--nv-accent)" stop-opacity=".55"/>
            <stop offset="100%" #gradEnd stop-color="var(--nv-accent)" stop-opacity="1"/>
          </linearGradient>
          <filter id="nvNeedleShadow" x="-60%" y="-60%" width="220%" height="220%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,.45)"/>
          </filter>
        </defs>
        <circle cx="200" cy="200" r="184" fill="url(#nvDialGlow)"/>
        <circle cx="200" cy="200" r="177" fill="none" stroke="var(--nv-border)" stroke-width="2"/>
        <circle cx="200" cy="200" r="166" fill="none" stroke="var(--nv-border)" stroke-width="1" opacity=".7"/>
        <g class="speedo__ticks">
          @for (t of ticks; track $index) {
            <line [attr.x1]="t.x1" [attr.y1]="t.y1" [attr.x2]="t.x2" [attr.y2]="t.y2" [class.major]="t.major"/>
          }
        </g>
        <g class="speedo__labels">
          @for (l of labels(); track l.text) {
            <text [attr.x]="l.x" [attr.y]="l.y" [attr.text-anchor]="l.anchor" dominant-baseline="middle">{{ l.text }}</text>
          }
        </g>
        <path class="speedo__track" [attr.d]="trackPath"/>
        <path #progressPath class="speedo__progress" [attr.d]="trackPath" pathLength="100" stroke-dasharray="0 100" stroke="url(#nvProgressGrad)"/>
        <g #needleGroup class="speedo__needle">
          <path #needleFill [attr.d]="needlePath" fill="var(--nv-accent)" filter="url(#nvNeedleShadow)"/>
          <path [attr.d]="needleInnerPath" fill="rgba(255,255,255,.3)"/>
        </g>
        <circle #pivotRing cx="200" cy="200" r="13" fill="var(--nv-panel)" stroke="var(--nv-accent)" stroke-width="2.5"/>
        <circle cx="200" cy="200" r="8" fill="var(--nv-panel-2)" stroke="var(--nv-border-strong)" stroke-width="1.5"/>
        <circle #pivotDot cx="200" cy="200" r="4.5" fill="var(--nv-accent)"/>
        <text #valueText class="speedo__value" x="200" y="268" text-anchor="middle">0.00</text>
        <text class="speedo__unit" x="200" y="293" text-anchor="middle">{{ unit() }}</text>
        <text #phaseText class="speedo__phase" x="200" y="334" text-anchor="middle" fill="var(--nv-accent)">{{ label() }}</text>
      </svg>
    </div>`,
  styles: `
    :host { display: block; }
    .speedo-wrap { position: relative; width: 100%; max-width: 250px; aspect-ratio: 1; margin-inline: auto; }
    .speedo { width: 100%; height: 100%; overflow: visible; }
    .speedo__ticks line { stroke: var(--nv-border-strong); stroke-linecap: round; stroke-width: 1.2; }
    .speedo__ticks line.major { stroke: var(--nv-text-2); stroke-width: 2.4; }
    .speedo__labels text { fill: var(--nv-muted); font-family: var(--nv-mono); font-size: 12px; font-weight: 700; }
    .speedo__track { fill: none; stroke: var(--nv-panel-3); stroke-width: 11; }
    .speedo__progress { fill: none; stroke-width: 11; stroke-linecap: round; }
    .speedo__needle { transform-box: view-box; transform-origin: 200px 200px; transform: rotate(-135deg); }
    .speedo__value { font-family: var(--nv-mono); font-weight: 800; font-size: 62px; fill: var(--nv-text); letter-spacing: -.05em; font-variant-numeric: tabular-nums; }
    .speedo__unit { font-family: var(--nv-display); font-size: 14px; font-weight: 700; fill: var(--nv-muted); letter-spacing: .16em; }
    .speedo__phase { font-family: var(--nv-font); font-size: 12px; font-weight: 800; letter-spacing: .14em; }
    @media (max-width: 640px) { .speedo-wrap { max-width: 230px; } }
  `,
})
export class SpeedometerComponent implements AfterViewInit, OnDestroy {
  readonly value = input(0);
  readonly max = input(1000);
  readonly unit = input('Mbps');
  readonly label = input('');
  /** Optional override; when empty the colour is derived from the same animated value. */
  readonly color = input('');
  /** Intro sweep runs once before the first measurement, outside NgZone. */
  readonly intro = input(false);

  private readonly zone = inject(NgZone);
  private readonly scoring = inject(ScoringService);
  private readonly needleRef = viewChild<ElementRef<SVGGElement>>('needleGroup');
  private readonly progressRef = viewChild<ElementRef<SVGPathElement>>('progressPath');
  private readonly valueRef = viewChild<ElementRef<SVGTextElement>>('valueText');
  private readonly phaseRef = viewChild<ElementRef<SVGTextElement>>('phaseText');
  private readonly needleFillRef = viewChild<ElementRef<SVGPathElement>>('needleFill');
  private readonly pivotRingRef = viewChild<ElementRef<SVGCircleElement>>('pivotRing');
  private readonly pivotDotRef = viewChild<ElementRef<SVGCircleElement>>('pivotDot');
  private readonly gradStartRef = viewChild<ElementRef<SVGStopElement>>('gradStart');
  private readonly gradEndRef = viewChild<ElementRef<SVGStopElement>>('gradEnd');
  private readonly gradGlowRef = viewChild<ElementRef<SVGStopElement>>('gradGlow');

  readonly cx = GAUGE.cx;
  readonly cy = GAUGE.cy;
  readonly ticks = TICKS;
  readonly trackPath = arcPath(GAUGE.cx, GAUGE.cy, GAUGE.radius, GAUGE.startAngle, GAUGE.endAngle);
  readonly needlePath = [
    `M ${GAUGE.cx - GAUGE.needleHalfWidth} ${GAUGE.cy + GAUGE.needleBaseRadius}`,
    `L ${GAUGE.cx} ${GAUGE.cy - GAUGE.needleTipRadius}`,
    `L ${GAUGE.cx + GAUGE.needleHalfWidth} ${GAUGE.cy + GAUGE.needleBaseRadius}`, 'Z',
  ].join(' ');
  readonly needleInnerPath = [
    `M ${GAUGE.cx - 1.6} ${GAUGE.cy + 10}`,
    `L ${GAUGE.cx} ${GAUGE.cy - (GAUGE.needleTipRadius - 12)}`,
    `L ${GAUGE.cx + 1.6} ${GAUGE.cy + 10}`, 'Z',
  ].join(' ');

  readonly labels = computed<GaugeLabel[]>(() => SCALE_BREAKPOINTS.map((_, i) => {
    const angle = GAUGE.startAngle + (i / 8) * (GAUGE.endAngle - GAUGE.startAngle);
    const p = polarPoint(GAUGE.cx, GAUGE.cy, GAUGE.radius + 20, angle);
    return { x: p.x, y: p.y, text: String(SCALE_BREAKPOINTS[i]), anchor: p.x > GAUGE.cx + 4 ? 'start' as const : p.x < GAUGE.cx - 4 ? 'end' as const : 'middle' as const };
  }));
  readonly ariaLabel = computed(() => `${this.label() || 'Speed'}: ${this.value().toFixed(1)} ${this.unit()}`);

  private target = 0;
  private current = 0;
  private frame: number | null = null;
  private introStart = 0;
  private introActive = false;
  private lastText = '';
  private lastLevel: string | null = null;

  private readonly colors: Record<string, string> = {
    excellent: 'var(--nv-excellent)', good: 'var(--nv-good)', moderate: 'var(--nv-moderate)',
    poor: 'var(--nv-poor)', critical: 'var(--nv-critical)', unknown: 'var(--nv-accent)',
  };

  private valueColor(value: number): string {
    return this.colors[this.scoring.level('downloadMbps', value)];
  }

  constructor() {
    effect(() => { this.target = Math.max(0, Number(this.value()) || 0); });
    effect(() => {
      const active = this.intro();
      if (active && !this.introActive) { this.introActive = true; this.introStart = performance.now(); this.current = 0; }
      if (!active) this.introActive = false;
      this.applyColor(this.color() || this.valueColor(this.current));
    });
    effect(() => {
      const text = this.label();
      const el = this.phaseRef()?.nativeElement;
      if (el) el.textContent = text;
    });
  }

  ngAfterViewInit(): void {
    this.applyColor(this.color());
    this.zone.runOutsideAngular(() => {
      const tick = () => {
        const now = performance.now();
        if (this.introActive) {
          const elapsed = now - this.introStart;
          const peak = Math.max(1, Number(this.max()) || 1000);
          if (elapsed < 480) this.current = peak * (1 - Math.pow(1 - elapsed / 480, 3));
          else if (elapsed < 960) this.current = peak * (1 - (elapsed - 480) / 480);
          else { this.current = 0; this.introActive = false; }
        } else {
          const diff = this.target - this.current;
          this.current += diff * 0.2;
          if (Math.abs(diff) < 0.02) this.current = this.target;
        }
        this.render();
        this.frame = requestAnimationFrame(tick);
      };
      this.frame = requestAnimationFrame(tick);
    });
  }

  ngOnDestroy(): void { if (this.frame !== null) cancelAnimationFrame(this.frame); }

  /** One animated value drives the needle, arc and big number. No signals are written here. */
  private render(): void {
    const value = Math.max(0, this.current);
    const angle = GAUGE.startAngle + gaugeFraction(value, this.max()) * (GAUGE.endAngle - GAUGE.startAngle);
    const needle = this.needleRef()?.nativeElement;
    const progress = this.progressRef()?.nativeElement;
    if (needle) needle.style.transform = `rotate(${angle.toFixed(2)}deg)`;
    if (progress) progress.setAttribute('stroke-dasharray', `${(gaugeFraction(value, this.max()) * 100).toFixed(2)} 100`);
    const text = value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(2);
    const valueEl = this.valueRef()?.nativeElement;
    if (valueEl && text !== this.lastText) { valueEl.textContent = text; this.lastText = text; }
    if (!this.color()) {
      const level = this.scoring.level('downloadMbps', value);
      if (level !== this.lastLevel) {
        this.lastLevel = level;
        this.applyColor(this.valueColor(value));
      }
    }
  }

  private applyColor(input: string): void {
    let color = input;
    const match = input.match(/var\((--[^)]+)\)/);
    if (match) color = getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim() || '#2af5c8';
    this.needleFillRef()?.nativeElement.setAttribute('fill', color);
    this.pivotRingRef()?.nativeElement.setAttribute('stroke', color);
    this.pivotDotRef()?.nativeElement.setAttribute('fill', color);
    this.gradStartRef()?.nativeElement.setAttribute('stop-color', color);
    this.gradEndRef()?.nativeElement.setAttribute('stop-color', color);
    this.gradGlowRef()?.nativeElement.setAttribute('stop-color', color);
    this.phaseRef()?.nativeElement.setAttribute('fill', color);
  }
}
