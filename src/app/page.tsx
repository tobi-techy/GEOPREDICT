'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import ConnectButton from '@/components/ConnectButton';
import MarketPanel from '@/components/MarketPanel';
import VerifyProof from '@/components/VerifyProof';
import PendingTxReconciler from '@/components/PendingTxReconciler';
import { TOKEN } from '@/lib/token';
import { ALEO_API, DEPLOYED_PROGRAM, DEPLOY_TX_ID, type Market, type MarketCategory, CATEGORY_LABELS, calcOdds, fetchAllMarketTotals, formatAmount } from '@/lib/markets';
import {
  countPendingTransactions,
  PENDING_TX_EVENT,
  readTrackingMode,
  setTrackingMode as persistTrackingMode,
  TRACKING_MODE_EVENT,
  type TrackingMode,
} from '@/lib/transactionTracking';

const Map = dynamic(() => import('@/components/Map'), { ssr: false });
const STAKES_STORAGE_KEY = 'geopredict_local_stakes_v1';
const CATEGORY_ORDER: MarketCategory[] = ['event', 'sports', 'crypto', 'environmental', 'real_estate', 'music'];

type StakeByMarket = Record<string, { yes: number; no: number }>;
type ApiMarket = Omit<Market, 'deadline'> & { deadline: string };
type GridSourceFilter = 'all' | 'polymarket' | 'manifold';
type GridStatusFilter = 'all' | 'open' | 'resolved';
type GridSort = 'liquidity_desc' | 'deadline_asc' | 'deadline_desc';

function hydrateApiMarket(market: ApiMarket): Market {
  const parsed = new Date(market.deadline);
  return {
    ...market,
    deadline: Number.isNaN(parsed.getTime()) ? new Date() : parsed,
  };
}

