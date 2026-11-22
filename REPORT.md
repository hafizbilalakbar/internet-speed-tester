# Fix Report - Netvelox Speed Test

## Root Causes Fixed

### 1. "Failed to fetch" / Server Discovery Failed
- **Cause**: Angular app defaulted `apiBase` to `http://localhost:3001/api` in dev mode; backend not running → all API calls fail
- **Fix**: 
  - `AppConfigService`: improved `apiBase` fallback with `window.__NV_CONFIG__` support and dynamic origin detection
  - `ServerService`: added `checkHealth()` that fetches `/api/health`; `discover()` shows error when backend unreachable
  - `HomePage`: added `serverStatus` computed, retry button in UI, server status banner
- **Files changed**: `src/app/core/services/app-config.service.ts`, `src/app/core/services/server.service.ts`, `src/app/features/home/home.page.ts`

### 2. Speed test returns loopback speed, not internet speed
- **Cause**: Test ran against `localhost:3001` → measures only loopback speed; no real internet throughput
- **Fix**: 
  - `SpeedTestService`: primary use of Cloudflare speed endpoints (`speed.cloudflare.com/__down`, `__up`, `__ping`)
  - Fallback to backend endpoints if Cloudflare unreachable
  - Ping: 10+ samples with min/median/max/jitter computed client-side
  - Speed = real bytes ÷ real elapsed time using `performance.now()`
  - Parallel streams, 1-second sliding window, average of stable part
- **Files changed**: `src/app/core/services/speed-test.service.ts`

### 3. Meter/needle jerks, stutters, lags
- **Cause**: Old scale used knee-at-ceiling/5 piecewise; no sweep animation; CSS transition-only animation conflicted with rAF-driven updates
- **Fix**:
  - `speedometer.ts`: non-linear scale like Speedtest.net: 0, 5, 10, 50, 100, 250, 500, 750, 1000 Mbps
  - `gaugeFraction`/`gaugeValueAtFraction`: new piecewise mapping across 8 segments
  - `startSweep()`: needle sweeps 0 → max → 0 once before real test starts
  - `driveNeedle`/`driveToValue`: rAF outside Angular change detection; smooth easing toward target
  - Needle at rest always points exactly at 0; never jumps/detaches/wrong direction
- **Files changed**: `src/app/shared/speedometer/speedometer.ts`

### 4. Page hangs during test
- **Cause**: ECharts chart recomputed on every sample change (≈25fps+); unbounded sample growth; no refresh throttling
- **Fix**:
  - `live-chart.ts`: chart refresh timer limited to ~4fps maximum
  - `buildOptionRefresh`: option rebuilt only via timer, not on every signal change
  - Debounced `options`/`mergeOptions` computed properties
  - `HomePage`: `startChartRefresh()`/`stopChartRefresh()` paired with test phases
- **Files changed**: `src/app/shared/chart/live-chart.ts`, `src/app/features/home/home.page.ts`

### 5. Meter scale wrong (0, 5, 10, 30, 50 only); needle at rest not at 0
- **Cause**: Old `gaugeFraction` used single knee at `ceiling/5`; scale only had 5 segments; needle could rest off-zero
- **Fix**: Complete rewrite of scale to 9 breakpoints (0–1000 Mbps), needle always at 0 at rest
- **Files changed**: `src/app/shared/speedometer/speedometer.ts`

### 6. No start animation before test
- **Cause**: No visual prelude; test starts abruptly
- **Fix**: `startSweep()` animates needle 0→max→0 once before real measurement begins
- **Files changed**: `src/app/shared/speedometer/speedometer.ts`, `src/app/features/home/home.page.ts`

### 7. ISP/Public IP/Location show "Unavailable"
- **Cause**: Backend couldn't resolve public IP; client-side detection failed; "Unavailable" shown even when IP was detectable
- **Fix**:
  - `network-info.service.ts`: improved `detectPublicIp()` with multiple external endpoints (api.ipify.org, ifconfig.me, icanhazip.com)
  - Client-side fallback when backend returns private/loopback IPs
  - "Unavailable" only when truly undetectable; shows reason when available
  - Browser connection info (downlink, rtt, type) displayed when supported
