import { NextResponse } from 'next/server';

// This endpoint checks source platforms for resolved markets
// In production, this would be called by a cron job and would execute resolve_market

const POLYMARKET_URL = 'https://gamma-api.polymarket.com/markets?closed=true&limit=100';
const MANIFOLD_URL = 'https://api.manifold.markets/v0/markets?limit=100';

interface PolymarketMarket {
  id?: string;
  question?: string;
  outcomes?: string[];
  outcomePrices?: string[];
  closed?: boolean;
  resolved?: boolean;
  resolutionSource?: string;
}

interface ManifoldMarket {
  id?: string;
  question?: string;
  isResolved?: boolean;
  resolution?: string; // "YES" | "NO" | "MKT" | "CANCEL"
}

function hashToFieldId(source: string, id: string): string {
  let hash = 0;
  const input = `${source}:${id}`;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return `${Math.abs(hash)}field`;
}

export async function GET() {
  try {
    const [polyRes, manifoldRes] = await Promise.all([
      fetch(POLYMARKET_URL, { next: { revalidate: 300 } }),
      fetch(MANIFOLD_URL, { next: { revalidate: 300 } }),
    ]);

    const resolved: Array<{
      source: string;
      sourceId: string;
      fieldId: string;
      question: string;
      outcome: 1 | 2; // 1=Yes, 2=No
    }> = [];

    if (polyRes.ok) {
      const markets = (await polyRes.json()) as PolymarketMarket[];
      for (const m of markets) {
        if (!m.resolved || !m.id) continue;
        // Polymarket: check which outcome won based on prices (1.0 = won)
        const prices = (m.outcomePrices ?? []).map(p => parseFloat(p));
        const outcomes = m.outcomes ?? [];
        const yesIdx = outcomes.findIndex(o => o.toLowerCase() === 'yes');
        const noIdx = outcomes.findIndex(o => o.toLowerCase() === 'no');
        
        let outcome: 1 | 2 | null = null;
        if (yesIdx >= 0 && prices[yesIdx] >= 0.99) outcome = 1;
        else if (noIdx >= 0 && prices[noIdx] >= 0.99) outcome = 2;
        
        if (outcome) {
          resolved.push({
            source: 'polymarket',
            sourceId: String(m.id),
            fieldId: hashToFieldId('polymarket', String(m.id)),
            question: m.question ?? '',
            outcome,
          });
        }
      }
    }

    if (manifoldRes.ok) {
      const markets = (await manifoldRes.json()) as ManifoldMarket[];
      for (const m of markets) {
        if (!m.isResolved || !m.id || !m.resolution) continue;
        
        let outcome: 1 | 2 | null = null;
        if (m.resolution === 'YES') outcome = 1;
        else if (m.resolution === 'NO') outcome = 2;
        // Skip MKT (partial) and CANCEL
        
        if (outcome) {
          resolved.push({
            source: 'manifold',
            sourceId: m.id,
            fieldId: hashToFieldId('manifold', m.id),
            question: m.question ?? '',
            outcome,
          });
        }
      }
    }

    // In production, this would:
    // 1. Check which markets have bets on GeoPredict (query market_totals mapping)
    // 2. For those with bets, call resolve_market via Aleo SDK
    // 3. Track which markets have been resolved to avoid duplicates
    
    // For now, return the list of resolved markets from sources
    return NextResponse.json({
      message: 'Resolved markets from source platforms',
      note: 'Auto-resolution requires admin key - run resolve_market manually or set up a secure backend service',
      resolved: resolved.slice(0, 50), // Limit response size
      count: resolved.length,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch resolved markets' }, { status: 500 });
  }
}
