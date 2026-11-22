import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, input, OnDestroy, viewChild } from '@angular/core';
import { NgxEchartsDirective, provideEchartsCore } from 'ngx-echarts';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';
import { SpeedSample } from '../../core/models/models';

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

function niceCeil(value: number): number {
  const v = Math.max(1, value);
  const exponent = Math.floor(Math.log10(v));
  const magnitude = 10 ** exponent;
  const normalized = v / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

interface ChartRefreshResult {
  keepAlive: boolean;
  options: EChartsCoreOption;
}

@Component({
  selector: 'nv-live-chart',
  imports: [NgxEchartsDirective],
  providers: [provideEchartsCore({ echarts })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chart-shell" [attr.aria-label]="ariaLabel()" role="img">
      @if (visible().length < 2) {
        <div class="chart-placeholder">
          <div class="chart-placeholder__grid"></div>
          <div class="chart-placeholder__line" [style.--chart-color]="resolvedColor()"></div>
          <span class="chart-placeholder__text">{{ placeholder() }}</span>
        </div>
      }
      <div
        echarts
        class="chart"
        [class.chart--hidden]="visible().length < 2"
        [options]="options"
        [merge]="mergeOptions"
        [autoResize]="true"
        [initOpts]="initOpts"
        [theme]="chartTheme()"
      ></div>
      <div class="chart-axis small muted"><span>{{ startLabel() }}</span><span>{{ timeLabel() }}</span></div>
    </div>
  `,
  styles: `
    :host { display: block; width: 100%; }
    .chart-shell { width: 100%; position: relative; }
    .chart { display: block; width: 100%; height: 160px; }
    .chart--hidden { position: absolute; inset: 0; opacity: 0; pointer-events: none; }
    .chart-placeholder {
      position: relative;
      height: 160px;
      border-radius: 10px;
      overflow: hidden;
      background: linear-gradient(180deg, rgba(127,143,174,.06), rgba(127,143,174,.02));
      border: 1px dashed var(--nv-border);
    }
    .chart-placeholder__grid {
      position: absolute; inset: 0;
      background-image: linear-gradient(var(--nv-border) 1px, transparent 1px), linear-gradient(90deg, var(--nv-border) 1px, transparent 1px);
      background-size: 100% 25%, 20% 100%;
      opacity: .35;
    }
    .chart-placeholder__line {
      position: absolute; left: 0; right: 0; top: 55%; height: 2px;
      background: linear-gradient(90deg, transparent, var(--chart-color), transparent);
      animation: chart-sweep 2.2s linear infinite;
      opacity: .7;
    }
    .chart-placeholder__text {
      position: absolute; inset: 0; display: grid; place-items: center;
      font-size: .78rem; color: var(--nv-muted); font-weight: 600;
    }
    .chart-axis { display: flex; justify-content: space-between; margin-top: .15rem; padding: 0 .1rem; }
    @keyframes chart-sweep { from { transform: translateX(-35%); } to { transform: translateX(35%); } }
    @media (max-width: 640px) { .chart, .chart-placeholder { height: 132px; } }
    @media (prefers-reduced-motion: reduce) { .chart-placeholder__line { animation: none; } }
  `,
})
export class LiveChartComponent implements OnDestroy {
  readonly samples = input<SpeedSample[]>([]);
  readonly color = input('var(--nv-accent)');
  readonly durationLabel = input('');
  readonly windowMs = input(0);
  readonly placeholder = input('Waiting for measured samples…');

  private readonly maxSamples = 180;
  private refreshTimeout: number | null = null;
  private lastRefresh = 0;

  readonly initOpts = { renderer: 'canvas' as const };
  readonly chartTheme = computed(() => 'default');

  readonly visible = computed(() => {
    const all = this.samples().filter(s => Number.isFinite(s.t) && Number.isFinite(s.mbps) && s.mbps >= 0);
    if (!all.length) return [];
    const maxT = all[all.length - 1].t;
    const window = this.windowMs();
    return window > 0 ? all.filter(s => s.t >= maxT - window) : all;
  });

  readonly resolvedColor = computed(() => this.resolveCssColor(this.color()));

  /** Recommended Y-scale tick for the current data range. */
  readonly scale = computed(() => niceCeil(Math.max(...this.visible().map(s => s.mbps), 1)));

  readonly timeLabel = computed(() => this.durationLabel() || `${((this.visible().at(-1)?.t ?? 0) / 1000).toFixed(1)}s`);
  readonly startLabel = computed(() => {
    const v = this.visible();
    if (!v.length) return '0s';
    return `${(v[0].t / 1000).toFixed(1)}s`;
  });
  readonly ariaLabel = computed(() => `Throughput chart with ${this.visible().length} measured samples, peak ${this.scale()} Mbps`);

  /** Rebuilt option objects, refreshed at ~4fps max. */
  readonly options = computed<EChartsCoreOption>(() => this.buildOptionRefresh(this.visible(), this.resolvedColor(), this.scale()).options);
  readonly mergeOptions = computed<EChartsCoreOption>(() => this.buildOptionRefresh(this.visible(), this.resolvedColor(), this.scale(), true).options);

  ngOnDestroy(): void {
    this.killRefreshTimer();
  }

  /** Start the chart refresh timer (max ~4 times per second). */
  startRefreshTimer(): void {
    this.killRefreshTimer();
    const now = Date.now();
    const delay = Math.max(0, 250 - (now - (this.lastRefresh || 0)));
    this.refreshTimeout = window.setTimeout(() => {
      this.lastRefresh = Date.now();
      this.startRefreshTimer();
    }, delay);
  }

  killRefreshTimer(): void {
    if (this.refreshTimeout !== null) {
      clearTimeout(this.refreshTimeout);
      this.refreshTimeout = null;
    }
  }

  private buildOptionRefresh(samples: SpeedSample[], color: string, max: number, merge = false): ChartRefreshResult {
    // Build data array, limiting to last N samples for performance
    const data = samples.slice(-this.maxSamples).map(s => [+(s.t / 1000).toFixed(2), +Math.max(0, s.mbps).toFixed(3)]);

    const minT = samples.length ? +(samples[samples.length - this.maxSamples]?.t / 1000).toFixed(2) || 0 : 0;
    const maxT = samples.length ? +(samples[samples.length - 1]?.t / 1000).toFixed(2) || 1 : 1;

    return {
      keepAlive: true,
      options: {
        animation: !merge,
        animationDuration: 120,
        animationDurationUpdate: 80,
        animationEasingUpdate: 'linear',
        grid: { left: 38, right: 12, top: 14, bottom: 24, containLabel: false },
        tooltip: {
          trigger: 'axis',
          confine: true,
          backgroundColor: 'rgba(14,21,38,0.94)',
          borderColor: 'rgba(148,170,214,0.22)',
          textStyle: { color: '#eef3ff', fontFamily: 'Roboto Mono, monospace', fontSize: 11 },
          formatter: (params: any) => {
            const p = Array.isArray(params) ? params[0] : params;
            const v = Array.isArray(p?.value) ? p.value : [0, 0];
            return `${Number(v[1]).toFixed(2)} Mbps<br/>${Number(v[0]).toFixed(2)} s`;
          },
        },
        xAxis: {
          type: 'value',
          min: minT,
          max: Math.max(minT + 1, maxT),
          boundaryGap: [0, 0],
          axisLabel: { color: '#7f8fae', fontSize: 10, fontFamily: 'Roboto Mono, monospace', formatter: (v: number) => `${v.toFixed(0)}s` },
          axisLine: { lineStyle: { color: 'rgba(148,170,214,0.18)' } },
          splitLine: { show: false },
        },
        yAxis: {
          type: 'value',
          min: 0,
          max,
          axisLabel: { color: '#7f8fae', fontSize: 10, fontFamily: 'Roboto Mono, monospace', formatter: (v: number) => `${v}` },
          axisLine: { show: false },
          splitLine: { lineStyle: { color: 'rgba(148,170,214,0.14)' } },
        },
        series: [{
          type: 'line',
          showSymbol: false,
          smooth: 0.25,
          sampling: 'lttb',
          data,
          lineStyle: { color, width: 2.5 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: this.withAlpha(color, 0.28) },
              { offset: 1, color: this.withAlpha(color, 0.02) },
            ]),
          },
          emphasis: { disabled: true },
        }],
      },
      mergeOptions: {
        animation: !merge,
        animationDuration: 180,
        animationDurationUpdate: 120,
        animationEasingUpdate: 'linear',
        grid: { left: 38, right: 12, top: 14, bottom: 24, containLabel: false },
        tooltip: {
          trigger: 'axis',
          confine: true,
          backgroundColor: 'rgba(14,21,38,0.94)',
          borderColor: 'rgba(148,170,214,0.22)',
          textStyle: { color: '#eef3ff', fontFamily: 'Roboto Mono, monospace', fontSize: 11 },
          formatter: (params: any) => {
            const p = Array.isArray(params) ? params[0] : params;
            const v = Array.isArray(p?.value) ? p.value : [0, 0];
            return `${Number(v[1]).toFixed(2)} Mbps<br/>${Number(v[0]).toFixed(2)} s`;
          },
        },
        xAxis: {
          type: 'value',
          min: minT,
          max: Math.max(minT + 1, maxT),
          boundaryGap: [0, 0],
          axisLabel: { color: '#7f8fae', fontSize: 10, fontFamily: 'Roboto Mono, monospace', formatter: (v: number) => `${v.toFixed(0)}s` },
          axisLine: { lineStyle: { color: 'rgba(148,170,214,0.18)' } },
          splitLine: { show: false },
        },
        yAxis: {
          type: 'value',
          min: 0,
          max,
          axisLabel: { color: '#7f8fae', fontSize: 10, fontFamily: 'Roboto Mono, monospace', formatter: (v: number) => `${v}` },
          axisLine: { show: false },
          splitLine: { lineStyle: { color: 'rgba(148,170,214,0.14)' } },
        },
        series: [{
          type: 'line',
          showSymbol: false,
          smooth: 0.25,
          sampling: 'lttb',
          data,
          lineStyle: { color, width: 2.5 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: this.withAlpha(color, 0.28) },
              { offset: 1, color: this.withAlpha(color, 0.02) },
            ]),
          },
          emphasis: { disabled: true },
        }],
      },
    };
  }

  private resolveCssColor(color: string): string {
    if (typeof document === 'undefined') return '#2af5c8';
    const m = color.match(/var\((--[^)]+)\)/);
    if (!m) return color;
    const v = getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim();
    return v || '#2af5c8';
  }

  private withAlpha(color: string, alpha: number): string {
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
      const n = parseInt(full, 16);
      const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
      return `rgba(${r},${g},${b},${alpha})`;
    }
    const rgb = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (rgb) return `rgba(${rgb[1]},${rgb[2]},${rgb[3]},${alpha})`;
    return color;
  }
