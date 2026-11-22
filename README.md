# Netvelox — Internet Speed Test & Network Intelligence

Netvelox is a premium, open-architecture internet speed testing and network diagnostics platform built with **Angular 22** and a **Node.js/TypeScript measurement API**. It measures real data transfer, latency, jitter, application-layer probe loss, loaded latency and connection stability, then produces transparent scores and intelligent explanations.

> **Accuracy first:** no random numbers, no decorative speed animations disconnected from measurements, no fake Wi-Fi device discovery. If a measurement is unavailable, the interface says so.

## What is implemented

### Frontend (Angular)
- Speedtest-inspired home screen with a lightweight SVG speedometer, animated needle, dynamic metric-specific colours and real-time throughput chart.
- Complete test flow: server discovery → ping → download → upload → diagnostics → result → persistence/share.
- Parallel adaptive no-cache download streaming with byte counting; random-payload upload with server acknowledgement.
- Idle latency, min/max/median, jitter, HTTP probe loss, loaded latency during both directions, stability scoring.
- Results page with charts, quality score, suitability scores, AI/rule-based analysis, PDF/CSV export, print, share controls and unique result IDs.
- Public share links hide IP/ISP/location unless explicitly enabled.
- Automatic server discovery with real latency ranking, manual selection and failover guidance.
- Network information (externally inferred IP/ISP/ASN/location, browser-reported connection estimates, optional explicit geolocation permission).
- Network tools: IP/IPv6 lookup, DNS-over-HTTPS with response time, HTTP headers, TLS handshake diagnostics, live ping/jitter/probe-loss/stability tests, connectivity checks.
- Local/Wi-Fi diagnostics with a clear statement of browser limitations and an optional local companion agent interface.
- Test history, side-by-side comparison, global analytics with sample-size gates.
- SEO landing pages, substantive guides, privacy policy, branded 404 page, sitemap, robots.txt, Open Graph/Twitter metadata, JSON-LD.
- Dark/light themes with no initial flicker, persisted preference and OS default; optional synthesised sound cues (off by default).
- Lazy-loaded routes, lazily imported Three.js globe with WebGL fallback, lightweight CSS/SVG motion, responsive layouts from 320 px upward.

### Backend (`server/`)
- REST API with security headers, strict CORS, rate limiting, validation and safe error messages.
- Real download/upload/ping endpoints with no-store headers, upload size limits and abort handling.
- Server registry with health checks, heartbeats, enable/disable controls and documented expansion.
- PostgreSQL schema for users, sessions, results, server health, AI analyses, admin config and error reports.
- JWT + bcrypt admin authentication with role checks; admin overview, server management and operational logs.
- Rule-based AI analysis with optional OpenAI-compatible provider configured server-side only.
- Aggregated statistics with minimum sample-size thresholds.

### Companion (`companion/`)
- Optional localhost-only Node service that reads the OS neighbour cache with a token. No active scanning, no router access, no fabricated device names.

## Quick start

```bash
# 1. Install frontend dependencies
npm install

# 2. Install and configure the API
cd server
npm install
cp .env.example .env
#   set ADMIN_JWT_SECRET, generate ADMIN_PASSWORD_HASH (npm run hash-password -- "..."),
#   set CORS_ORIGINS for your frontend origin
cd ..

# 3. Start PostgreSQL (optional but recommended)
docker compose up -d postgres

# 4. Run both
npm run dev:api      # backend on :3001
npm start            # Angular dev server on :4200
```

Open http://localhost:4200 and click **GO**. If PostgreSQL is not configured, measurements still work, but result persistence and admin analytics are disabled.

See **DEPLOYMENT.md** for production hosting, HTTPS, regional nodes, backups and monitoring.
See **BRANDING.md** for brand research and domain availability results.
See **TESTING.md** for the verification checklist and test commands.

## Honest limitations

| Feature | Reality |
| --- | --- |
| Wi-Fi connected-device list | Browsers cannot enumerate router clients. Only the optional, permission-based companion agent reads the OS neighbour cache. |
| Packet loss | Measured with sequenced HTTP probes (application-layer approximation), clearly labelled — not ICMP. |
| Public IP / ISP / city | Externally inferred by IP intelligence providers; may be approximate or stale. |
| IPv6 availability | Reported only when an IPv6 endpoint responds. |
| HTTP/2 / HTTP/3 | Depends on your reverse proxy; the API reports what Node can observe and does not claim unsupported protocols. |
| Global rankings | Hidden until at least 50 genuine samples exist per group. |
| DNS lookup | Performed via DNS-over-HTTPS, not raw UDP sockets from the browser. |
| Precise location | Only after explicit browser permission, hidden in public links by default. |

## Project layout

```
src/app/core/          models, API/measurement/score/AI/results services
src/app/shared/        speedometer, charts, icons, globe, brand
src/app/features/      home, results, servers, tools, diagnostics, history, analytics, guides, admin
src/app/layout/        header and footer
server/src/            API, routes, services, database, middleware
companion/             optional local diagnostics agent
public/                logo, favicon, icons, social card, sitemap, robots
scripts/               deterministic brand asset generator
```

## License / trademark

Netvelox is an original brand created for this project. Domain availability was checked live via RDAP, but no domain was purchased. Verify trademark availability before commercial use.
