import { describe, expect, it } from 'vitest';
import { GAUGE, arcPath, gaugeAngle, gaugeFraction, gaugeValueAtFraction, introSweepFraction, meterValue, needleTip, polarPoint } from './speedometer';

const SCALE_MAX = 1000;

describe('speedometer geometry', () => {
  it('maps minimum, midpoint and maximum values to the exact gauge angles', () => {
    expect(gaugeAngle(0, SCALE_MAX)).toBe(GAUGE.startAngle);
    expect(gaugeAngle(100, SCALE_MAX)).toBe(0);
    expect(gaugeAngle(1000, SCALE_MAX)).toBe(GAUGE.endAngle);
  });

  it('keeps the needle angle strictly monotonic on the fixed scale', () => {
    let previous = -Infinity;
    for (const value of [0, 1, 10, 27, 58, 100, 171, 250, 326, 500, 750]) {
      const angle = gaugeAngle(value, SCALE_MAX);
      expect(angle).toBeGreaterThan(previous);
      previous = angle;
    }
    expect(gaugeAngle(9999, SCALE_MAX)).toBe(GAUGE.endAngle);
  });

  it('clamps extreme and invalid values without moving outside the gauge', () => {
    expect(gaugeFraction(-50, SCALE_MAX)).toBe(0);
    expect(gaugeFraction(5000, SCALE_MAX)).toBe(1);
    expect(gaugeFraction(Number.NaN, SCALE_MAX)).toBe(0);
    expect(gaugeAngle(5000, 100)).toBe(GAUGE.endAngle);
  });

  it('places labels at the exact inverse positions of the piecewise scale', () => {
    expect([0, .25, .5, .75, 1].map(f => Math.round(gaugeValueAtFraction(f, SCALE_MAX)))).toEqual([0, 10, 100, 500, 1000]);
  });

  it('keeps the needle tip inside the dial radius at every tested value', () => {
    const maxRadius = GAUGE.radius - 8;
    for (const value of [0, 1, 25, 125, 250, 375, 500, 750, 9999]) {
      const tip = needleTip(gaugeAngle(value, SCALE_MAX));
      const distance = Math.hypot(tip.x - GAUGE.cx, tip.y - GAUGE.cy);
      expect(distance).toBeLessThanOrEqual(maxRadius);
      expect(Number.isFinite(tip.x)).toBe(true);
      expect(Number.isFinite(tip.y)).toBe(true);
    }
  });

  it('keeps the final download on the dial instead of resetting it to zero', () => {
    expect(meterValue(6.4, false, 0)).toBe(6.4);
    expect(meterValue(6.4, true, 7.8)).toBe(7.8);
    expect(gaugeAngle(meterValue(6.4, true, 7.8), SCALE_MAX)).toBeGreaterThan(GAUGE.startAngle);
  });

  it('sweeps to the end and settles exactly on zero', () => {
    expect(introSweepFraction(0)).toBe(0);
    expect(introSweepFraction(600)).toBe(0);
    expect(introSweepFraction(1000)).toBeCloseTo(0.5, 5);
    expect(introSweepFraction(1400)).toBe(1);
    expect(introSweepFraction(1950)).toBeLessThan(0);
    expect(introSweepFraction(2000)).toBe(0);
  });

  it('uses one pivot and one arc coordinate system', () => {
    const start = polarPoint(GAUGE.cx, GAUGE.cy, GAUGE.radius, GAUGE.startAngle);
    expect(start.x).toBeCloseTo(93.93, 1);
    expect(start.y).toBeCloseTo(306.07, 1);
    expect(arcPath(GAUGE.cx, GAUGE.cy, GAUGE.radius, GAUGE.startAngle, GAUGE.endAngle)).toContain('A 150 150 0 1 1');
  });
});
