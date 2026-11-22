import { ChangeDetectionStrategy, Component, NO_ERRORS_SCHEMA, computed, effect, inject, signal } from '@angular/core';

/** Drive the needle smoothly toward a target value using rAF outside Angular change detection.
 *  Returns a teardown function that should be called to stop the animation. */
export function driveNeedle(
  startValue: number,
  targetValue: number,
  speed: number, // pixels per frame or units per frame
  onUpdate: (value: number) => void,
  onComplete?: () => void
): () => void {
  let animating = true;
  const tick = () => {
    if (!animating) return;
    // Move toward target with easing, stop when very close
    const diff = targetValue - startValue;
    const step = diff * 0.1; // 10% of remaining distance per frame
    const newValue = Math.abs(diff) < 0.1 ? targetValue : startValue + step;
    onUpdate(newValue);
    if (Math.abs(newValue - targetValue) <= 0.01) {
      onUpdate(targetValue);
      if (onComplete) onComplete();
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return () => { animating = false; };
}

export const GAUGE = {
  cx: 200,
  cy: 200,
  radius: 150,
  startAngle: -135,
  endAngle: 135,
  needleTipRadius: 112,
  needleBaseRadius: 20,
  needleHalfWidth: 6,
} as const;

export interface GaugePoint { x: number; y: number; }

/** A single tick mark on the gauge SVG. */
export interface Tick {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  major: boolean;
  value: number;
}

/** A label displayed on the gauge. */
export interface GaugeLabel {
  x: number;
  y: number;
  text: string;
  anchor: 'start' | 'end' | 'middle';
}

/** Speedtest.net non-linear scale breakpoints: 0, 5, 10, 50, 100, 250, 500, 750, 1000 Mbps. */
export const SCALE_BREAKPOINTS = [0, 5, 10, 50, 100, 250, 500, 750, 1000];

/** Single source of truth for every SVG angle in the gauge. -90deg points straight up. */
export function polarPoint(cx: number, cy: number, radius: number, angleDeg: number): GaugePoint {
  const a = angleDeg * Math.PI / 180;
  return { x: cx + radius * Math.sin(a), y: cy - radius * Math.cos(a) };
}

/** Map a real measured Mbps value to a fraction of the 270° arc (0=left, 1=right). */
export function gaugeFraction(value: number | null | undefined, max: number | null | undefined): number {
  const ceiling = Math.max(1, Number(max) || 1000);
  const v = Math.max(0, Number(value) || 0);
  if (v <= 0) return 0;
  if (v >= ceiling) return 1;
  for (let i = 0; i < SCALE_BREAKPOINTS.length - 1; i++) {
    const segStart = SCALE_BREAKPOINTS[i];
    const segEnd = SCALE_BREAKPOINTS[i + 1];
    if (v <= segEnd) {
      const segSpan = segEnd - segStart;
      const vInSeg = v - segStart;
      const fractionInSeg = vInSeg / segSpan;
      const segmentOffset = i / 8;
      return segmentOffset + fractionInSeg / 8;
    }
  }
  return 1;
}

/** Inverse: map a fraction of the arc back to an honest Mbps value. */
export function gaugeValueAtFraction(fraction: number, max: number | null | undefined): number {
  const ceiling = Math.max(1, Number(max) || 1000);
  const f = Math.max(0, Math.min(1, fraction));
  for (let i = 0; i < 8; i++) {
    const segStartFrac = i / 8;
    const segEndFrac = (i + 1) / 8;
    if (f <= segEndFrac) {
      const fractionInSeg = (f - segStartFrac) / (1 / 8);
      const segStart = SCALE_BREAKPOINTS[i];
      const segEnd = SCALE_BREAKPOINTS[i + 1];
      return segStart + fractionInSeg * (segEnd - segStart);
    }
  }
  return ceiling;
}

/** Needle angle is derived only from the real measured value and the active scale. */
export function gaugeAngle(value: number | null | undefined, max: number | null | undefined): number {
  return GAUGE.startAngle + gaugeFraction(value, max) * (GAUGE.endAngle - GAUGE.startAngle);
}

export function needleTip(angleDeg: number): GaugePoint {
  return polarPoint(GAUGE.cx, GAUGE.cy, GAUGE.needleTipRadius, angleDeg);
}

export function arcPath(cx: number, cy: number, radius: number, startAngle: number, endAngle: number): string {
  const start = polarPoint(cx, cy, radius, startAngle);
  const end = polarPoint(cx, cy, radius, endAngle);
  const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
  const sweep = endAngle >= startAngle ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

/** Sweep the needle from 0 → max → 0 once, using rAF outside Angular change detection. */
export function sweepNeedle(
  startValue: number,
  endValue: number,
  durationMs: number,
  onUpdate: (value: number) => void,
  onComplete?: () => void
): void {
  const startTime = performance.now();
  const tick = () => {
    const now = performance.now();
    const elapsed = now - startTime;
    if (elapsed >= durationMs) {
      onUpdate(endValue);
      if (onComplete) onComplete();
      return;
    }
    // Easing: ease-out cubic
    const t = elapsed / durationMs;
    const eased = 1 - Math.pow(1 - t, 3);
    const value = startValue + (endValue - startValue) * eased;
    onUpdate(value);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const TICKS: Tick[] = Array.from({ length: 61 }, (_, i) => {
  const angle = GAUGE.startAngle + (i / 60) * (GAUGE.endAngle - GAUGE.startAngle);
  const major = i % 15 === 0;
  const inner = polarPoint(GAUGE.cx, GAUGE.cy, GAUGE.radius - (major ? 28 : 16), angle);
  const outer = polarPoint(GAUGE.cx, GAUGE.cy, GAUGE.radius - 10, angle);
  const value = Math.round(gaugeValueAtFraction(i / 60, undefined));
  return { ...outer, x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y, major, value };
});

@Component({
  selector: 'nv-speedometer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [NO_ERRORS_SCHEMA],
  template: `
    <div class="speedo-wrap" role="img" [attr.aria-label]="ariaLabel()">
      <svg class="speedo" viewBox="0 0 400 400" aria-hidden="true">
        <defs>
          <radialGradient id="nvDialGlow" cx="50%" cy="50%" r="65%">
            <stop offset="0" [attr.stop-color]="color()" stop-opacity=".18"/>
            <stop offset="40%" [attr.stop-color]="color()" stop-opacity=".06"/>
            <stop offset="1" [attr.stop-color]="color()" stop-opacity="0"/>
          </radialGradient>
          <linearGradient id="nvProgressGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" [attr.stop-color]="color()" stop-opacity=".55"/>
            <stop offset="100%" [attr.stop-color]="color()" stop-opacity="1"/>
          </linearGradient>
          <filter id="nvNeedleShadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="rgba(0,0,0,.5)"/>
          </filter>
        </defs>

        <!-- Outer glow ring -->
        <circle [attr.cx]="cx" [attr.cy]="cy" r="182" fill="url(#nvDialGlow)"/>
        <!-- Outer rings: elegant dial boundary -->
        <circle [attr.cx]="cx" [attr.cy]="cy" r="176" fill="none" stroke="var(--nv-border)" stroke-width="1.5"/>
        <circle [attr.cx]="cx" [attr.cy]="cy" r="164" fill="none" stroke="var(--nv-border)" stroke-width="1" opacity="0.6"/>
        <circle [attr.cx]="cx" [attr.cy]="cy" r="118" fill="none" stroke="var(--nv-border)" stroke-width="1" stroke-dasharray="3 10"/>

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
        <path class="speedo__progress" [attr.d]="trackPath" pathLength="100"
              [attr.stroke-dasharray]="(fraction() * 100).toFixed(2) + ' 100'"
              stroke="url(#nvProgressGrad)"/>

        <!-- Needle: CSS transform owns rotation so transitions animate smoothly.
             Pivot is the SVG center (50% 50% = 200,200 in viewBox). -->
        <g class="speedo__needle" [style.transform]="'rotate(' + angle().toFixed(2) + 'deg)'">
          <path [attr.d]="needlePath" [attr.fill]="color()" filter="url(#nvNeedleShadow)"/>
          <path [attr.d]="needleInnerPath" fill="rgba(255,255,255,.28)"/>
        </g>

        <!-- Center pivot: premium three-tier indicator -->
        <circle [attr.cx]="cx" [attr.cy]="cy" r="16" fill="var(--nv-panel)" [attr.stroke]="color()" stroke-width="3"/>
        <circle [attr.cx]="cx" [attr.cy]="cy" r="10" fill="var(--nv-panel-2)" stroke="var(--nv-border-strong)" stroke-width="1.5"/>
        <circle [attr.cx]="cx" [attr.cy]="cy" r="5" [attr.fill]="color()"/>

        <!-- Large central numerical reading -->
        <text class="speedo__value" [attr.x]="cx" y="272" text-anchor="middle">{{ display() }}</text>
        <text class="speedo__unit" [attr.x]="cx" y="299" text-anchor="middle">{{ unit() }}</text>
        @if (label()) {
          <text class="speedo__phase" [attr.x]="cx" y="343" text-anchor="middle" [attr.fill]="color()">{{ label() }}</text>
        }
      </svg>
    </div>`,
  styles: `
    :host { display: block; }
    .speedo__labels text { fill: var(--nv-muted); font-family: var(--nv-mono); font-size: 11px; font-weight: 700; }
    .speedo__ticks line { stroke: var(--nv-border-strong); stroke-linecap: round; }
    .speedo__ticks line.major { stroke: var(--nv-text-2); stroke-width: 2; }
    .speedo__needle {
      transform-origin: center;
      transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    .speedo__progress { fill: none; stroke-width: 13; stroke-linecap: round; transition: stroke-dasharray 0.2s linear, stroke 0.35s ease; }
    .speedo__track { fill: none; stroke: var(--nv-panel-3); stroke-width: 13; }
    .speedo__value { font-family: var(--nv-mono); font-weight: 800; font-size: 64px; fill: var(--nv-text); letter-spacing: -0.04em; }
    .speedo__unit { font-family: var(--nv-display); font-size: 16px; font-weight: 700; fill: var(--nv-muted); letter-spacing: 0.14em; }
    .speedo__phase { font-family: var(--nv-font); font-size: 13px; font-weight: 800; fill: var(--nv-accent); letter-spacing: 0.16em; }
    @media (prefers-reduced-motion: reduce) {
      .speedo__needle, .speedo__progress { transition: none !important; }
    }
  `,
})
export class SpeedometerComponent {
  readonly value = signal(0);
  readonly max = signal(1000);
  readonly unit = signal('Mbps');
  readonly label = signal('');
  readonly color = signal('var(--nv-accent)');
  readonly animate = signal(true);
  readonly duration = signal(700);

  readonly cx = GAUGE.cx;
  readonly cy = GAUGE.cy;
  readonly ticks = TICKS;
  readonly trackPath = arcPath(GAUGE.cx, GAUGE.cy, GAUGE.radius, GAUGE.startAngle, GAUGE.endAngle);
  readonly needlePath = [
    `M ${GAUGE.cx - GAUGE.needleHalfWidth} ${GAUGE.cy + GAUGE.needleBaseRadius}`,
    `L ${GAUGE.cx} ${GAUGE.cy - GAUGE.needleTipRadius}`,
    `L ${GAUGE.cx + GAUGE.needleHalfWidth} ${GAUGE.cy + GAUGE.needleBaseRadius}`,
    'Z',
  ].join(' ');
  readonly needleInnerPath = [
    `M ${GAUGE.cx - 2.2} ${GAUGE.cy + 12}`,
    `L ${GAUGE.cx} ${GAUGE.cy - (GAUGE.needleTipRadius - 16)}`,
    `L ${GAUGE.cx + 2.2} ${GAUGE.cy + 12}`,
    'Z',
  ].join(' ');

  private readonly animatedValue = signal(0);
  private sweepStop: (() => void) | null = null;

  readonly fraction = computed(() => gaugeFraction(this.animatedValue(), this.max()));
  readonly angle = computed(() => gaugeAngle(this.animatedValue(), this.max()));
  readonly display = computed(() => {
    const v = Math.max(0, Number(this.animatedValue()) || 0);
    return v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
  });
  readonly labels = computed<GaugeLabel[]>(() => {
    const ceiling = Math.max(1, Number(this.max()) || 1000);
    return [0, .25, .5, .75, 1].map(f => {
      const angle = GAUGE.startAngle + f * (GAUGE.endAngle - GAUGE.startAngle);
      const p = polarPoint(GAUGE.cx, GAUGE.cy, GAUGE.radius + 22, angle);
      return {
        ...p,
        text: String(Math.round(gaugeValueAtFraction(f, ceiling))),
        anchor: p.x > GAUGE.cx + 4 ? 'start' as const : p.x < GAUGE.cx - 4 ? 'end' as const : 'middle' as const,
      };
    });
  });
  readonly ariaLabel = computed(() => `${this.label() || 'Speed'}: ${this.display()} ${this.unit()}`);

  /** Start a sweep from 0 → max → 0 once. Call when test is preparing. */
  startSweep(): void {
    // Sweep forward: 0 → max
    sweepNeedle(0, this.max(), this.duration() * 2, (v) => this.animatedValue.set(v), () => {
      // Sweep reverse: max → 0
      sweepNeedle(this.max(), 0, this.duration() * 2, (v) => this.animatedValue.set(v), () => {
        // Sweep complete, reset to 0
        this.animatedValue.set(0);
      });
    });
  }

  /** Drive the needle toward a target value. Call with target = real measured speed. */
  driveToValue(target: number): void {
    driveNeedle(
      this.animatedValue(),
      target,
      1, // speed parameter (arbitrary, the function uses 10% per frame)
      (v) => this.animatedValue.set(v),
      () => { /* animation complete */ }
    );
  }

  /** Stop any running animation. */
  stopAnimation(): void {
    if (this.sweepStop) {
      this.sweepStop();
      this.sweepStop = null;
    }
    this.animatedValue.set(0);
  }
}
