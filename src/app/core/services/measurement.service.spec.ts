import { MeasurementService } from './measurement.service';

describe('MeasurementService.stats', () => {
  it('computes min, max, median, average and jitter from real sample differences', () => {
    const stats = MeasurementService.stats([10, 20, 15, 5]);
    expect(stats.samples).toEqual([10, 20, 15, 5]);
    expect(stats.min).toBe(5);
    expect(stats.max).toBe(20);
    expect(stats.avg).toBe(12.5);
    expect(stats.median).toBe(15);
    // Consecutive RTT variation in measurement order: |20-10| + |15-20| + |5-15| = 25 / 3
    expect(stats.jitter).toBe(8.3);
  });

  it('returns null values when no valid samples exist', () => {
    const stats = MeasurementService.stats([]);
    expect(stats.min).toBeNull();
    expect(stats.jitter).toBeNull();
  });

  it('ignores invalid timings', () => {
    expect(MeasurementService.stats([0, -1, Number.NaN, 12]).samples).toEqual([12]);
  });
});
