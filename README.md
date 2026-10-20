<p align="center">
  <img src="packages/web/public/icons/icon.svg" width="72" alt="Contrail logo">
</p>
<h1 align="center">Contrail</h1>
<p align="center"><strong>See the sky in motion.</strong> A full-featured, self-hostable live flight tracker: real-time 2D map, 3D cockpit/chase views, airports with live boards and weather, playback of past traffic, alerts, AR sky view and an installable PWA.</p>

---

## Features

**Live map** — full-screen MapLibre GL map with a custom WebGL layer that renders 10,000+ aircraft at 60 fps (interpolation runs in the vertex shader, so motion between 5-second pushes is smooth with zero per-frame CPU work). Icons are rotated by heading and sized by category (heavy, jet, prop, light, helicopter, glider, ground vehicle, military). Selected aircraft get an altitude-coloured trail. Four basemaps (dark, light, satellite, terrain) and toggleable layers: airports, ATC/FIR boundaries, weather radar, cloud cover (IR satellite), airways, navaids and the day/night terminator. Emergency squawks (7500/7600/7700) raise a banner. Every aircraft shows its data source: ADS-B, MLAT, TIS-B, ADS-C, FLARM or *estimated* (dead-reckoned when the feed goes quiet).

**Flight details** — callsign, flight number, airline logo, aircraft type, registration, photo (Planespotters.net, attributed), origin/destination with scheduled/estimated/actual times, terminal and gate, progress bar with distance flown/remaining, live altitude, speed, vertical rate, track, squawk, coordinates, and an altitude/speed chart for the whole flight. Actions: 3D view, follow, share link, bookmark, set alert, airframe and route history.

**3D view** — CesiumJS globe with terrain and OSM buildings (with a Cesium ion token), a glTF aircraft model posed from live data (heading, pitch from vertical rate, roll from turn rate), cockpit / chase / wing / orbit / free cameras, nearby traffic and real-time sun lighting.

**Search & filters** — one search box for flight numbers, callsigns, registrations, hex codes, airlines, airports (IATA/ICAO/name) and aircraft types, including recently tracked aircraft from the database. Combinable, saveable filters: airline, type, altitude, speed, origin/destination, category, airborne vs ground, data source.

**Airports** — airport pages with live arrivals/departures boards (status, gate, terminal, delay), aircraft on the ground, METAR/TAF (decoded + raw), runway table and diagram, a delay index, and a global disruption map colouring airports by delay severity.

**Playback & history** — replay any area and time range (≤24 h) from the TimescaleDB position store with a timeline slider and speed control; past flights by registration and route history by flight number, each with its stored track and chart.

**Accounts & alerts** — email/password accounts, bookmarks (map views, flights, airports), saved filters and settings (units, time zone, icon size, trail length) synced to the server; departure / landing / delay / emergency alerts via Web Push and email.

**Extras** — mobile AR mode (camera + compass + GPS → aircraft overhead), stats dashboard (tracked aircraft over time, busiest airports and airlines, data sources, feed health), deep links for map position and flights, installable PWA with offline shell, responsive layout with a bottom sheet on mobile.

## Architecture

```
packages/
  shared/   TypeScript domain types, geo math, airline/type tables, classification, WS wire format
  server/   Node 22 + Fastify: feed pollers → merge store → WebSocket hub; REST API; PostgreSQL + TimescaleDB
  web/      React 19 + Vite + Tailwind v4; MapLibre GL (2D, custom WebGL layer); CesiumJS (3D); PWA
docker/     Dockerfiles, nginx config, DB init
scripts/    data preparation, icon and glTF generation
```

Data flow: feed adapters (OpenSky / adsb.lol / airplanes.live / synthetic) poll on their own schedule with backoff → `AircraftStore` merges per-aircraft state across feeds (newest position wins, better source wins on ties), classifies, keeps in-memory trails, dead-reckons quiet aircraft and expires stale ones → the recorder batches positions into the `positions` hypertable and maintains one `flights` row per tracked flight → the WebSocket hub pushes viewport-scoped updates every 5 s (full rows only for new/changed aircraft, compact position rows otherwise). The client stores previous/next positions per aircraft and the GL layer interpolates between them.

## Quick start (Docker)

