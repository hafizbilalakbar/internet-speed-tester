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

export interface TestMeasurements {
  downloadMbps: number | null;
  uploadMbps: number | null;
  [key: string]: unknown;
}
