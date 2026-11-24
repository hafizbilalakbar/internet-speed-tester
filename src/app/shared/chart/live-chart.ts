import {
  AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, NgZone, OnDestroy,
  computed, effect, inject, input, viewChild,
} from '@angular/core';
import { SpeedSample } from '../../core/models/models';

interface Point { t: number; v: number; }

function niceCeil(value: number): number {
  const v = Math.max(1, value);
  const magnitude = 10 ** Math.floor(Math.log10(v));
  const n = v / magnitude;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * magnitude;
}

function cssColor(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** Canvas throughput chart. Samples are relative to test start; drawing is capped at 5 fps outside NgZone. */
@Component({
  selector: 'nv-live-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chart-shell">
      <canvas #canvas role="img" [attr.aria-label]="ariaLabel()"></canvas>
      @if (visible().length < 2) {
        <div class="chart-empty"><span>{{ placeholder() }}</span></div>
      }
      <div class="chart-legend small muted">
        <span><i class="dot dot--down"></i>Download</span>
        <span><i class="dot dot--up"></i>Upload</span>
        <span class="chart-axis">{{ startLabel() }} → {{ timeLabel() }}</span>
      </div>
    </div>`,
  styles: `
    :host { display: block; width: 100%; }
    .chart-shell { position: relative; width: 100%; }
    canvas { display: block; width: 100%; height: 132px; border-radius: 10px; background: linear-gradient(180deg, rgba(127,143,174,.045), transparent); }
    .chart-empty { position: absolute; inset: 0 0 18px 0; display: grid; place-items: center; pointer-events: none; color: var(--nv-muted); font-size: .76rem; }
    .chart-legend { display: flex; align-items: center; gap: .9rem; padding: .2rem .15rem 0; font-size: .68rem; }
    .chart-legend span { display: inline-flex; align-items: center; gap: .3rem; }
    .chart-axis { margin-left: auto; font-family: var(--nv-mono); }
    .dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
    .dot--down { background: var(--nv-excellent); }
    .dot--up { background: var(--nv-accent-3); }
  `,
})
export class LiveChartComponent implements AfterViewInit, OnDestroy {
  readonly samples = input<SpeedSample[]>([]);
  readonly placeholder = input('Run a test to see real throughput.');
  /** 0 keeps the full test on one axis starting at 0 s. */
  readonly windowMs = input(0);

  private readonly zone = inject(NgZone);
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private data: SpeedSample[] = [];
  private drawnDown: Point[] = [];
  private drawnUp: Point[] = [];
  private timer: number | null = null;
  private observer: ResizeObserver | null = null;

  readonly visible = computed(() => this.samples()
    .filter(s => Number.isFinite(s.t) && s.t >= 0 && Number.isFinite(s.mbps))
    .slice()
    .sort((a, b) => a.t - b.t));
  readonly timeLabel = computed(() => `${((this.visible().at(-1)?.t ?? 0) / 1000).toFixed(1)}s`);
  readonly startLabel = computed(() => '0s');
  readonly ariaLabel = computed(() => `Real throughput chart from 0 seconds, ${this.visible().length} samples`);

  constructor() { effect(() => { this.data = this.visible(); }); }

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      this.timer = window.setInterval(() => this.draw(), 200);
      if (typeof ResizeObserver !== 'undefined') {
        this.observer = new ResizeObserver(() => this.draw());
        this.observer.observe(this.canvasRef().nativeElement);
      }
      this.draw();
    });
  }

  ngOnDestroy(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.observer?.disconnect();
  }

  private draw(): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(rect.width * dpr), h = Math.round(rect.height * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const narrow = rect.width < 460;
    const pad = { l: narrow ? 28 : 34, r: 6, t: 10, b: 18 };
    const iw = rect.width - pad.l - pad.r;
    const ih = rect.height - pad.t - pad.b;
    const data = this.data;
    const maxT = Math.max(1000, ...data.map(s => s.t));
    const span = Math.ceil(maxT / 2000) * 2000;
    const yMax = niceCeil(Math.max(1, ...data.map(s => s.mbps)));
    const down = cssColor('--nv-excellent', '#35d99a');
    const up = cssColor('--nv-accent-3', '#47d5ff');
    const grid = cssColor('--nv-border-strong', 'rgba(148,170,214,.25)');
    const muted = cssColor('--nv-muted', '#7f8fae');

    ctx.font = '9px ui-monospace, monospace';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 3; i++) {
      const y = pad.t + (ih * i) / 3;
      ctx.strokeStyle = grid;
      ctx.globalAlpha = i === 3 ? 0.5 : 0.22;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + iw, y); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
      ctx.fillStyle = muted;
      ctx.fillText(String(Math.round(yMax * (1 - i / 3))), 2, y);
    }
    const ticks = narrow ? 3 : 5;
    for (let i = 0; i <= ticks; i++) {
      const x = pad.l + (iw * i) / ticks;
      ctx.strokeStyle = grid; ctx.globalAlpha = 0.14;
      ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + ih); ctx.stroke(); ctx.globalAlpha = 1;
      const label = `${Math.round(span * i / ticks / 1000)}s`;
      ctx.textAlign = i === 0 ? 'left' : i === ticks ? 'right' : 'center';
      ctx.fillStyle = muted;
      ctx.fillText(label, x, rect.height - 8);
    }
    if (data.length < 2) { this.drawnDown = []; this.drawnUp = []; return; }

    const toPoints = (lane: 'download' | 'upload'): Point[] => data
      .filter(s => (s.lane ?? 'download') === lane)
      .map(s => ({ t: pad.l + (s.t / span) * iw, v: pad.t + ih - Math.min(1, s.mbps / yMax) * ih }));

    const targetDown = toPoints('download');
    const targetUp = toPoints('upload');
    this.drawnDown = this.ease(this.drawnDown, targetDown);
    this.drawnUp = this.ease(this.drawnUp, targetUp);
    if (this.drawnDown.length) this.line(ctx, this.drawnDown, down, pad.t + ih);
    if (this.drawnUp.length) this.line(ctx, this.drawnUp, up, pad.t + ih);
  }

  /** Interpolate stored points toward new real samples so the line grows smoothly at 5 fps. */
  private ease(current: Point[], target: Point[]): Point[] {
    if (!target.length) return [];
    if (!current.length || current.length !== target.length) return target.map(p => ({ ...p }));
    return target.map((p, i) => ({
      t: current[i].t + (p.t - current[i].t) * 0.45,
      v: current[i].v + (p.v - current[i].v) * 0.45,
    }));
  }

  private line(ctx: CanvasRenderingContext2D, points: Point[], color: string, baseline: number): void {
    ctx.beginPath();
    ctx.moveTo(points[0].t, points[0].v);
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1], cur = points[i];
      ctx.quadraticCurveTo(prev.t, prev.v, (prev.t + cur.t) / 2, (prev.v + cur.v) / 2);
    }
    ctx.lineTo(points[points.length - 1].t, points[points.length - 1].v);
    ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.lineJoin = 'round'; ctx.stroke();
    const gradient = ctx.createLinearGradient(0, points[0].v, 0, baseline);
    gradient.addColorStop(0, `${color}33`);
    gradient.addColorStop(1, `${color}00`);
    ctx.lineTo(points[points.length - 1].t, baseline);
    ctx.lineTo(points[0].t, baseline);
    ctx.closePath(); ctx.fillStyle = gradient; ctx.fill();
    const last = points[points.length - 1];
    ctx.beginPath(); ctx.arc(last.t, last.v, 2.2, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
  }
}
