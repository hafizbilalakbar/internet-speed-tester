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
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** Canvas throughput chart. Data arrives at 4 Hz; drawing is throttled to 5 Hz and done outside NgZone. */
@Component({
  selector: 'nv-live-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chart-shell">
      <canvas #canvas role="img" [attr.aria-label]="ariaLabel()"></canvas>
      @if (visible().length < 2) {
        <div class="chart-empty"><span>{{ placeholder() }}</span></div>
      }
      <div class="chart-legend small muted"><span><i class="dot dot--down"></i>Download</span><span><i class="dot dot--up"></i>Upload</span><span class="chart-axis">{{ startLabel() }} → {{ timeLabel() }}</span></div>
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
  readonly windowMs = input(12000);

  private readonly zone = inject(NgZone);
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private data: SpeedSample[] = [];
  private drawnDown: Point[] = [];
  private drawnUp: Point[] = [];
  private timer: number | null = null;
  private observer: ResizeObserver | null = null;

  readonly visible = computed(() => {
    const all = this.samples().filter(s => Number.isFinite(s.t) && Number.isFinite(s.mbps));
    if (!all.length) return [];
    const maxT = all[all.length - 1].t;
    const window = this.windowMs();
    return window > 0 ? all.filter(s => s.t >= maxT - window) : all;
  });
  readonly timeLabel = computed(() => `${((this.visible().at(-1)?.t ?? 0) / 1000).toFixed(1)}s`);
  readonly startLabel = computed(() => `${((this.visible()[0]?.t ?? 0) / 1000).toFixed(1)}s`);
  readonly ariaLabel = computed(() => `Real throughput chart, ${this.visible().length} samples`);

  constructor() {
    effect(() => { this.data = this.visible(); this.schedule(); });
  }

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

  private schedule(): void { if (this.timer === null) return; }

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

    const pad = { l: 34, r: 8, t: 10, b: 18 };
    const iw = rect.width - pad.l - pad.r;
    const ih = rect.height - pad.t - pad.b;
    const data = this.data;
    const maxT = Math.max(...data.map(s => s.t), 0);
    const minT = Math.max(0, maxT - (this.windowMs() || 12000));
    const span = Math.max(1000, maxT - minT);
    const yMax = niceCeil(Math.max(1, ...data.map(s => s.mbps)));
    const down = cssColor('--nv-excellent', '#35d99a');
    const up = cssColor('--nv-accent-3', '#47d5ff');
    const grid = cssColor('--nv-border-strong', 'rgba(148,170,214,.25)');
    const muted = cssColor('--nv-muted', '#7f8fae');

    ctx.font = '9px ui-monospace, monospace';
    ctx.fillStyle = muted;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const y = pad.t + (ih * i) / 3;
      ctx.strokeStyle = grid;
      ctx.globalAlpha = i === 3 ? 0.5 : 0.22;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + iw, y); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillText(String(Math.round(yMax * (1 - i / 3))), 3, y + 3);
    }
    for (let i = 0; i <= 4; i++) {
      const x = pad.l + (iw * i) / 4;
      ctx.strokeStyle = grid; ctx.globalAlpha = 0.14;
      ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + ih); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillText(`${((minT + span * i / 4) / 1000).toFixed(0)}s`, x - 6, rect.height - 4);
    }
    if (data.length < 2) { this.drawnDown = []; this.drawnUp = []; return; }

    const toPoints = (lane: 'download' | 'upload'): Point[] => data
      .filter(s => (s.lane ?? 'download') === lane)
      .map(s => ({ t: pad.l + ((s.t - minT) / span) * iw, v: pad.t + ih - Math.min(1, s.mbps / yMax) * ih }))
      .filter(p => p.t >= pad.l - 1 && p.t <= pad.l + iw + 1);

    const targetDown = toPoints('download');
    const targetUp = toPoints('upload');
    this.drawnDown = this.ease(this.drawnDown, targetDown);
    this.drawnUp = this.ease(this.drawnUp, targetUp);
    if (targetUp.length && !this.drawnUp.length) this.drawnUp = targetUp;
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
