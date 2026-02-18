'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import ConnectButton from '@/components/ConnectButton';
import MarketPanel from '@/components/MarketPanel';
import VerifyProof from '@/components/VerifyProof';
import { TOKEN } from '@/lib/token';
import { type Market, MOCK_MARKETS, fetchAllMarketTotals } from '@/lib/markets';

const Map = dynamic(() => import('@/components/Map'), { ssr: false });

export default function Home() {
  const [markets, setMarkets] = useState<Market[]>(() => MOCK_MARKETS.map((m) => ({ ...m })));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showVerify, setShowVerify] = useState(false);

  useEffect(() => {
    fetchAllMarketTotals(markets).then(setMarkets);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedMarket = selectedId ? markets.find((m) => m.id === selectedId) ?? null : null;

  const handleBetPlaced = useCallback((marketId: string, position: 1 | 2, stake: number) => {
    setMarkets((prev) =>
      prev.map((m) =>
        m.id === marketId
          ? { ...m, totalYes: m.totalYes + (position === 1 ? stake : 0), totalNo: m.totalNo + (position === 2 ? stake : 0) }
          : m,
      ),
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
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowVerify(!showVerify)} className="px-4 py-2 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] rounded-full text-[13px] font-medium text-white/60 transition-all">
              Verify Proof
            </button>
            <ConnectButton />
          </div>
        </header>

        <div className="flex-1 relative">
          <Map onMarkerClick={(m) => setSelectedId(m.id)} />

          {showVerify && (
            <div className="absolute top-6 left-6 w-80">
              <VerifyProof />
            </div>
          )}

          {selectedMarket && (
            <MarketPanel
              market={selectedMarket}
              onClose={() => setSelectedId(null)}
              onBetPlaced={(pos, stake) => handleBetPlaced(selectedMarket.id, pos, stake)}
            />
          )}
        </div>
      </main>
  );
}
