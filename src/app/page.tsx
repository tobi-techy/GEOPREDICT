'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import ConnectButton from '@/components/ConnectButton';
import MarketPanel from '@/components/MarketPanel';
import VerifyProof from '@/components/VerifyProof';
import { TOKEN } from '@/lib/token';
import { ALEO_API, DEPLOYED_PROGRAM, DEPLOY_TX_ID, type Market, type MarketCategory, CATEGORY_LABELS, calcOdds, fetchAllMarketTotals, formatAmount } from '@/lib/markets';

const Map = dynamic(() => import('@/components/Map'), { ssr: false });
const STAKES_STORAGE_KEY = 'geopredict_local_stakes_v1';
const CATEGORY_ORDER: MarketCategory[] = ['event', 'sports', 'crypto', 'environmental', 'real_estate', 'music'];

type StakeByMarket = Record<string, { yes: number; no: number }>;
type ApiMarket = Omit<Market, 'deadline'> & { deadline: string };

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
  const [activeCategories, setActiveCategories] = useState<MarketCategory[]>([]);
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
            <div className="h-full overflow-y-auto p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredMarkets.map((market) => {
                  const odds = calcOdds(market);
                  const pool = market.totalYes + market.totalNo;
                  return (
                    <button
                      key={market.id}
                      onClick={() => setSelectedId(market.id)}
                      className="text-left p-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04] transition-all"
                    >
                      <p className="text-[11px] text-white/35 uppercase tracking-wider">{CATEGORY_LABELS[market.category]}</p>
                      <p className="text-[14px] text-white/90 mt-2 leading-snug line-clamp-3">{market.question}</p>
                      <p className="text-[12px] text-white/35 mt-2">Resolves {market.deadline.toLocaleDateString()}</p>
                      <p className="text-[12px] text-white/35 mt-1">Pool {formatAmount(pool)}</p>
                      <div className="mt-3">
                        <div className="flex justify-between text-[12px] mb-2">
                          <span className="text-emerald-400">Yes {odds.yes}%</span>
                          <span className="text-rose-400">No {odds.no}%</span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden bg-white/[0.06] flex">
                          <div className="bg-emerald-500 h-full" style={{ width: `${odds.yes}%` }} />
                          <div className="bg-rose-500 h-full" style={{ width: `${odds.no}%` }} />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {filteredMarkets.length === 0 && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="px-4 py-2 rounded-xl border border-white/[0.1] bg-zinc-950/85 text-[13px] text-white/55">
                No live markets available right now.
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
        </div>
      </main>
  );
}
