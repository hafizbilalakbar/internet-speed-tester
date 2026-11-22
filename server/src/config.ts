import 'dotenv/config';

export interface NodeDefinition {
  id: string; name: string; city: string; country: string; countryCode: string;
  host: string; region: string; latitude: number; longitude: number;
  provider: string; capacity?: string | null;
}

function int(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

function localNode(): NodeDefinition {
  return {
    id: process.env.NODE_ID ?? 'local-primary',
    name: process.env.NODE_NAME ?? 'Netvelox Primary',
    city: process.env.REGION_CITY ?? 'Local Node',
    country: process.env.REGION_COUNTRY ?? 'Local',
    countryCode: process.env.REGION_COUNTRY_CODE ?? 'LOCAL',
    host: process.env.PUBLIC_NODE_URL ?? `http://localhost:${int('PORT', 3001)}`,
    region: process.env.REGION_NAME ?? 'Local',
    latitude: Number(process.env.REGION_LAT ?? 0),
    longitude: Number(process.env.REGION_LON ?? 0),
    provider: process.env.NODE_PROVIDER ?? 'Netvelox',
    capacity: process.env.NODE_CAPACITY ?? 'deployment-dependent',
  };
}

function regionalNodes(): NodeDefinition[] {
  try {
    const raw = JSON.parse(process.env.REGIONAL_NODES ?? '[]');
    return Array.isArray(raw) ? raw.filter(n => n?.id && n?.host) as NodeDefinition[] : [];
  } catch { return []; }
}

const environment = process.env.NODE_ENV ?? 'development';
const jwtSecret = process.env.ADMIN_JWT_SECRET ?? '';
const internalToken = process.env.INTERNAL_NODE_TOKEN ?? '';
const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH ?? '';

if (environment === 'production' && (!jwtSecret || jwtSecret.startsWith('change-') || !internalToken || internalToken.startsWith('change-') || !adminPasswordHash)) {
  throw new Error('Production startup requires ADMIN_JWT_SECRET, INTERNAL_NODE_TOKEN and ADMIN_PASSWORD_HASH to be set to strong values.');
}

export const config = {
  port: int('PORT', 3001),
  env: environment,
  trustProxy: process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:4200,http://127.0.0.1:4200').split(',').map(s => s.trim()).filter(Boolean),
  databaseUrl: process.env.DATABASE_URL,
  node: localNode(),
  regionalNodes: regionalNodes(),
  admin: {
    email: process.env.ADMIN_EMAIL ?? 'admin@netvelox.local',
    passwordHash: adminPasswordHash,
    jwtSecret,
    internalToken,
  },
  ai: {
    provider: process.env.AI_PROVIDER ?? 'rule-based',
    baseUrl: process.env.AI_BASE_URL ?? 'https://api.openai.com/v1',
    apiKey: process.env.AI_API_KEY ?? '',
    model: process.env.AI_MODEL ?? 'gpt-4o-mini',
  },
  test: {
    downloadMs: int('TEST_DOWNLOAD_MS', 8000),
    uploadMs: int('TEST_UPLOAD_MS', 8000),
    maxConnections: Math.min(16, int('TEST_MAX_CONNECTIONS', 6)),
    chunkBytes: int('TEST_CHUNK_BYTES', 1024 * 1024),
    maxUploadBytes: int('TEST_MAX_UPLOAD_BYTES', 512 * 1024 * 1024),
    pingSamples: int('TEST_PING_SAMPLES', 14),
    probeCount: int('TEST_PROBE_COUNT', 30),
    maxUploadRequestBytes: int('MAX_UPLOAD_REQUEST_BYTES', 128 * 1024 * 1024),
  },
};
