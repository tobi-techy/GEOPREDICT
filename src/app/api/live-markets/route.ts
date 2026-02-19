import { NextResponse } from 'next/server';
import { type Market, type MarketCategory } from '@/lib/markets';

const POLYMARKET_URL = 'https://gamma-api.polymarket.com/markets?closed=false&active=true&limit=450';
const MANIFOLD_URL = 'https://api.manifold.markets/v0/markets?limit=300';
const COUNTRIES_URL = 'https://restcountries.com/v3.1/all?fields=name,capital,latlng,cca2,cca3,altSpellings';

const MAX_MARKETS = 300;

type SourceKind = 'polymarket' | 'manifold';

interface PolymarketMarket {
  id?: string | number;
  question?: string;
  outcomes?: string | string[];
  outcomePrices?: string | string[];
  volumeNum?: number;
  liquidityNum?: number;
  endDate?: string;
  slug?: string;
}

interface ManifoldMarket {
  id?: string;
  question?: string;
  probability?: number;
  volume?: number;
  totalLiquidity?: number;
  closeTime?: number;
  isResolved?: boolean;
  outcomeType?: string;
  url?: string;
}

interface CountryDoc {
  name?: { common?: string; official?: string };
  capital?: string[];
  altSpellings?: string[];
  cca2?: string;
  cca3?: string;
  latlng?: [number, number];
}

interface LocationToken {
  token: string;
  lat: number;
  lng: number;
}

