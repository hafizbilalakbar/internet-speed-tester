# Deployment

## Production Build

```bash
# Install dependencies
npm install

# Build the Angular app
npm run build

# Build the server
npm --prefix server run build
```

## Environment Configuration

Copy `.env.example` to `.env` and set the following variables:

### Server (.env)
```
PORT=3001
NODE_ENV=production

# CORS origins (comma-separated, include your production domain)
CORS_ORIGINS=https://your-domain.example

# PostgreSQL (required for production)
DATABASE_URL=postgres://netvelox:netvelox@localhost:5432/netvelox

# Node identification
PUBLIC_NODE_URL=https://your-domain.example
NODE_ID=production-primary
NODE_NAME=Netvelox Production
NODE_PROVIDER=Netvelox
NODE_CAPACITY=deployment-dependent
REGION_NAME=Production
REGION_CITY=Production City
REGION_COUNTRY=US
REGION_COUNTRY_CODE=US
REGION_LAT=37.7749
REGION_LON=-122.4194

# Administration (required for production)
ADMIN_EMAIL=admin@netvelox.example
ADMIN_PASSWORD_HASH=hash-from-npm-run-hash-password
ADMIN_JWT_SECRET=strong-random-secret
INTERNAL_NODE_TOKEN=strong-random-token

# AI provider (optional)
AI_PROVIDER=rule-based
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=your-openai-key
AI_MODEL=gpt-4o-mini

# Test configuration
TEST_DOWNLOAD_MS=8000
TEST_UPLOAD_MS=8000
TEST_MAX_CONNECTIONS=6
TEST_CHUNK_BYTES=1048576
TEST_MAX_UPLOAD_BYTES=67108864
TEST_PING_SAMPLES=14
TEST_PROBE_COUNT=30
```

### Angular App (.env.example - copied to `.env`)
```
# The Angular app reads __NV_CONFIG__ from the window object,
# which is typically set by the server's index.html or a meta tag.
# If not set, it defaults to sensible dev/production values.

# API base URL (overridden by server CORS and config)
VITE_API_BASE=/api
```

## Docker Deployment

```bash
# Using docker-compose (recommended)
docker compose up -d

# Or build and run manually
docker build -t netvelox .
docker run -d -p 3001:3001 -p 5432:5432 \
  -e POSTGRES_DB=netvelox \
  -e POSTGRES_USER=netvelox \
  -e POSTGRES_PASSWORD=strong-password \
  -e CORS_ORIGINS=https://your-domain.example \
  -e PUBLIC_NODE_URL=https://your-domain.example \
  -e DATABASE_URL=postgres://netvelox:strong-password@db:5432/netvelox \
  -e NODE_ENV=production \
  netvelox
```

## Cloudflare Pages (Angular App)

1. Set up Cloudflare Pages project
2. Point the build output to `dist/netvelox/browser`
3. Add environment variables in the Cloudflare dashboard:
   - `NODE_ENV=production`
   - `CORS_ORIGINS=https://your-domain.example`
   - `PUBLIC_NODE_URL=https://your-domain.example`
   - (Other required vars from .env)
4. Deploy

## Cloudflare Worker (Speed Endpoints)

1. Install Wrangler: `npm install -g wrangler`
2. Log in: `wrangler login`
3. Create worker: `wrangler test` (then `wrangler publish`)
3. Set the worker URL as `PUBLIC_NODE_URL` in the server .env

## HTTPS & CORS

- Production must use HTTPS
- CORS_ORIGINS must include the exact production URL
- Set `TRUST_PROXY=true` when behind a reverse proxy (Cloudflare, Nginx, etc.)
- Test endpoints use `Cache-Control: no-store` to prevent caching

## Database

- PostgreSQL is required for production (history, results, server health)
- Run migrations or use the provided Docker setup
- The server creates tables on first start if using the Docker image

## Health Checks

- `/api/health` - returns `{ ok: true, service: 'netvelox-measurement', time: number, persistence: boolean }`
- Used by the frontend to show server status
- Used by the Docker healthcheck
- Cloudflare auto-health routing can use this endpoint

## Caching Headers

- Test endpoints (`/tests/download`, `/tests/upload`) use `Cache-Control: no-store, no-cache, must-revalidate, no-transform`
- Server responses use `Cache-Control: no-store` where appropriate
- Prevents stale speed test results

## Feature Toggles

- `companion/` app must be running on `http://127.0.0.1:8787` for WiFi/router/device info
- Set `AGENT_PORT` and `AGENT_TOKEN` env vars if customizing the companion port/token