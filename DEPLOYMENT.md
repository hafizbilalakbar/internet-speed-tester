# Deployment

Netvelox uses two production surfaces:

- **Cloudflare Worker (`worker/`)** — 100% of measurement weight. `/__down`, `/__up`, `/__ping`, `/meta`, and `/trace` are served at the edge and are independent of the Node API.
- **Cloudflare Pages** — the built Angular static site from `dist/netvelox/browser`.

The **Node API is only for results/history/admin**: result persistence, share links, history, admin auth, server registry, analytics, and optional AI analysis. It is not in the download/upload/latency hot path.

## Prerequisites

```bash
npm install
npx wrangler login
```

`wrangler login` is interactive; run it once per machine. For CI, use `CLOUDFLARE_API_TOKEN` instead.

The account id is already pinned in `worker/wrangler.toml` and in the Pages command below. If you also want it available to other CLI steps, export it:

```bash
export CLOUDFLARE_ACCOUNT_ID=716149166b03b22b156affd6872d24dd
```

## 1. Deploy the edge worker

```bash
cd worker && npx wrangler deploy
```

`worker/wrangler.toml` contains the worker name, entry point (`src/index.ts`), compatibility date, and `account_id`. Add a route or custom domain to that file later if you want the worker on a branded hostname instead of `workers.dev`.

### Edge endpoint contract

| Endpoint | Purpose |
| --- | --- |
| `GET /__down?bytes=N` | Streams real random bytes. Clamped to 1 KiB–64 MiB. `application/octet-stream`, `Content-Encoding: identity`, HEAD supported, never cached or compressed. |
| `POST /__up?...` | Reads and counts real request bytes up to 128 MiB without buffering. Returns `{ "received": N }`. |
| `GET /__ping` | Tiny no-store response for RTT/loaded-latency probes. |
| `GET /meta` | Real `request.cf` values (`colo`, `country`, `city`, `asn`, `organization`) plus `clientIp` from `CF-Connecting-IP`. Missing fields are `null`. |
| `GET /trace` | Cloudflare trace-style text built only from real request metadata; no fabricated values. |

All of these responses send `Cache-Control: no-store` and `CDN-Cache-Control: no-store`, so probes measure the network rather than a browser or edge cache. Range requests are not required.

### CORS

The worker sends `Access-Control-Allow-Origin: *`, exposes `Content-Length`/`Content-Type`, and answers `OPTIONS` preflight with `204`. Keep the wildcard while the speed test is public. If you later restrict origins, reflect only allowlisted origins and add `Vary: Origin`.

## 2. Point the web app at the worker

Use the deployed worker URL as the measurement endpoint base for the edge routes above. Keep the Node API URL only for the results/history/admin calls. This split is deliberate: measurement traffic scales at the edge, while durable state stays in the Node API/PostgreSQL.

## 3. Build and deploy Pages

```bash
npm run build
npx wrangler pages deploy dist/netvelox/browser --project-name netvelox --account-id 716149166b03b22b156affd6872d24dd
```

`npm run build` produces `dist/netvelox/browser`. No root `wrangler.toml` is required for this deploy because the project name and account id are passed explicitly. Add a root Pages config only if you later need Pages-specific headers, redirects, or functions.

## Rollout order

1. Deploy the worker with `cd worker && npx wrangler deploy`.
2. Confirm `/__ping`, `/__down`, `/__up`, `/meta`, and `/trace` are reachable from a browser with the expected no-store and CORS headers.
3. Point the web app's edge measurement base URL to the worker.
4. Build and deploy Pages with the commands above.
5. Keep the Node API running for results, history, share links, admin, and analytics only.
6. Monitor worker invocations/errors and Node API load; measurement volume should appear on the worker, not the Node API.