let locationTokensCache: LocationToken[] | null = null;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function hashInt(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function makeFieldId(seed: string): string {
  return `${hashInt(seed)}field`;
}

function fallbackCoords(seed: string): { lat: number; lng: number } {
  const h = hashInt(seed);
  const lat = ((h % 13_000) / 100) - 65;
  const lng = ((Math.floor(h / 13_000) % 36_000) / 100) - 180;
  return { lat, lng };
}

function jitterCoords(base: { lat: number; lng: number }, seed: string): { lat: number; lng: number } {
  const h = hashInt(seed);
  const latOffset = ((h % 220) - 110) / 80; // about +/- 1.375 degrees
  const lngOffset = ((Math.floor(h / 220) % 260) - 130) / 70; // about +/- 1.85 degrees
  const lat = Math.max(-82, Math.min(82, base.lat + latOffset));
  let lng = base.lng + lngOffset;
  if (lng > 180) lng -= 360;
  if (lng < -180) lng += 360;
  return { lat, lng };
}

function parseDate(input?: string | number): Date {
  if (typeof input === 'number') {
    const dt = new Date(input);
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  if (typeof input === 'string') {
    const dt = new Date(input);
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  const fallback = new Date();
  fallback.setDate(fallback.getDate() + 30);
  return fallback;
}

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function categoryFromTitle(title: string): MarketCategory {
  const t = title.toLowerCase();
  if (/(bitcoin|btc|crypto|ethereum|eth|token|blockchain|etf|solana)/.test(t)) return 'crypto';
  if (/(football|soccer|premier league|nba|nfl|mlb|olympic|cup|match|tournament|championship)/.test(t)) return 'sports';
  if (/(flood|storm|hurricane|wildfire|climate|temperature|earthquake|rainfall|drought|weather)/.test(t)) return 'environmental';
  if (/(rent|housing|property|mortgage|real estate|home price)/.test(t)) return 'real_estate';
  if (/(concert|album|festival|music|tour|eurovision|grammy)/.test(t)) return 'music';
  return 'event';
}

async function getLocationTokens(): Promise<LocationToken[]> {
  if (locationTokensCache) return locationTokensCache;

  try {
    const res = await fetch(COUNTRIES_URL, { next: { revalidate: 60 * 60 * 24 } });
    if (!res.ok) return [];
    const countries = (await res.json()) as CountryDoc[];
    const tokens: LocationToken[] = [];

    for (const c of countries) {
      if (!Array.isArray(c.latlng) || c.latlng.length !== 2) continue;
      const lat = c.latlng[0];
      const lng = c.latlng[1];
      const rawNames = [
        c.name?.common,
        c.name?.official,
        c.cca3,
        ...(c.capital ?? []),
        ...(c.altSpellings ?? []),
      ].filter((n): n is string => Boolean(n));

      for (const raw of rawNames) {
        const token = normalizeText(raw);
        if (!token || token.length < 4) continue;
        tokens.push({ token, lat, lng });
      }
    }

    tokens.sort((a, b) => b.token.length - a.token.length);
    locationTokensCache = tokens;
    return tokens;
  } catch {
    return [];
  }
}

function inferCoords(
  question: string,
  seed: string,
  tokens: LocationToken[],
): { lat: number; lng: number; locationConfidence: 'high' | 'low' } {
  const normalized = normalizeText(question);
  for (const t of tokens) {
    const rx = new RegExp(`\\b${escapeRegExp(t.token)}\\b`, 'i');
    if (rx.test(normalized)) {
      const coords = jitterCoords({ lat: t.lat, lng: t.lng }, seed);
      return { ...coords, locationConfidence: 'high' };
    }
  }
  const coords = jitterCoords(fallbackCoords(seed), `${seed}:fallback`);
  return { ...coords, locationConfidence: 'low' };
}

function parseStringArray(input: string | string[] | undefined): string[] {
  if (Array.isArray(input)) return input;
  if (!input) return [];
  try {
    const parsed = JSON.parse(input);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildMarket(params: {
  source: SourceKind;
  id: string;
  question: string;
  yesProbability: number;
  notionalPool: number;
  deadline: Date;
  score: number;
  sourceUrl?: string;
  locationTokens: LocationToken[];
}): Market & { __score: number } {
  const { source, id, question, yesProbability, notionalPool, deadline, score, sourceUrl, locationTokens } = params;
  const coords = inferCoords(question, `${source}:${id}:${question}`, locationTokens);
  const safePool = Number.isFinite(notionalPool) && notionalPool > 0 ? notionalPool : 0;
  const clampedProb = clamp01(yesProbability);

  return {
    id: `${source}-${id}`,
    fieldId: makeFieldId(`${source}:${id}`),
    lat: coords.lat,
    lng: coords.lng,
    category: categoryFromTitle(question),
    question,
    deadline,
    totalYes: safePool * clampedProb,
    totalNo: safePool * (1 - clampedProb),
    outcome: 0,
    yesProbability: clampedProb,
    source,
    sourceUrl,
    chainTracked: false,
    locationConfidence: coords.locationConfidence,
    __score: score,
  };
}

function isFutureDate(date: Date): boolean {
  return date.getTime() > Date.now();
}

export async function GET() {
  try {
    const [polyRes, manifoldRes, locationTokens] = await Promise.all([
      fetch(POLYMARKET_URL, { next: { revalidate: 60 } }),
      fetch(MANIFOLD_URL, { next: { revalidate: 60 } }),
      getLocationTokens(),
    ]);

    const poly = polyRes.ok ? ((await polyRes.json()) as PolymarketMarket[]) : [];
    const manifold = manifoldRes.ok ? ((await manifoldRes.json()) as ManifoldMarket[]) : [];

    const polyMarkets = poly
      .map((m) => {
        const question = (m.question ?? '').trim();
        const id = String(m.id ?? m.slug ?? '').trim();
        if (!question || !id) return null;

        const outcomes = parseStringArray(m.outcomes);
        const prices = parseStringArray(m.outcomePrices).map((v) => Number(v));
        const yesIndex = outcomes.findIndex((o) => normalizeText(o) === 'yes');
        const rawYesProb =
          yesIndex >= 0 && Number.isFinite(prices[yesIndex]) ? prices[yesIndex] : Number(prices[0] ?? Number.NaN);
        if (!Number.isFinite(rawYesProb)) return null;
        const yesProb = clamp01(rawYesProb);

        const deadline = parseDate(m.endDate);
        if (!isFutureDate(deadline)) return null;

        const score = Number(m.volumeNum ?? 0) + Number(m.liquidityNum ?? 0);
        const notionalPool = Number(m.volumeNum ?? 0) || Number(m.liquidityNum ?? 0) || 0;
        const sourceUrl = m.slug ? `https://polymarket.com/event/${m.slug}` : undefined;

        return buildMarket({
          source: 'polymarket',
          id,
          question,
          yesProbability: yesProb,
          notionalPool,
          deadline,
          score,
          sourceUrl,
          locationTokens,
        });
      })
      .filter((m): m is Market & { __score: number } => Boolean(m));

    const manifoldMarkets = manifold
      .map((m) => {
        const question = (m.question ?? '').trim();
        const id = (m.id ?? '').trim();
        if (!question || !id) return null;
        if (m.isResolved) return null;
        if (m.outcomeType !== 'BINARY') return null;

        const yesProb = Number(m.probability ?? NaN);
        if (!Number.isFinite(yesProb)) return null;

        const deadline = parseDate(m.closeTime);
        if (!isFutureDate(deadline)) return null;

        const score = Number(m.volume ?? 0) + Number(m.totalLiquidity ?? 0);
        const notionalPool = Number(m.volume ?? 0) || Number(m.totalLiquidity ?? 0) || 0;

        return buildMarket({
          source: 'manifold',
          id,
          question,
          yesProbability: yesProb,
          notionalPool,
          deadline,
          score,
          sourceUrl: m.url,
          locationTokens,
        });
      })
      .filter((m): m is Market & { __score: number } => Boolean(m));

    const deduped = new Map<string, Market & { __score: number }>();
    for (const market of [...polyMarkets, ...manifoldMarkets]) {
      const key = normalizeText(market.question);
      const prev = deduped.get(key);
      if (!prev || market.__score > prev.__score) deduped.set(key, market);
    }

    const ranked = Array.from(deduped.values())
      .sort((a, b) => b.__score - a.__score)
      .slice(0, MAX_MARKETS)
      .map((entry) => {
        const market = { ...entry };
        delete (market as { __score?: number }).__score;
        return market;
      });

    return NextResponse.json(ranked);
  } catch {
    return NextResponse.json([]);
  }
}
