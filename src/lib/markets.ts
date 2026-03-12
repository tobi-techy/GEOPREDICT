import { formatToken, fromMicrocredits } from "./token";

export const ALEO_API = "https://api.explorer.provable.com/v1/testnet";
export const DEPLOYED_PROGRAM = "geopredict_private_v3.aleo";
export const DEPLOY_TX_ID = "at1x9uurx3j309g9pal3fgsdqlvtywmlm0wzxupayk9ug2e0ude8gyqmgdmgz";

export type MarketCategory =
  | "real_estate"
  | "event"
  | "environmental"
  | "music"
  | "sports"
  | "crypto";

export interface Market {
  id: string;
  fieldId: string;
  lat: number;
  lng: number;
  category: MarketCategory;
  question: string;
  deadline: Date;
  totalYes: number;
  totalNo: number;
  outcome: 0 | 1 | 2;
  yesProbability?: number;
  source?: 'aleo' | 'polymarket' | 'manifold' | 'news';
  sourceUrl?: string;
  chainTracked?: boolean;
  locationConfidence?: 'high' | 'low';
}

export interface Bet {
  owner: string;
  marketId: string;
  position: 1 | 2;
  amount: number;
}

export interface WinProof {
  owner: string;
  amountWon: number;
  proofHash: string;
}

export function calcOdds(market: Market): { yes: number; no: number } {
  const total = market.totalYes + market.totalNo;
  if (total === 0) return { yes: 0, no: 0 };
  return {
    yes: Math.round((market.totalYes / total) * 100),
    no: Math.round((market.totalNo / total) * 100),
  };
}

export function calcParimutuelPayout(params: {
  market: Market;
  position: 1 | 2;
  stake: number;
}): {
  payout: number;
  profit: number;
  winnerPoolAfter: number;
  loserPoolAfter: number;
} {
  const { market, position, stake } = params;
  const winnerPoolBefore = position === 1 ? market.totalYes : market.totalNo;
  const loserPoolBefore = position === 1 ? market.totalNo : market.totalYes;

  const winnerPoolAfter = winnerPoolBefore + stake;
  const loserPoolAfter = loserPoolBefore;

  if (winnerPoolAfter <= 0) {
    return { payout: stake, profit: 0, winnerPoolAfter, loserPoolAfter };
  }

  const loserShare = (stake / winnerPoolAfter) * loserPoolAfter;
  const payout = stake + loserShare;
  return {
    payout,
    profit: Math.max(0, payout - stake),
    winnerPoolAfter,
    loserPoolAfter,
  };
}

export function calcTradeImpact(params: {
  market: Market;
  position: 1 | 2;
  stake: number;
}): {
  beforeOdds: number;
  afterOdds: number;
  slippagePct: number;
  poolDepth: number;
} {
  const { market, position, stake } = params;
  const before = calcOdds(market);
  const poolDepth = market.totalYes + market.totalNo;

  const nextYes = position === 1 ? market.totalYes + stake : market.totalYes;
  const nextNo = position === 2 ? market.totalNo + stake : market.totalNo;
  const nextTotal = nextYes + nextNo;

  const beforeOdds = position === 1 ? before.yes : before.no;
  const afterOdds =
    nextTotal === 0
      ? 50
      : Math.round(((position === 1 ? nextYes : nextNo) / nextTotal) * 100);

  return {
    beforeOdds,
    afterOdds,
    slippagePct: Number(Math.abs(afterOdds - beforeOdds).toFixed(2)),
    poolDepth,
  };
}

export function formatAmount(amount: number): string {
  return formatToken(amount, true);
}

export const CATEGORY_COLORS: Record<MarketCategory, string> = {
  real_estate: "bg-blue-400",
  event: "bg-purple-400",
  environmental: "bg-teal-400",
  music: "bg-pink-400",
  sports: "bg-orange-400",
  crypto: "bg-yellow-400",
};

export const CATEGORY_LABELS: Record<MarketCategory, string> = {
  real_estate: "🏠 Real Estate",
  event: "🎉 Event",
  environmental: "🌊 Environmental",
  music: "🎵 Music",
  sports: "⚽ Sports",
  crypto: "₿ Crypto",
};

export async function fetchMarketTotals(fieldId: string): Promise<{ totalYes: number; totalNo: number; outcome: 0 | 1 | 2 } | null> {
  try {
    const res = await fetch(`${ALEO_API}/program/${DEPLOYED_PROGRAM}/mapping/market_totals/${fieldId}`);
    if (!res.ok) return null;
    const raw = await res.text();
    if (!raw || raw === 'null') return null;
    const cleaned = raw.replace(/"/g, '');
    const yesMatch = cleaned.match(/total_yes:\s*(\d+)u64/);
    const noMatch = cleaned.match(/total_no:\s*(\d+)u64/);
    const outcomeMatch = cleaned.match(/outcome:\s*(\d+)u8/);
    if (!yesMatch || !noMatch || !outcomeMatch) return null;
    return {
      // Chain stores pool amounts in microcredits; convert for UI math/display.
      totalYes: fromMicrocredits(Number(yesMatch[1])),
      totalNo: fromMicrocredits(Number(noMatch[1])),
      outcome: Number(outcomeMatch[1]) as 0 | 1 | 2,
    };
  } catch {
    return null;
  }
}

export async function fetchAllMarketTotals(markets: Market[]): Promise<Market[]> {
  // Fetch all markets in parallel with concurrency limit
  const CONCURRENCY = 20;
  const results = [...markets];

  for (let i = 0; i < markets.length; i += CONCURRENCY) {
    const batch = markets.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (m) => {
        const totals = await fetchMarketTotals(m.fieldId);
        if (totals) {
          const hasActivity = totals.totalYes > 0 || totals.totalNo > 0 || totals.outcome !== 0;
          return { ...m, ...totals, chainTracked: hasActivity || m.chainTracked };
        }
        return m;
      }),
    );
    batchResults.forEach((m, j) => { results[i + j] = m; });
  }

  return results;
}
