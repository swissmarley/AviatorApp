import 'dotenv/config';
import { z } from 'zod';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const bool = z
  .union([z.string(), z.boolean()])
  .optional()
  .transform((v) => (typeof v === 'boolean' ? v : v === undefined ? undefined : /^(1|true|yes|on)$/i.test(v)));
const intOr = (d: number) => z.coerce.number().int().default(d);
const list = z.string().optional().transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []));

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: intOr(8080),
  HOST: z.string().default('0.0.0.0'),
  PUBLIC_URL: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.string().default('info'),
  JWT_SECRET: z.string().default('change-me-in-production'),
  CORS_ORIGINS: list,

  DATABASE_URL: z.string().optional(),
  DB_REQUIRED: bool.default(false),
  POSITION_RETENTION_DAYS: intOr(7),
  RECORD_POSITIONS: bool.default(true),
  RECORD_MIN_INTERVAL_S: intOr(5),

  FEEDS: z.string().default('synthetic'),
  FEED_BBOX: z.string().optional(),
  WS_PUSH_INTERVAL_MS: intOr(5000),
  WS_MAX_AIRCRAFT: intOr(20000),
  ESTIMATE_AFTER_S: intOr(12),
  EXPIRE_AIRBORNE_S: intOr(90),
  EXPIRE_GROUND_S: intOr(300),
  TRAIL_MAX_POINTS: intOr(2000),

  OPENSKY_CLIENT_ID: z.string().optional(),
  OPENSKY_CLIENT_SECRET: z.string().optional(),
  OPENSKY_USERNAME: z.string().optional(),
  OPENSKY_PASSWORD: z.string().optional(),
  OPENSKY_INTERVAL_MS: intOr(15000),

  ADSBLOL_BASE_URL: z.string().default('https://api.adsb.lol'),
  ADSBLOL_INTERVAL_MS: intOr(6000),
  AIRPLANESLIVE_BASE_URL: z.string().default('https://api.airplanes.live'),
  AIRPLANESLIVE_INTERVAL_MS: intOr(6000),
  READSB_REGIONS: z.string().optional(),
  READSB_MIN_REQUEST_INTERVAL_MS: intOr(1100),

  SYNTHETIC_COUNT: intOr(1500),
  SYNTHETIC_SEED: intOr(42),

  AERODATABOX_API_KEY: z.string().optional(),
  AERODATABOX_HOST: z.string().default('aerodatabox.p.rapidapi.com'),
  AVIATIONSTACK_API_KEY: z.string().optional(),
  ROUTE_LOOKUP: bool.default(true),
  ROUTESET_URL: z.string().default('https://api.adsb.lol/api/0/routeset'),

  PLANESPOTTERS_ENABLED: bool.default(true),
  AVIATIONWEATHER_BASE_URL: z.string().default('https://aviationweather.gov/api/data'),
  RAINVIEWER_URL: z.string().default('https://api.rainviewer.com/public/weather-maps.json'),
  OURAIRPORTS_REFRESH: bool.default(false),
  AIRWAYS_GEOJSON_URL: z.string().optional(),
  FIR_GEOJSON_URL: z.string().optional(),
  AIRLINE_LOGO_URL_TEMPLATE: z.string().optional(),

  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:admin@example.com'),
  SMTP_URL: z.string().optional(),
  SMTP_FROM: z.string().default('Contrail <no-reply@example.com>'),

  USER_AGENT: z.string().default('Contrail/0.1 (+https://github.com/swissmarley/aviatorapp)'),
  DATA_DIR: z.string().default(path.resolve(__dirname, '..', 'data')),
  SERVE_WEB_DIR: z.string().optional(),
});

export type Config = z.infer<typeof schema> & {
  feeds: string[];
  feedBBox?: { west: number; south: number; east: number; north: number };
  isProd: boolean;
};

function load(): Config {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid configuration:', parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  const c = parsed.data;
  let feedBBox: Config['feedBBox'];
  if (c.FEED_BBOX) {
    const [west, south, east, north] = c.FEED_BBOX.split(',').map(Number);
    if ([west, south, east, north].every(Number.isFinite)) feedBBox = { west, south, east, north };
  }
  return {
    ...c,
    feeds: c.FEEDS.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    feedBBox,
    isProd: c.NODE_ENV === 'production',
  };
}

export const config: Config = load();