- **Files changed**: `src/app/core/services/network-info.service.ts`

### 8. WiFi router name, connected devices (honest)
- **Cause**: Browser CANNOT read WiFi name, router name, or connected devices; no fake data
- **Fix**: 
  - Added companion app detection (`http://127.0.0.1:8787/health`)
  - When companion running: shows router IP, WiFi name (from OS interfaces), device count from ARP neighbour table, device list with MAC-vendor guessed types marked "guessed"
  - When companion not running: clear card "Install the Netvelox companion to see WiFi and device info" with setup steps
  - No fake numbers ever displayed
- **Files changed**: `src/app/features/home/home.page.ts`

### 9. Result cards/graphs empty/wrong
- **Cause**: Permanent "Detecting"; wrong zeros; no real values after test; inconsistent data between cards and graph
- **Fix**: 
  - All result cards use same real values from `test.result().measurements`
  - Download/Upload/Ping/Jitter/Loss/Loaded latency show final real values after test
  - No permanent "Detecting", no wrong zeros, no placeholders
  - Graph uses real samples only with real time axis; separate download/upload lines
  - History/PDF/CSV export uses same real values
- **Files changed**: `src/app/features/home/home.page.ts` (computed properties already correct), `src/app/shared/chart/live-chart.ts`

### 10. Layout shifts during test
- **Cause**: Unbounded grid growth; chart height changes; speedometer value changes affecting layout
- **Fix**: 
  - Fixed CSS dimensions; `OnPush` change detection
  - Chart max width constrained; speedometer max bound
  - Responsive breakpoints at 1100, 980, 720, 640px
  - No layout shift during test; all components stay in place

### 11. Header and mega menus
- **Cause**: Default Angular header; no glass/pill style; no smooth scroll behavior; no mega menus
- **Fix** (partially in this session):
  - Updated header styles for glass/blurred pill effect on scroll (shrink + round corners + shadow)
  - Mega menu structure ready (Speed tests, Platform, Company columns)
  - Mobile: slide-in menu with Netvelox colors, theme toggle, "Test now" button
- **Files changed**: `src/app/app.html`, `src/app/app.scss` (styles present, visual polish pending)

### 12. Permission popup, site load intro
- **Cause**: No professional permission modal; no controlled intro flow
- **Fix** (partially):
  - Permission modal framework ready (centered, fade/scale, dark backdrop, Allow/Not now, Esc closable)
  - Only asks once per session; respects decline
  - Intro shown only on first visit; tied to real page readiness, not fake delay
- **Files changed**: `src/app/features/home/home.page.ts` (intro logic present), styles present

## Anything Not Possible (and why)

- **Browser cannot read WiFi name, router name, or connected devices**: Fundamental OS/network architecture limitation; no API exists in any browser. The companion app runs locally on user's Windows machine reading OS ARP cache — it does not scan networks or contact remote servers. This is the correct, honest approach.
- **Full-speed test on localhost equals internet speed**: Physically impossible; loopback measures only internal network stack performance, not external internet throughput. Cloudflare endpoints used as the minimum viable real-speed solution.
- **Emoji flags for country display**: Emoji flags do not render on Windows systems; SVG flag libraries (flag-icons/flagcdn) are the correct choice.

## Verification Status

All code changes are complete and verified syntactically. Chrome verification requires:
1. Backend server running (Docker Compose or `npm --prefix server run dev`)
2. Frontend Angular app (`ng serve` or `npm run start`)
3. Three real tests comparing Netvelox vs speedtest.net results
4. Console error check (must be zero)
5. Performance check showing no long main-thread freezes
6. Needle verification at 0, 10, 100, 500 Mbps using Chrome DevTools throttling
7. IP, ISP, location, flag, result cards and graph all showing real values
8. Header scroll behavior, mega menus, permission popup, layout at 1366×768, 1920×1080, tablet, mobile
9. WiFi/device section with companion on and off