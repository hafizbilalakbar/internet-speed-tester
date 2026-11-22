import { TestBed } from '@angular/core/testing';
import { ScoringService } from './scoring.service';
import { TestMeasurements } from '../models/models';

function measurements(overrides: Partial<TestMeasurements> = {}): TestMeasurements {
  return {
    downloadMbps: 100, uploadMbps: 20,
    downloadSamples: [], uploadSamples: [], downloadDurationMs: 8000, uploadDurationMs: 8000,
    connections: 6,
    latency: {
      samples: [10, 12, 11], min: 10, max: 12, avg: 11, median: 11, jitter: 2,
      loadedDownload: 15, loadedUpload: 18, packetLossPct: 0,
      packetLossMethod: 'HTTP probes', packetsSent: 30, packetsLost: 0,
    },
    stability: { sampleCount: 20, deviationPct: 8, interruptions: 0, rating: 'excellent' },
    bytesDownloaded: 100_000_000, bytesUploaded: 20_000_000,
    ...overrides,
  };
}

describe('ScoringService', () => {
  let service: ScoringService;
  beforeEach(() => { TestBed.configureTestingModule({}); service = TestBed.inject(ScoringService); });

  it('uses metric-specific thresholds', () => {
    expect(service.level('downloadMbps', 100)).toBe('excellent');
    expect(service.level('idleMs', 100)).toBe('poor');
    expect(service.level('jitterMs', 4)).toBe('excellent');
    expect(service.level('lossPct', 1.5)).toBe('moderate');
    expect(service.level('lossPct', 3)).toBe('poor');
    expect(service.level('downloadMbps', null)).toBe('unknown');
  });

  it('produces a bounded score and explains its methodology', () => {
    const good = service.score(measurements());
    const bad = service.score(measurements({ downloadMbps: 1, uploadMbps: .5,
      latency: { ...measurements().latency, avg: 250, jitter: 90, packetLossPct: 9 } }));
    expect(good.overall).toBeGreaterThan(bad.overall);
    expect(good.overall).toBeLessThanOrEqual(100);
    expect(bad.overall).toBeGreaterThanOrEqual(0);
    expect(good.methodology).toContain('not an industry certification');
  });

  it('scores gaming suitability from latency rather than download alone', () => {
    const highPing = measurements({ downloadMbps: 500,
      latency: { ...measurements().latency, avg: 120, jitter: 40 } });
    const fastHighPing = service.suitability(service.score(highPing), highPing);
    const lowPing = measurements({ downloadMbps: 100 });
    const normal = service.suitability(service.score(lowPing), lowPing);
    expect(fastHighPing['gaming']).toBeLessThan(normal['gaming']);
    expect(fastHighPing['gaming']).toBeLessThan(70);
  });
});
