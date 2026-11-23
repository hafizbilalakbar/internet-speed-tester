export type TestPhase = 'idle' | 'preparing' | 'ping' | 'download' | 'upload' | 'diagnostics' | 'complete' | 'error' | 'cancelled';
export type QualityLevel = 'excellent' | 'good' | 'moderate' | 'poor' | 'critical' | 'unknown';

export interface SpeedSample { t: number; mbps: number; lane?: 'download' | 'upload'; }

export interface LatencyStats {
  samples: number[];
  min: number | null;
  max: number | null;
  avg: number | null;
  median: number | null;
  jitter: number | null;
  loadedDownload: number | null;
  loadedUpload: number | null;
  packetLossPct: number | null;
  packetLossMethod: string;
  packetsSent: number;
  packetsLost: number;
}

export interface TestingServer {
  id: string;
  name: string;
  city: string;
  country: string;
  countryCode: string;
  provider: string;
  host: string;
  baseUrl?: string;
  protocols: string[];
  region: string;
  latitude: number;
  longitude: number;
  latencyMs: number | null;
  loadPct: number | null;
  status: 'online' | 'degraded' | 'offline' | 'unknown';
  capacity: string | null;
  distanceKm: number | null;
}

export interface IpInfo {
  ip: string | null;
  family: 'IPv4' | 'IPv6' | null;
  isp: string | null;
  asn: string | null;
  org: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  source: string | null;
}

export interface BrowserInfo {
  browser: string;
  browserVersion: string;
  os: string;
  deviceType: 'mobile' | 'tablet' | 'desktop';
  screen: string;
  language: string;
  timezone: string;
  hardwareConcurrency: number | null;
  deviceMemoryGb: number | null;
  connectionType: string | null;
  effectiveType: string | null;
  downlinkMbps: number | null;
  rttEstimateMs: number | null;
  online: boolean;
  webgl: boolean;
  source: 'browser-reported estimate';
}

export interface NetworkSnapshot {
  ipv4: IpInfo;
  ipv6: IpInfo | null;
  browser: BrowserInfo;
  preciseLocation: { latitude: number; longitude: number; accuracy: number | null } | null;
  /** Only populated after explicit geolocation permission and reverse geocoding. */
  preciseCity: string | null;
  locationDetail: string | null;
  collectedAt: string;
}

export interface ConnectionStability {
  sampleCount: number;
  deviationPct: number | null;
  interruptions: number;
  rating: QualityLevel;
}

export interface TestMeasurements {
  downloadMbps: number | null;
  uploadMbps: number | null;
  downloadSamples: SpeedSample[];
  uploadSamples: SpeedSample[];
  downloadDurationMs: number;
  uploadDurationMs: number;
  connections: number;
  latency: LatencyStats;
  stability: ConnectionStability;
  bytesDownloaded: number;
  bytesUploaded: number;
}

export interface QualityScore {
  overall: number;
  grades: Record<string, number>;
  methodology: string;
  label: string;
}

export interface AiInsight {
  category: string;
  level: 'info' | 'warning' | 'critical' | 'success';
  title: string;
  text: string;
}

export interface AiAnalysis {
  summary: string;
  insights: AiInsight[];
  gaming: { score: number; label: string; note: string };
  conferencing: { score: number; label: string; note: string };
  streaming: { score: number; label: string; note: string };
  bottleneck: string;
  recommendations: string[];
  provider: 'rule-based' | 'ai';
  generatedAt: string;
}

export interface TestResult {
  id: string;
  shareToken: string | null;
  /** Secret returned only when a result is first stored; required to read or change that result. Never shared publicly. */
  ownerToken?: string | null;
  createdAt: string;
  server: TestingServer;
  measurements: TestMeasurements;
  score: QualityScore;
  analysis: AiAnalysis;
  network: NetworkSnapshot;
  share: { ip: boolean; isp: boolean; location: boolean };
}

export interface SessionResponse {
  sessionId: string;
  server: TestingServer;
  baseUrl: string;
  config: {
    downloadDurationMs: number;
    uploadDurationMs: number;
    maxConnections: number;
    maxUploadBytes: number;
    chunkBytes: number;
    pingSamples: number;
    probeCount: number;
  };
  expiresAt: string;
}

export interface ApiError { message: string; status: number; }

export interface HealthCheck {
  ok: boolean;
  message?: string;
  service?: string;
  time?: number;
  persistence?: boolean;
  checkedAt: string;
}
