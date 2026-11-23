/**
 * Netvelox edge measurement endpoints.
 *
 * These routes are intentionally served only by Cloudflare Workers. They do not
 * call the Node API and carry 100% of the measurement weight:
 *
 *   GET    /__down?bytes=N  real random bytes, streamed, never cached/compressed
 *   POST   /__up?...        counts real request bytes without buffering them
 *   GET    /__ping          tiny no-store latency probe
 *   GET    /meta            real Cloudflare request metadata + client IP
 *   GET    /trace           Cloudflare trace-style text from real metadata
 *   OPTIONS *               CORS preflight
 */

interface CfRequestMetadata {
  colo?: unknown;
  country?: unknown;
  city?: unknown;
  asn?: unknown;
  organization?: unknown;
  timezone?: unknown;
  httpProtocol?: unknown;
  tlsVersion?: unknown;
}

const MIN_DOWNLOAD_BYTES = 1 * 1024;
const DEFAULT_DOWNLOAD_BYTES = 8 * 1024 * 1024;
const MAX_DOWNLOAD_BYTES = 64 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 128 * 1024 * 1024;
const RANDOM_CHUNK_BYTES = 64 * 1024;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Requested-With, Cache-Control, Pragma",
  "Access-Control-Expose-Headers": "Content-Length, Content-Type, server-timing, cf-meta-ip, cf-meta-country, cf-meta-city, cf-meta-colo, cf-meta-asn, cf-meta-postalCode, cf-meta-timezone, country, city, colo, asn",
  "Access-Control-Max-Age": "86400",
};

function makeHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);

  // Every probe response must bypass browser and edge caches.
  headers.set("Cache-Control", "no-store");
  headers.set("CDN-Cache-Control", "no-store");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");

  for (const [name, value] of Object.entries(CORS_HEADERS)) headers.set(name, value);
  headers.set("X-Content-Type-Options", "nosniff");

  return headers;
}

function setMetadataHeaders(headers: Headers, request: Request): void {
  const meta = metadataPayload(request);
  const values: Record<string, string | number | null> = {
    "cf-meta-ip": meta.clientIp,
    "cf-meta-country": meta.country,
    "cf-meta-city": meta.city,
    "cf-meta-colo": meta.colo,
    "cf-meta-asn": meta.asn,
    "cf-meta-timezone": stringOrNull(cfMetadata(request).timezone),
    country: meta.country,
    city: meta.city,
    colo: meta.colo,
    asn: meta.asn,
  };
  for (const [name, value] of Object.entries(values)) {
    if (value !== null && value !== "") headers.set(name, String(value));
  }
}

function jsonResponse(body: unknown, status = 200, extra?: HeadersInit): Response {
  const headers = makeHeaders(extra);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers });
}

function textResponse(body: string, status = 200, extra?: HeadersInit): Response {
  const headers = makeHeaders(extra);
  headers.set("Content-Type", "text/plain; charset=utf-8");
  return new Response(body, { status, headers });
}

function withoutBodyForHead(request: Request, response: Response): Response {
  if (request.method !== "HEAD") return response;
  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

function isGetOrHead(method: string): boolean {
  return method === "GET" || method === "HEAD";
}

function methodNotAllowed(allow: string): Response {
  return jsonResponse({ error: "method_not_allowed", allow }, 405, { Allow: allow });
}

function requestedBytes(url: URL): number {
  const raw = url.searchParams.get("bytes");
  const parsed = raw === null ? Number.NaN : Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_DOWNLOAD_BYTES;
  return Math.min(MAX_DOWNLOAD_BYTES, Math.max(MIN_DOWNLOAD_BYTES, Math.floor(parsed)));
}

function randomBytesStream(totalBytes: number): ReadableStream<Uint8Array> {
  let remaining = totalBytes;

  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (remaining <= 0) {
        controller.close();
        return;
      }

      // Web Crypto limits one getRandomValues call to 65536 bytes.
      const size = Math.min(RANDOM_CHUNK_BYTES, remaining);
      const chunk = new Uint8Array(size);
      crypto.getRandomValues(chunk);
      remaining -= size;
      controller.enqueue(chunk);

      if (remaining === 0) controller.close();
    },
  });
}