```bash
git clone https://github.com/swissmarley/aviatorapp contrail && cd contrail
cp .env.example .env            # optional: add API keys (see below)
docker compose up --build
```

Open <http://localhost:3000>. With no keys configured the server runs the **synthetic** feed: ~1,500 deterministic aircraft flying real routes between real airports with schedules, delays, helicopters, gliders, ground vehicles and periodic emergency squawks, so every screen is populated. Switch to live data by setting `FEEDS` (see *Data sources*).

Services: `web` (nginx, port 3000, proxies `/api` and `/ws`), `server` (port 8080 inside the network), `db` (TimescaleDB on 5432).

## Local development

Requirements: Node ≥ 20.19 (22 recommended), PostgreSQL 14+ (TimescaleDB optional; without it the schema still works, playback is just slower and there is no retention policy).

```bash
npm install
cp .env.example .env
# optional database for playback/history/accounts:
#   createdb contrail && echo DATABASE_URL=postgres://localhost/contrail >> .env
npm run dev          # API on :8080, web on :5173 (Vite proxies /api and /ws)
```

Other scripts: `npm run build`, `npm run typecheck`, `npm test`, `npm run data:prepare -- --download` (refresh bundled OurAirports/FIR data), `npm run model:generate` (rebuild the glTF aircraft), `npm run icons:generate`.

## Data sources and API keys

Everything is optional. Each provider's terms are summarised; please read the originals before going public.

