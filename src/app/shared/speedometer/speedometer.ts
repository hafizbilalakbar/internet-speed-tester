import {
  AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, NgZone, OnDestroy,
  computed, effect, inject, input, viewChild,
} from '@angular/core';
import { ScoringService } from '../../core/services/scoring.service';

export const GAUGE = {
  cx: 200, cy: 200, radius: 150,
  startAngle: -135, endAngle: 135,
  needleTipRadius: 112, needleBaseRadius: 15, needleHalfWidth: 4.5,
  labelRadius: 166,
} as const;

export interface GaugePoint { x: number; y: number; }
export interface Tick { x1: number; y1: number; x2: number; y2: number; major: boolean; value: number; }
export interface GaugeLabel { x: number; y: number; text: string; anchor: 'start' | 'end' | 'middle'; }

/** Speedtest.net-style non-linear scale. */
export const SCALE_BREAKPOINTS = [0, 5, 10, 50, 100, 250, 500, 750, 1000];

const INTRO_UP_START_MS = 600;
const INTRO_UP_END_MS = 1400;
const INTRO_TOTAL_MS = 2000;

function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }
function ramp(elapsed: number, start: number, end: number): number { return clamp01((elapsed - start) / (end - start)); }
function easeInOutCubic(t: number): number {
  const v = clamp01(t);
  return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2;
}
function easeOutQuad(t: number): number { const v = clamp01(t); return 1 - (1 - v) * (1 - v); }

/** One sweep value: 0 → 1 → 0, with a small spring settling exactly on the pivot. */
export function introSweepFraction(elapsedMs: number): number {
  if (elapsedMs <= INTRO_UP_START_MS) return 0;
  if (elapsedMs < INTRO_UP_END_MS) return easeInOutCubic((elapsedMs - INTRO_UP_START_MS) / (INTRO_UP_END_MS - INTRO_UP_START_MS));
  if (elapsedMs < INTRO_TOTAL_MS) {
    const p = (elapsedMs - INTRO_UP_END_MS) / (INTRO_TOTAL_MS - INTRO_UP_END_MS);
    const base = 1 - easeOutQuad(Math.min(1, p * 1.25));
    const spring = 0.05 * Math.exp(-1.5 * p) * Math.sin(6 * p) * (1 - p);
    return base + spring;
  }
  return 0;
}

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

