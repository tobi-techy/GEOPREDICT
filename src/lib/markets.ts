import { formatToken } from './token';

export type MarketCategory = 'real_estate' | 'event' | 'environmental' | 'music' | 'sports' | 'crypto';

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

export const MOCK_MARKETS: Market[] = [
  { id: '1', fieldId: '1field', lat: 37.7749, lng: -122.4194, category: 'real_estate', question: 'Will SF median home price exceed $1.5M by Q2 2026?', deadline: new Date('2026-06-30'), totalYes: 15000, totalNo: 8500, outcome: 0 },
  { id: '2', fieldId: '2field', lat: 40.7484, lng: -73.9857, category: 'music', question: 'Will Taylor Swift announce NYC concert in 2026?', deadline: new Date('2026-12-31'), totalYes: 32000, totalNo: 12000, outcome: 0 },
  { id: '3', fieldId: '3field', lat: 51.5074, lng: -0.1276, category: 'sports', question: 'Will Arsenal win Premier League 2025-26?', deadline: new Date('2026-05-25'), totalYes: 28000, totalNo: 35000, outcome: 0 },
  { id: '4', fieldId: '4field', lat: 35.6895, lng: 139.6917, category: 'crypto', question: 'Will Bitcoin exceed $200k before Tokyo halving event?', deadline: new Date('2028-04-01'), totalYes: 45000, totalNo: 22000, outcome: 0 },
  { id: '5', fieldId: '5field', lat: -22.9068, lng: -43.1729, category: 'event', question: 'Will Rio Carnival 2026 break attendance records?', deadline: new Date('2026-02-17'), totalYes: 8900, totalNo: 6100, outcome: 0 },
  { id: '6', fieldId: '6field', lat: 25.7617, lng: -80.1918, category: 'sports', question: 'Will Miami host Super Bowl 2027?', deadline: new Date('2026-05-01'), totalYes: 18000, totalNo: 24000, outcome: 0 },
  { id: '7', fieldId: '7field', lat: 52.52, lng: 13.405, category: 'music', question: 'Will Berlin host Eurovision 2027?', deadline: new Date('2026-09-01'), totalYes: 9500, totalNo: 14500, outcome: 0 },
  { id: '8', fieldId: '8field', lat: 1.3521, lng: 103.8198, category: 'crypto', question: 'Will Singapore approve spot ETH ETF by 2026?', deadline: new Date('2026-12-31'), totalYes: 21000, totalNo: 19000, outcome: 1 },
  { id: '9', fieldId: '9field', lat: 55.7558, lng: 37.6173, category: 'environmental', question: 'Will Moscow see record snowfall winter 2026?', deadline: new Date('2026-03-01'), totalYes: 7200, totalNo: 11800, outcome: 0 },
];

export function getMarketById(id: string): Market | undefined {
  return MOCK_MARKETS.find((m) => m.id === id);
}

export function calcOdds(market: Market): { yes: number; no: number } {
  const total = market.totalYes + market.totalNo;
  if (total === 0) return { yes: 50, no: 50 };
  return {
    yes: Math.round((market.totalYes / total) * 100),
    no: Math.round((market.totalNo / total) * 100),
  };
}

export function calcParimutuelPayout(params: {
  market: Market;
  position: 1 | 2;
  stake: number;
}): { payout: number; profit: number; winnerPoolAfter: number; loserPoolAfter: number } {
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
  const afterOdds = nextTotal === 0 ? 50 : Math.round(((position === 1 ? nextYes : nextNo) / nextTotal) * 100);

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
  real_estate: 'bg-blue-400',
  event: 'bg-purple-400',
  environmental: 'bg-teal-400',
  music: 'bg-pink-400',
  sports: 'bg-orange-400',
  crypto: 'bg-yellow-400',
};

export const CATEGORY_LABELS: Record<MarketCategory, string> = {
  real_estate: '🏠 Real Estate',
  event: '🎉 Event',
  environmental: '🌊 Environmental',
  music: '🎵 Music',
  sports: '⚽ Sports',
  crypto: '₿ Crypto',
};