function handleDownload(request: Request, url: URL): Response {
  const bytes = requestedBytes(url);
  const headers = makeHeaders();

  headers.set("Content-Type", "application/octet-stream");
  headers.set("Content-Disposition", 'attachment; filename="netvelox-download.bin"');
  headers.set("Content-Encoding", "identity");
  headers.set("Accept-Ranges", "none");
  headers.set("Content-Length", String(bytes));
  setMetadataHeaders(headers, request);

  if (request.method === "HEAD") return new Response(null, { status: 200, headers });
  return new Response(randomBytesStream(bytes), { status: 200, headers });
}

async function handleUpload(request: Request): Promise<Response> {
  if (!request.body) return jsonResponse({ received: 0 }, 200);

  const reader = request.body.getReader();
  let received = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      received += value?.byteLength ?? 0;
      if (received > MAX_UPLOAD_BYTES) {
        await reader.cancel().catch(() => undefined);
        return jsonResponse(
          { error: "upload_too_large", received: MAX_UPLOAD_BYTES },
          413,
        );
      }
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    return jsonResponse({ error: "upload_read_failed", received }, 400);
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // The stream may already be released after cancel(); nothing else to do.
    }
  }

  return jsonResponse({ received }, 200);
}

function cfMetadata(request: Request): CfRequestMetadata {
  return ((request as Request & { cf?: CfRequestMetadata }).cf ?? {}) as CfRequestMetadata;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asnOrNull(value: unknown): number | string | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}

function metadataPayload(request: Request) {
  const cf = cfMetadata(request);

  return {
    colo: stringOrNull(cf.colo),
    country: stringOrNull(cf.country),
    city: stringOrNull(cf.city),
    asn: asnOrNull(cf.asn),
    organization: stringOrNull(cf.organization),
    clientIp: stringOrNull(request.headers.get("cf-connecting-ip")),
  };
}

function tracePayload(request: Request): string {
  const cf = cfMetadata(request);
  const meta = metadataPayload(request);
  const lines: string[] = [];

  const add = (key: string, value: string | number | null): void => {
    if (value === null || value === "") return;
    lines.push(`${key}=${String(value)}`);
  };

  add("h", stringOrNull(request.headers.get("host")));
  add("ip", meta.clientIp);
  add("ts", Date.now());
  add("colo", meta.colo);
  add("country", meta.country);
  add("city", meta.city);
  add("asn", meta.asn);
  add("org", meta.organization);
  add("uag", stringOrNull(request.headers.get("user-agent")));
  add("scheme", stringOrNull(request.headers.get("x-forwarded-proto")));
  add("http", stringOrNull(cf.httpProtocol));
  add("tls", stringOrNull(cf.tlsVersion));

  return `${lines.join("\n")}\n`;
}

export async function handleRequest(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: makeHeaders() });

    switch (path) {
      case "/__down":
        if (!isGetOrHead(request.method)) return methodNotAllowed("GET, HEAD");
        return handleDownload(request, url);
      case "/__up":
        if (request.method !== "POST") return methodNotAllowed("POST");
        return await handleUpload(request);
      case "/__ping":
        if (!isGetOrHead(request.method)) return methodNotAllowed("GET, HEAD");
        return withoutBodyForHead(request, textResponse("pong\n"));
      case "/meta":
        if (!isGetOrHead(request.method)) return methodNotAllowed("GET, HEAD");
        return withoutBodyForHead(request, jsonResponse(metadataPayload(request)));
      case "/trace":
        if (!isGetOrHead(request.method)) return methodNotAllowed("GET, HEAD");
        return withoutBodyForHead(request, textResponse(tracePayload(request)));
      default:
        return jsonResponse({ error: "not_found", path }, 404);
    }
  } catch {
    return jsonResponse({ error: "internal_error" }, 500);
  }
}