/** The one value that drives needle, arc, number and colour, including the final result. */
export function meterValue(value: number | null | undefined, showResult: boolean, resultDown: number | null | undefined): number {
  const displayed = showResult ? resultDown : value;
  return Math.max(0, Number(displayed) || 0);
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

/** Labels stay inside the 0–400 viewBox with 10px padding; edge labels use start/end anchors. */
export function gaugeLabels(): GaugeLabel[] {
  const pad = 10;
  return SCALE_BREAKPOINTS.map((value, i) => {
    const angle = GAUGE.startAngle + (i / 8) * (GAUGE.endAngle - GAUGE.startAngle);
    const p = polarPoint(GAUGE.cx, GAUGE.cy, GAUGE.labelRadius, angle);
    const text = String(value);
    const half = text.length * 4.1;
    const x = Math.max(pad + half, Math.min(400 - pad - half, p.x));
    const y = Math.max(pad + 7, Math.min(400 - pad - 7, p.y));
    const anchor = x - half < pad ? 'start' : x + half > 400 - pad ? 'end' : 'middle';
    return { x, y, text, anchor };
  });
}

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
        <circle #dialGlow cx="200" cy="200" r="184" fill="url(#nvDialGlow)"/>
        <g #ringsGroup>
          <circle cx="200" cy="200" r="177" fill="none" stroke="var(--nv-border)" stroke-width="2"/>
          <circle cx="200" cy="200" r="166" fill="none" stroke="var(--nv-border)" stroke-width="1" opacity=".7"/>
          <path class="speedo__track" [attr.d]="trackPath"/>
        </g>
        <g #ticksGroup class="speedo__ticks">
          @for (t of ticks; track $index) {
            <line [attr.x1]="t.x1" [attr.y1]="t.y1" [attr.x2]="t.x2" [attr.y2]="t.y2" [class.major]="t.major"/>
          }
        </g>
        <g #labelsGroup class="speedo__labels">
          @for (l of labels; track l.text) {
            <text [attr.x]="l.x" [attr.y]="l.y" [attr.text-anchor]="l.anchor" dominant-baseline="central">{{ l.text }}</text>
          }
        </g>
        <path #progressPath class="speedo__progress" [attr.d]="trackPath" pathLength="100" stroke-dasharray="0 100" stroke="url(#nvProgressGrad)"/>
        <g #needleGroup class="speedo__needle">
          <path #needleFill [attr.d]="needlePath" fill="var(--nv-accent)" filter="url(#nvNeedleShadow)"/>
          <path [attr.d]="needleInnerPath" fill="rgba(255,255,255,.3)"/>
        </g>
        <g #pivotGroup>
          <circle #pivotRing cx="200" cy="200" r="13" fill="var(--nv-panel)" stroke="var(--nv-accent)" stroke-width="2.5"/>
          <circle cx="200" cy="200" r="8" fill="var(--nv-panel-2)" stroke="var(--nv-border-strong)" stroke-width="1.5"/>
          <circle #pivotDot cx="200" cy="200" r="4.5" fill="var(--nv-accent)"/>
        </g>
        @if (showResult()) {
          <text class="speedo__result-down" x="200" y="252" text-anchor="middle">↓ {{ resultDown().toFixed(1) }}</text>
          <text class="speedo__result-up" x="200" y="292" text-anchor="middle">↑ {{ resultUp().toFixed(1) }}</text>
          <text class="speedo__unit" x="200" y="314" text-anchor="middle">{{ unit() }}</text>
        } @else {
          <g #readingGroup>
            <text #valueText class="speedo__value" x="200" y="266" text-anchor="middle">0.00</text>
            <text class="speedo__unit" x="200" y="292" text-anchor="middle">{{ unit() }}</text>
          </g>
        }
        <text #phaseText class="speedo__phase" x="200" y="344" text-anchor="middle" fill="var(--nv-accent)">{{ label() }}</text>
      </svg>
    </div>`,
  styles: `
    :host { display: block; }
    .speedo-wrap { position: relative; width: clamp(200px, 28vw, 260px); max-width: 100%; aspect-ratio: 1; margin-inline: auto; }
    .speedo { width: 100%; height: 100%; overflow: hidden; }
    .speedo__ticks line { stroke: var(--nv-border-strong); stroke-linecap: round; stroke-width: 1.2; }
    .speedo__ticks line.major { stroke: var(--nv-text-2); stroke-width: 2.4; }
    .speedo__labels text { fill: var(--nv-muted); font-family: var(--nv-mono); font-size: 12px; font-weight: 700; }
    .speedo__track { fill: none; stroke: var(--nv-panel-3); stroke-width: 11; }
    .speedo__progress { fill: none; stroke-width: 11; stroke-linecap: round; }
    .speedo__needle { transform-box: view-box; transform-origin: 200px 200px; transform: rotate(-135deg); }
    .speedo__value { font-family: var(--nv-mono); font-weight: 800; font-size: 48px; fill: var(--nv-text); letter-spacing: -.04em; font-variant-numeric: tabular-nums; }
    .speedo__result-down { font-family: var(--nv-mono); font-weight: 800; font-size: 36px; fill: var(--nv-text); letter-spacing: -.04em; font-variant-numeric: tabular-nums; }
    .speedo__result-up { font-family: var(--nv-mono); font-weight: 800; font-size: 28px; fill: var(--nv-text-2); letter-spacing: -.03em; font-variant-numeric: tabular-nums; }
    .speedo__unit { font-family: var(--nv-display); font-size: 12px; font-weight: 700; fill: var(--nv-muted); letter-spacing: .16em; }
    .speedo__phase { font-family: var(--nv-font); font-size: 11px; font-weight: 800; letter-spacing: .14em; }
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
  /** At completion the dial keeps showing the final download while the upload result stays visible. */
  readonly showResult = input(false);
  readonly resultDown = input(0);
  readonly resultUp = input(0);

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
  private readonly dialGlowRef = viewChild<ElementRef<SVGCircleElement>>('dialGlow');
  private readonly ringsRef = viewChild<ElementRef<SVGGElement>>('ringsGroup');
  private readonly ticksRef = viewChild<ElementRef<SVGGElement>>('ticksGroup');
  private readonly labelsRef = viewChild<ElementRef<SVGGElement>>('labelsGroup');
  private readonly pivotRef = viewChild<ElementRef<SVGGElement>>('pivotGroup');
  private readonly readingRef = viewChild<ElementRef<SVGGElement>>('readingGroup');

  readonly cx = GAUGE.cx;
  readonly cy = GAUGE.cy;
  readonly ticks = TICKS;
  readonly labels = gaugeLabels();
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
  readonly ariaLabel = computed(() => this.showResult()
    ? `Download ${this.resultDown().toFixed(1)}, upload ${this.resultUp().toFixed(1)} ${this.unit()}` 
    : `${this.label() || 'Speed'}: ${this.value().toFixed(1)} ${this.unit()}`);

  private target = 0;
  private current = 0;
  private frame: number | null = 0;
  private lastFrameAt = 0;
  private introStart = 0;
  private introActive = false;
  private introStylesApplied = false;
  private holdNeutralColor = false;
  private currentColor = '';
  private lastText = '';
  private lastLevel: string | null = null;

  private readonly colors: Record<string, string> = {
    excellent: 'var(--nv-excellent)', good: 'var(--nv-good)', moderate: 'var(--nv-moderate)',
    poor: 'var(--nv-poor)', critical: 'var(--nv-critical)', unknown: 'var(--nv-accent)',
  };

  constructor() {
    effect(() => {
      // One value drives the needle, arc, big number and colour, including at completion.
      this.target = meterValue(this.value(), this.showResult(), this.resultDown());
      if (this.showResult()) {
        this.holdNeutralColor = false;
        this.applyColor(this.color() || this.valueColor(this.scoring.level('downloadMbps', this.target)));
      }
    });
    effect(() => {
      const active = this.intro();
      if (active && !this.introActive) {
        this.introActive = true;
        this.introStart = performance.now();
        this.current = 0;
        this.holdNeutralColor = true;
        this.applyColor(this.color() || 'var(--nv-accent)');
        this.lastLevel = 'unknown';
      } else if (!active && this.introActive) {
        this.endIntro();
      }
    });
    effect(() => {
      const el = this.phaseRef()?.nativeElement;
      if (el) el.textContent = this.label();
    });
  }

  ngAfterViewInit(): void {
    this.applyColor(this.color());
    this.zone.runOutsideAngular(() => {
      const tick = (now: number) => {
        const dt = this.lastFrameAt ? Math.min(64, now - this.lastFrameAt) : 16;
        this.lastFrameAt = now;
        const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (this.introActive) {
          const elapsed = now - this.introStart;
          if (reduced || elapsed >= INTRO_TOTAL_MS) {
            this.current = 0;
            this.render();
            this.endIntro();
          } else {
            const fraction = introSweepFraction(elapsed);
            // Feed the inverse piecewise scale so the single fraction and the dial agree.
            this.current = gaugeValueAtFraction(fraction);
            this.applyIntroVisual(elapsed, fraction);
            this.render();
          }
        } else {
          // Frame-rate independent easing toward exactly one speed value.
          this.current = reduced ? this.target
            : this.current + (this.target - this.current) * (1 - Math.exp(-dt / 85));
          if (Math.abs(this.target - this.current) < 0.02) this.current = this.target;
          this.render();
        }
        this.frame = requestAnimationFrame(tick);
      };
      this.frame = requestAnimationFrame(tick);
    });
  }

  ngOnDestroy(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.endIntro();
  }

  /** Staggered power-on plus one sweep fraction that drives ticks, labels, arc and glow. */
  private applyIntroVisual(elapsed: number, fraction: number): void {
    this.introStylesApplied = true;
    const color = this.currentColor || '#2af5c8';
    const sweeping = elapsed >= INTRO_UP_START_MS;
    const passed = Math.max(0, Math.min(1, fraction));
    const rings = ramp(elapsed, 0, 130);
    const labels = ramp(elapsed, 300, 430);
    const pivot = ramp(elapsed, 430, 510);
    const reading = ramp(elapsed, 510, 600);

    this.ringsRef()?.nativeElement.style.setProperty('opacity', rings.toFixed(3));
    this.dialGlowRef()?.nativeElement.style.setProperty('opacity', (rings * (0.35 + 0.65 * passed)).toFixed(3));
    this.gradGlowRef()?.nativeElement.setAttribute('stop-opacity', (0.04 + 0.2 * passed).toFixed(3));
    this.needleRef()?.nativeElement.style.setProperty('opacity', pivot.toFixed(3));
    this.pivotRef()?.nativeElement.style.setProperty('opacity', pivot.toFixed(3));
    this.readingRef()?.nativeElement.style.setProperty('opacity', reading.toFixed(3));
    this.phaseRef()?.nativeElement.style.setProperty('opacity', reading.toFixed(3));

    const tickEls = this.ticksRef()?.nativeElement.querySelectorAll('line') ?? [];
    tickEls.forEach((line, i) => {
      const powered = ramp(elapsed, 90 + i * 5, 135 + i * 5);
      const lit = sweeping && fraction >= i / 32 - 0.001;
      line.style.setProperty('opacity', (lit ? 1 : powered * 0.85).toFixed(3));
      line.style.setProperty('stroke', lit ? color : '');
    });
    const labelEls = this.labelsRef()?.nativeElement.querySelectorAll('text') ?? [];
    labelEls.forEach((text, i) => {
      const lit = sweeping && fraction >= i / 8 - 0.001;
      text.style.setProperty('opacity', (lit ? 1 : labels * 0.8).toFixed(3));
      text.style.setProperty('fill', lit ? color : '');
    });
  }

  private endIntro(): void {
    this.introActive = false;
    this.current = 0;
    this.resetIntroStyles();
  }

  private resetIntroStyles(): void {
    if (!this.introStylesApplied) return;
    this.introStylesApplied = false;
    const clear = (el: Element | null | undefined, prop?: string) => {
      if (!el) return;
      if (prop) (el as HTMLElement | SVGElement).style.removeProperty(prop);
      else el.removeAttribute('style');
    };
    clear(this.ringsRef()?.nativeElement);
    clear(this.dialGlowRef()?.nativeElement);
    clear(this.needleRef()?.nativeElement, 'opacity');
    clear(this.pivotRef()?.nativeElement);
    clear(this.readingRef()?.nativeElement);
    clear(this.phaseRef()?.nativeElement, 'opacity');
    this.gradGlowRef()?.nativeElement.setAttribute('stop-opacity', '.16');
    this.ticksRef()?.nativeElement.querySelectorAll('line').forEach(line => {
      line.style.removeProperty('opacity');
      line.style.removeProperty('stroke');
    });
    this.labelsRef()?.nativeElement.querySelectorAll('text').forEach(text => {
      text.style.removeProperty('opacity');
      text.style.removeProperty('fill');
    });
  }

  /** One animated value drives the needle, arc and colour. No signals are written here. */
  private render(): void {
    const value = Math.max(0, this.current);
    const fraction = gaugeFraction(value, this.max());
    const angle = GAUGE.startAngle + fraction * (GAUGE.endAngle - GAUGE.startAngle);
    const needle = this.needleRef()?.nativeElement;
    const progress = this.progressRef()?.nativeElement;
    if (needle) needle.style.transform = `rotate(${angle.toFixed(2)}deg)`;
    if (progress) progress.setAttribute('stroke-dasharray', `${(fraction * 100).toFixed(2)} 100`);
    // The startup sweep is visual only: the big number stays at zero, never at 1000.
    const text = this.introActive ? '0.00'
      : value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(2);
    const valueEl = this.valueRef()?.nativeElement;
    if (valueEl && text !== this.lastText) { valueEl.textContent = text; this.lastText = text; }
    if (!this.color()) {
      if (!this.introActive && this.holdNeutralColor && (value > 0.01 || this.showResult())) this.holdNeutralColor = false;
      const level = this.holdNeutralColor ? 'unknown'
        : this.scoring.level('downloadMbps', this.showResult() ? this.resultDown() : value);
      if (level !== this.lastLevel) { this.lastLevel = level; this.applyColor(this.valueColor(level)); }
    }
  }

  private valueColor(level: string): string { return this.colors[level] ?? this.colors['unknown']; }

  private applyColor(input: string): void {
    let color = input;
    const match = input.match(/var\((--[^)]+)\)/);
    if (match) color = getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim() || '#2af5c8';
    this.currentColor = color;
    this.needleFillRef()?.nativeElement.setAttribute('fill', color);
    this.pivotRingRef()?.nativeElement.setAttribute('stroke', color);
    this.pivotDotRef()?.nativeElement.setAttribute('fill', color);
    this.gradStartRef()?.nativeElement.setAttribute('stop-color', color);
    this.gradEndRef()?.nativeElement.setAttribute('stop-color', color);
    this.gradGlowRef()?.nativeElement.setAttribute('stop-color', color);
    this.phaseRef()?.nativeElement.setAttribute('fill', color);
  }
}