| Purpose | Provider | Key | Env | Notes |
|---|---|---|---|---|
| Live positions | [adsb.lol](https://api.adsb.lol/docs) | none | `FEEDS=adsblol` | Community feed, ≤1 req/s, descriptive User-Agent (set by default). Uses the global `/v2/all` endpoint when available, else 250 nm circles around configured regions and connected clients' viewports. |
| Live positions | [airplanes.live](https://airplanes.live/api-guide/) | none | `FEEDS=airplaneslive` | ≤1 req/s, 250 nm `point` queries; non-commercial use. |
| Live positions | [OpenSky Network](https://openskynetwork.github.io/opensky-api/rest.html) | account (free) | `FEEDS=opensky`, `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET` | Create an API client on your OpenSky account page (OAuth2 client credentials). Anonymous use works but has 400 credits/day; always set `FEED_BBOX`. Legacy `OPENSKY_USERNAME`/`OPENSKY_PASSWORD` also accepted. |
| Routes (origin/destination) | adsb.lol `routeset` (adsbdb) | none | on by default (`ROUTE_LOOKUP=true`) | Batched, cached 6 h. |
| Schedules & boards | [AeroDataBox](https://rapidapi.com/aedbx-aedbx/api/aerodatabox) | RapidAPI key | `AERODATABOX_API_KEY` | Flight by callsign, airport boards (12 h windows). Paid tiers; results cached 2–10 min. |
| Schedules & boards | [AviationStack](https://aviationstack.com/) | key | `AVIATIONSTACK_API_KEY` | Free tier is HTTP-only and limited; set `AVIATIONSTACK_BASE_URL=https://…` on paid plans. |
| Aircraft photos | [Planespotters.net](https://www.planespotters.net/photo/api) | none | `PLANESPOTTERS_ENABLED` | Non-commercial; photographer attribution and link back are rendered; responses cached 24 h. |
| METAR / TAF | [aviationweather.gov](https://aviationweather.gov/data/api/) | none | `AVIATIONWEATHER_BASE_URL` | Cached 5 min. |
| Radar & clouds | [RainViewer](https://www.rainviewer.com/api/weather-maps-api.html) | none | `RAINVIEWER_URL` | Free tier, attribution shown on the map. |
| Airports, runways, navaids | [OurAirports](https://ourairports.com/data/) | none | `OURAIRPORTS_REFRESH` | Public domain. A filtered copy is bundled; set `true` to refresh at startup. |
| FIR boundaries | [VATSpy data project](https://github.com/vatsimnetwork/vatspy-data-project) | none | `FIR_GEOJSON_URL` | Bundled simplified copy of `Boundaries.geojson`. |
| Airways | your own GeoJSON (e.g. exported from [openAIP](https://www.openaip.net/)) | — | `AIRWAYS_GEOJSON_URL` | No free global airway dataset is bundled; the layer renders whatever LineString collection you point it at. |
| Basemaps | CARTO (dark/light), Esri World Imagery (satellite), OpenTopoMap (terrain) | none | — | Default raster tiles, attribution shown. Set `VITE_MAPTILER_KEY` for MapTiler vector styles. |
| 3D terrain & buildings | [Cesium ion](https://ion.cesium.com/) | token (free tier) | `VITE_CESIUM_ION_TOKEN` | Without it the 3D view uses an ellipsoid globe and OSM imagery. |
| Web push | VAPID keys | `npx web-push generate-vapid-keys` | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | |
| Email alerts | any SMTP | — | `SMTP_URL`, `SMTP_FROM` | |

Rate limiting: every adapter has a token-bucket style minimum interval, exponential backoff on errors, and all upstream responses are cached in memory and in the `api_cache` table.

### Choosing feeds

```ini
# good default for a public instance (no keys):
FEEDS=adsblol,airplaneslive
FEED_BBOX=-25,30,45,72          # Europe; omit for global when adsb.lol's /v2/all is available
# add OpenSky with an account for extra coverage (MLAT, FLARM):
FEEDS=adsblol,opensky
OPENSKY_CLIENT_ID=…
OPENSKY_CLIENT_SECRET=…
```

Multiple feeds are merged per ICAO address; each aircraft shows which feed and position source it came from.

## Configuration reference

See [`.env.example`](.env.example) for every variable with comments. The most important:

| Variable | Default | Meaning |
|---|---|---|
| `FEEDS` | `synthetic` | Comma-separated feed adapters |
| `FEED_BBOX` | — | Only poll/store this region |
| `WS_PUSH_INTERVAL_MS` | `5000` | Client update cadence (5–10 s recommended) |
| `ESTIMATE_AFTER_S` / `EXPIRE_AIRBORNE_S` / `EXPIRE_GROUND_S` | `12` / `90` / `300` | Dead-reckoning and expiry thresholds |
| `DATABASE_URL` | — | Enables recording, playback, history, accounts, alerts, stats history |
| `POSITION_RETENTION_DAYS` | `7` | Timescale retention policy for positions |
| `JWT_SECRET` | change it | Session signing key |
| `PUBLIC_URL` | `http://localhost:3000` | Used in notification links |

## API overview

`GET /api/health`, `GET /api/aircraft?bbox=`, `GET /api/aircraft/:hex`, `GET /api/aircraft/:hex/track`, `GET /api/search?q=`, `GET /api/airports?bbox=&zoom=`, `GET /api/airports/:code{,/board,/weather,/traffic,/delay-history}`, `GET /api/airports/disruptions`, `GET /api/layers/{fir,airways,navaids,terminator,radar}`, `GET /api/history/positions?bbox=&from=&to=`, `GET /api/history/registration/:reg`, `GET /api/history/flight/:no`, `GET /api/stats?range=`, `POST /api/auth/{register,login,logout}`, `GET /api/me`, `PUT /api/me/settings`, `/api/me/{bookmarks,filters,alerts,push}`. WebSocket: `GET /ws` — client sends `{t:'view',bbox,zoom}` / `{t:'select',hex}`; server sends `snap` / `upd` / `sel` / `emerg` messages (see `packages/shared/src/wire.ts`).

## Delivery phases

1. Live map and details — custom GL layer, trails, styles, layers, emergencies, data sources, details panel ✔
2. Search, filters, airports — unified search, saveable filters, airport pages, boards, METAR/TAF, runways, disruption map ✔
3. 3D view — Cesium globe, posed glTF model, camera modes, nearby traffic, sun lighting ✔
4. Playback and history — Timescale replay with timeline, registration and flight-number history ✔
5. Accounts, alerts, AR — accounts, bookmarks, settings sync, push/email alerts, stats, PWA, AR mode ✔

## Testing

`npm test` runs Vitest suites for the shared library (geo, classification, wire format) and the server (feed mapping, store merging/dead-reckoning/expiry, synthetic feed). Headless rendering of every page was verified with Playwright during development.

## Licence

MIT — see [LICENSE](LICENSE). Third-party data remains under its providers' terms (attribution is displayed in the UI where required).