export default function Home() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [viewMode, setViewMode] = useState<'map' | 'grid'>('map');
  const [trackingMode, setTrackingMode] = useState<TrackingMode>(() =>
    typeof window === 'undefined' ? 'privacy' : readTrackingMode(),
  );
  const [pendingTxCount, setPendingTxCount] = useState(() =>
    typeof window === 'undefined' ? 0 : countPendingTransactions(),
  );
  const [activeCategories, setActiveCategories] = useState<MarketCategory[]>([]);
  const [gridQuery, setGridQuery] = useState('');
  const [gridSourceFilter, setGridSourceFilter] = useState<GridSourceFilter>('all');
  const [gridStatusFilter, setGridStatusFilter] = useState<GridStatusFilter>('all');
  const [gridSort, setGridSort] = useState<GridSort>('liquidity_desc');
  const [myStakes, setMyStakes] = useState<StakeByMarket>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem(STAKES_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as StakeByMarket) : {};
    } catch {
      return {};
    }
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showVerify, setShowVerify] = useState(false);
  const marketsRef = useRef<Market[]>(markets);

  useEffect(() => {
    marketsRef.current = markets;
  }, [markets]);

  useEffect(() => {
    const onModeChange = () => setTrackingMode(readTrackingMode());
    const onPendingChange = () => setPendingTxCount(countPendingTransactions());
    window.addEventListener(TRACKING_MODE_EVENT, onModeChange);
    window.addEventListener(PENDING_TX_EVENT, onPendingChange);
    return () => {
      window.removeEventListener(TRACKING_MODE_EVENT, onModeChange);
      window.removeEventListener(PENDING_TX_EVENT, onPendingChange);
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STAKES_STORAGE_KEY, JSON.stringify(myStakes));
  }, [myStakes]);

  useEffect(() => {
    let cancelled = false;
    const loadLiveMarkets = async () => {
      try {
        const res = await fetch('/api/live-markets', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as ApiMarket[];
        if (!Array.isArray(data) || data.length === 0 || cancelled) return;
        const hydrated = data.map(hydrateApiMarket);
        const withTotals = await fetchAllMarketTotals(hydrated);
        if (!cancelled) setMarkets(withTotals);
      } catch {
        if (!cancelled) setMarkets([]);
      }
    };

    void loadLiveMarkets();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshTotals = useCallback(async () => {
    const next = await fetchAllMarketTotals(marketsRef.current);
    setMarkets(next);
  }, []);

  useEffect(() => {
    void refreshTotals();
    const timer = window.setInterval(() => {
      void refreshTotals();
    }, 30_000);

    return () => window.clearInterval(timer);
  }, [refreshTotals]);

  const filteredMarkets = useMemo(() => {
    if (activeCategories.length === 0) return markets;
    return markets.filter((m) => activeCategories.includes(m.category));
  }, [markets, activeCategories]);
  const mapMarkets = useMemo(() => {
    const highConfidence = filteredMarkets.filter((m) => m.locationConfidence === 'high');
    return highConfidence.length >= 40 ? highConfidence : filteredMarkets;
  }, [filteredMarkets]);
  const gridMarkets = useMemo(() => {
    const query = gridQuery.trim().toLowerCase();
    const byFilters = filteredMarkets.filter((market) => {
      if (gridSourceFilter !== 'all' && market.source !== gridSourceFilter) return false;
      if (gridStatusFilter === 'open' && market.outcome !== 0) return false;
      if (gridStatusFilter === 'resolved' && market.outcome === 0) return false;
      if (!query) return true;

      return (
        market.question.toLowerCase().includes(query) ||
        CATEGORY_LABELS[market.category].toLowerCase().includes(query) ||
        (market.source ?? '').toLowerCase().includes(query)
      );
    });

    const sorted = [...byFilters];
    if (gridSort === 'liquidity_desc') {
      sorted.sort((a, b) => (b.totalYes + b.totalNo) - (a.totalYes + a.totalNo));
    } else if (gridSort === 'deadline_asc') {
      sorted.sort((a, b) => a.deadline.getTime() - b.deadline.getTime());
    } else {
      sorted.sort((a, b) => b.deadline.getTime() - a.deadline.getTime());
    }
    return sorted;
  }, [filteredMarkets, gridQuery, gridSourceFilter, gridStatusFilter, gridSort]);
  const selectedMarket = selectedId ? filteredMarkets.find((m) => m.id === selectedId) ?? null : null;

  const handleBetPlaced = useCallback((marketId: string, position: 1 | 2, stake: number) => {
    setMarkets((prev) =>
      prev.map((m) =>
        m.id === marketId
          ? { ...m, totalYes: m.totalYes + (position === 1 ? stake : 0), totalNo: m.totalNo + (position === 2 ? stake : 0) }
          : m,
      ),
    );
    setMyStakes((prev) => {
      const current = prev[marketId] ?? { yes: 0, no: 0 };
      return {
        ...prev,
        [marketId]: {
          yes: current.yes + (position === 1 ? stake : 0),
          no: current.no + (position === 2 ? stake : 0),
        },
      };
    });
  }, []);

  const handleMarkerClick = useCallback((market: Market) => {
    setSelectedId(market.id);
  }, []);

  const toggleCategory = useCallback((category: MarketCategory) => {
    setActiveCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category],
    );
  }, []);

  const handleTrackingModeChange = useCallback((next: TrackingMode) => {
    persistTrackingMode(next);
    setTrackingMode(next);
  }, []);

  return (
      <main className="h-screen flex flex-col bg-zinc-950">
        <header className="h-16 border-b border-white/[0.06] flex items-center justify-between px-6 bg-zinc-950/80 backdrop-blur-xl z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
              <span className="text-sm">🗺</span>
            </div>
            <span className="text-[15px] font-semibold text-white tracking-tight">GeoPredict</span>
            <span className="text-[11px] text-white/35">{TOKEN.symbol} on Aleo Testnet</span>
            <span className="text-[11px] text-emerald-300/70">{filteredMarkets.length}/{markets.length} live markets</span>
            <span className="text-[11px] text-white/35">Map pins: {mapMarkets.length}</span>
            <a
              href={`${ALEO_API}/program/${DEPLOYED_PROGRAM}`}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-white/45 hover:text-white/70 underline underline-offset-2"
            >
              {DEPLOYED_PROGRAM}
            </a>
            <a
              href={`${ALEO_API}/transaction/${DEPLOY_TX_ID}`}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-white/45 hover:text-white/70 underline underline-offset-2"
            >
              Deploy Tx
            </a>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={trackingMode}
              onChange={(e) => handleTrackingModeChange(e.target.value as TrackingMode)}
              className="rounded-full border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-[12px] text-white/70 outline-none focus:border-emerald-400/40"
              title="Transaction tracking mode"
            >
              <option value="privacy">Tracking: Privacy</option>
              <option value="reliability">Tracking: Reliability</option>
            </select>
            {pendingTxCount > 0 && (
              <span className="px-3 py-1.5 rounded-full border border-amber-400/30 bg-amber-500/10 text-[12px] text-amber-300">
                Pending tx: {pendingTxCount}
              </span>
            )}
            <div className="flex items-center rounded-full border border-white/[0.08] bg-white/[0.03] p-1">
              <button
                onClick={() => setViewMode('map')}
                className={`px-3 py-1.5 rounded-full text-[12px] transition-all ${viewMode === 'map' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'text-white/60 hover:text-white/80'}`}
              >
                Map
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`px-3 py-1.5 rounded-full text-[12px] transition-all ${viewMode === 'grid' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'text-white/60 hover:text-white/80'}`}
              >
                Grid
              </button>
            </div>
            <button onClick={() => setShowVerify(!showVerify)} className="px-4 py-2 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] rounded-full text-[13px] font-medium text-white/60 transition-all">
              Verify Proof
            </button>
            <ConnectButton />
          </div>
        </header>

        <div className="h-14 border-b border-white/[0.05] px-6 flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveCategories([])}
            className={`px-3 py-1.5 rounded-full text-[12px] border transition-all whitespace-nowrap ${activeCategories.length === 0 ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300' : 'border-white/[0.12] bg-white/[0.03] text-white/60 hover:text-white/80'}`}
          >
            All
          </button>
          {CATEGORY_ORDER.map((category) => {
            const active = activeCategories.includes(category);
            return (
              <button
                key={category}
                onClick={() => toggleCategory(category)}
                className={`px-3 py-1.5 rounded-full text-[12px] border transition-all whitespace-nowrap ${active ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300' : 'border-white/[0.12] bg-white/[0.03] text-white/60 hover:text-white/80'}`}
              >
                {CATEGORY_LABELS[category]}
              </button>
            );
          })}
        </div>

        <div className="flex-1 relative">
          {viewMode === 'map' ? (
            <Map markets={mapMarkets} onMarkerClick={handleMarkerClick} />
          ) : (
            <div className="h-full overflow-y-auto px-4 py-8 md:px-8 md:py-10">
              <div className="mx-auto max-w-[1400px]">
                <div className="mb-7 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 md:p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h2 className="text-[18px] font-semibold text-white tracking-tight">Market Grid</h2>
                      <p className="text-[12px] text-white/45 mt-1">{gridMarkets.length} matches from {filteredMarkets.length} category-filtered markets</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={gridQuery}
                        onChange={(e) => setGridQuery(e.target.value)}
                        placeholder="Search question, source, or category"
                        className="w-[260px] max-w-full rounded-xl border border-white/[0.12] bg-zinc-900/70 px-3.5 py-2 text-[13px] text-white placeholder:text-white/30 outline-none transition-all focus:border-emerald-400/40"
                      />
                      <select
                        value={gridSourceFilter}
                        onChange={(e) => setGridSourceFilter(e.target.value as GridSourceFilter)}
                        className="rounded-xl border border-white/[0.12] bg-zinc-900/70 px-3 py-2 text-[12px] text-white/80 outline-none transition-all focus:border-emerald-400/40"
                      >
                        <option value="all">All sources</option>
                        <option value="polymarket">Polymarket</option>
                        <option value="manifold">Manifold</option>
                      </select>
                      <select
                        value={gridStatusFilter}
                        onChange={(e) => setGridStatusFilter(e.target.value as GridStatusFilter)}
                        className="rounded-xl border border-white/[0.12] bg-zinc-900/70 px-3 py-2 text-[12px] text-white/80 outline-none transition-all focus:border-emerald-400/40"
                      >
                        <option value="all">All status</option>
                        <option value="open">Open only</option>
                        <option value="resolved">Resolved only</option>
                      </select>
                      <select
                        value={gridSort}
                        onChange={(e) => setGridSort(e.target.value as GridSort)}
                        className="rounded-xl border border-white/[0.12] bg-zinc-900/70 px-3 py-2 text-[12px] text-white/80 outline-none transition-all focus:border-emerald-400/40"
                      >
                        <option value="liquidity_desc">Sort: Liquidity</option>
                        <option value="deadline_asc">Sort: Deadline soonest</option>
                        <option value="deadline_desc">Sort: Deadline latest</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 2xl:grid-cols-3">
                {gridMarkets.map((market) => {
                  const odds = calcOdds(market);
                  const pool = market.totalYes + market.totalNo;
                  const isResolved = market.outcome !== 0;
                  return (
                    <button
                      key={market.id}
                      onClick={() => setSelectedId(market.id)}
                      className="group relative overflow-hidden text-left rounded-3xl border border-white/[0.08] bg-gradient-to-b from-white/[0.045] to-white/[0.015] p-5 md:p-6 transition-all hover:-translate-y-0.5 hover:border-white/[0.16] hover:shadow-[0_20px_50px_rgba(0,0,0,0.35)]"
                    >
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-emerald-400/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                      <div className="relative">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-[11px] text-white/35 uppercase tracking-wider">{CATEGORY_LABELS[market.category]}</p>
                          <div className="flex items-center gap-2 text-[10px]">
                            {market.source && (
                              <span className="rounded-full border border-white/[0.12] bg-white/[0.03] px-2 py-1 text-white/55 uppercase tracking-wider">
                                {market.source}
                              </span>
                            )}
                            <span className={`rounded-full px-2 py-1 border ${isResolved ? 'border-amber-400/30 bg-amber-500/10 text-amber-300' : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'}`}>
                              {isResolved ? 'Resolved' : 'Open'}
                            </span>
                          </div>
                        </div>
                        <p className="text-[15px] text-white/90 mt-3 leading-snug min-h-[64px]">{market.question}</p>
                        <div className="mt-4 space-y-1.5">
                          <p className="text-[12px] text-white/35">Resolves {market.deadline.toLocaleDateString()}</p>
                          <p className="text-[12px] text-white/35">Pool {formatAmount(pool)}</p>
                        </div>
                        <div className="mt-4">
                          <div className="flex justify-between text-[12px] mb-2">
                            <span className="text-white/35">Market odds</span>
                            <span className="text-white/35">{odds.yes + odds.no}% tracked</span>
                          </div>
                          <div className="flex justify-between text-[12px] mb-2">
                          <span className="text-emerald-400">Yes {odds.yes}%</span>
                          <span className="text-rose-400">No {odds.no}%</span>
                          </div>
                          <div className="h-1.5 rounded-full overflow-hidden bg-white/[0.06] flex">
                            <div className="bg-emerald-500 h-full" style={{ width: `${odds.yes}%` }} />
                            <div className="bg-rose-500 h-full" style={{ width: `${odds.no}%` }} />
                          </div>
                        </div>
                        <div className="mt-5 flex items-center justify-between">
                          <span className="text-[11px] text-white/30">Tap to open market actions</span>
                          <span className="text-[12px] text-emerald-300/90 group-hover:text-emerald-200 transition-colors">
                            Open →
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
                </div>
              </div>
            </div>
          )}

          {(viewMode === 'map' ? filteredMarkets.length === 0 : gridMarkets.length === 0) && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="px-4 py-2 rounded-xl border border-white/[0.1] bg-zinc-950/85 text-[13px] text-white/55">
                {viewMode === 'grid' ? 'No markets match your grid filters.' : 'No live markets available right now.'}
              </div>
            </div>
          )}

          {showVerify && (
            <div className="absolute top-6 left-6 w-80">
              <VerifyProof />
            </div>
          )}

          {selectedMarket && (
            <MarketPanel
              market={selectedMarket}
              onClose={() => setSelectedId(null)}
              myYesStake={myStakes[selectedMarket.id]?.yes ?? 0}
              myNoStake={myStakes[selectedMarket.id]?.no ?? 0}
              onBetPlaced={(pos, stake) => handleBetPlaced(selectedMarket.id, pos, stake)}
            />
          )}
          <PendingTxReconciler onPendingCountChange={setPendingTxCount} />
        </div>
      </main>
  );
}
