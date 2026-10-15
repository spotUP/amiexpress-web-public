/**
 * WEATHER - "weather in X", for the co-sysop. Two keyless Open-Meteo
 * calls: name to coordinates, coordinates to now. No signup, CORS open,
 * CC-BY-4.0, 10k calls/day non-commercial. Same demozoo shape: UA,
 * timeouts, 24h cache, fetcher seam.
 */
import axios from 'axios';

import { createExternalCache } from './cache';

const GEO = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST = 'https://api.open-meteo.com/v1/forecast';
export const EXTERNAL_TIMEOUT_MS = 8000;
const UA = 'amiexpress-web-bbs/1.0 (AI co-sysop lookups; https://bbs.uprough.net)';

const cache = createExternalCache();
/** Test seam. */
export function resetWeatherCache(): void { cache.reset(); }

export type Fetcher = (url: string, timeoutMs?: number) => Promise<any>;
const httpGet: Fetcher = async (url, timeoutMs) =>
  (await axios.get(url, { timeout: timeoutMs ?? EXTERNAL_TIMEOUT_MS, headers: { 'User-Agent': UA, Accept: 'application/json' } })).data;
let fetcher: Fetcher = httpGet;
/** Test seam: what fetches. */
export function setWeatherFetcher(f: Fetcher | null): void {
  fetcher = f ?? httpGet;
}

const cachedLookup = (key: string, build: () => Promise<string>): Promise<string> =>
  cache.lookup(key, build);

const WMO: Record<number, string> = {
  0: 'clear sky', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast',
  45: 'fog', 48: 'rime fog', 51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle',
  61: 'light rain', 63: 'rain', 65: 'heavy rain', 71: 'light snow', 73: 'snow',
  75: 'heavy snow', 77: 'snow grains', 80: 'light showers', 81: 'showers',
  82: 'violent showers', 85: 'snow showers', 86: 'heavy snow showers',
  95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'thunderstorm with heavy hail',
};

export function wmoWords(code: number): string {
  return WMO[code] ?? `weather code ${code}`;
}

export async function weatherNow(place: string): Promise<string> {
  const p = place.trim().slice(0, 80);
  if (!p) return 'Which place?';
  return cachedLookup(`wx:now:${p.toLowerCase()}`, async () => {
    const geo = await fetcher(`${GEO}?name=${encodeURIComponent(p)}&count=1&language=en`);
    const loc = geo?.results?.[0];
    if (!loc) return `No place called "${p}" in the gazetteer.`;
    const f = await fetcher(
      `${FORECAST}?latitude=${loc.latitude}&longitude=${loc.longitude}` +
      `&current=temperature_2m,weather_code,wind_speed_10m` +
      `&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto`,
    );
    const cur = f?.current;
    if (!cur) return `No forecast for ${loc.name}.`;
    const day = f?.daily;
    const hi = day?.temperature_2m_max?.[0];
    const lo = day?.temperature_2m_min?.[0];
    const where = `${loc.name}${loc.country ? `, ${loc.country}` : ''}`;
    const span = hi !== undefined && lo !== undefined ? ` Today ${lo}-${hi}C.` : '';
    const wind = cur.wind_speed_10m !== undefined ? ` Wind ${cur.wind_speed_10m} km/h.` : '';
    return `${where}: ${cur.temperature_2m}C, ${wmoWords(cur.weather_code)}.${span}${wind}`;
  });
}
