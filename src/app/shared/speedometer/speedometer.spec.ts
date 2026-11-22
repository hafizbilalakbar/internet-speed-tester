import { describe, expect, it } from 'vitest';
import { GAUGE, arcPath, gaugeAngle, gaugeFraction, gaugeValueAtFraction, needleTip, polarPoint } from './speedometer';

describe('speedometer geometry', () => {
  it('maps minimum, midpoint and maximum values to the exact gauge angles', () => {
    expect(gaugeAngle(0, 500)).toBe(GAUGE.startAngle);
    expect(gaugeAngle(100, 500)).toBe(0);
    expect(gaugeAngle(500, 500)).toBe(GAUGE.endAngle);
  });

  it('keeps the needle angle strictly monotonic on the fixed scale', () => {
    let previous = -Infinity;
    for (const value of [0, 1, 10, 27, 58, 100, 171, 250, 326, 500]) {
      const angle = gaugeAngle(value, 500);
      expect(angle).toBeGreaterThan(previous);
      previous = angle;
    }
    // Values above the fixed ceiling are clamped instead of rescaling the dial.
    expect(gaugeAngle(9999, 500)).toBe(GAUGE.endAngle);
  });

  it('clamps extreme and invalid values without moving outside the gauge', () => {
    expect(gaugeFraction(-50, 500)).toBe(0);
    expect(gaugeFraction(5000, 500)).toBe(1);
    expect(gaugeFraction(Number.NaN, 500)).toBe(0);
    expect(gaugeAngle(5000, 100)).toBe(GAUGE.endAngle);
  });

  it('places labels at the exact inverse positions of the piecewise scale', () => {
    expect([0, .25, .5, .75, 1].map(f => Math.round(gaugeValueAtFraction(f, 500)))).toEqual([0, 50, 100, 300, 500]);
  });

  it('keeps the needle tip inside the dial radius at every tested value', () => {
    const maxRadius = GAUGE.radius - 8;
    for (const value of [0, 1, 25, 125, 250, 375, 500, 9999]) {
      const tip = needleTip(gaugeAngle(value, 500));
      const distance = Math.hypot(tip.x - GAUGE.cx, tip.y - GAUGE.cy);
      expect(distance).toBeLessThanOrEqual(maxRadius);
      expect(Number.isFinite(tip.x)).toBe(true);
      expect(Number.isFinite(tip.y)).toBe(true);
    }
  });

  it('uses one pivot and one arc coordinate system', () => {
    const start = polarPoint(GAUGE.cx, GAUGE.cy, GAUGE.radius, GAUGE.startAngle);
    expect(start.x).toBeCloseTo(93.93, 1);
    expect(start.y).toBeCloseTo(306.07, 1);
    expect(arcPath(GAUGE.cx, GAUGE.cy, GAUGE.radius, GAUGE.startAngle, GAUGE.endAngle)).toContain('A 150 150 0 1 1');
  });
});
