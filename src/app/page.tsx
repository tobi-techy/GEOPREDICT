'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { AleoWalletProvider } from '@/components/WalletProvider';
import ConnectButton from '@/components/ConnectButton';
import MarketPanel from '@/components/MarketPanel';
import VerifyProof from '@/components/VerifyProof';
import { type Market } from '@/lib/markets';

const Map = dynamic(() => import('@/components/Map'), { ssr: false });

export default function Home() {
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [showVerify, setShowVerify] = useState(false);

  return (
    <AleoWalletProvider>
      <main className="h-screen flex flex-col bg-zinc-950">
        {/* Header */}
        <header className="h-16 border-b border-white/[0.06] flex items-center justify-between px-6 bg-zinc-950/80 backdrop-blur-xl z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
              <span className="text-sm">🗺</span>
            </div>
            <span className="text-[15px] font-semibold text-white tracking-tight">GeoPredict</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowVerify(!showVerify)}
              className="px-4 py-2 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] rounded-full text-[13px] font-medium text-white/60 transition-all"
            >
              Verify Proof
            </button>
            <ConnectButton />
          </div>
        </header>

        {/* Map */}
        <div className="flex-1 relative">
          <Map onMarkerClick={setSelectedMarket} />
          
          {/* Legend */}
          <div className="absolute bottom-6 left-6 bg-zinc-900/90 backdrop-blur-xl border border-white/[0.06] rounded-2xl p-4">
            <p className="text-[11px] font-medium text-white/30 uppercase tracking-wider mb-3">Markets</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-400" />
                <span className="text-[12px] text-white/50">Real Estate</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-purple-400" />
                <span className="text-[12px] text-white/50">Events</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-teal-400" />
                <span className="text-[12px] text-white/50">Environmental</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-pink-400" />
                <span className="text-[12px] text-white/50">Music</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-orange-400" />
                <span className="text-[12px] text-white/50">Sports</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <span className="text-[12px] text-white/50">Crypto</span>
              </div>
            </div>
          </div>

          {/* Verify Proof Panel */}
          {showVerify && (
            <div className="absolute top-6 left-6 w-80">
              <VerifyProof />
            </div>
          )}

          {selectedMarket && (
            <MarketPanel market={selectedMarket} onClose={() => setSelectedMarket(null)} />
          )}
        </div>
      </main>
    </AleoWalletProvider>
  );
}
