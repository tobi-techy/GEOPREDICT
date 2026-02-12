'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { AleoWalletProvider } from '@/components/WalletProvider';
import ConnectButton from '@/components/ConnectButton';
import MarketPanel from '@/components/MarketPanel';
import VerifyProof from '@/components/VerifyProof';
import { DEMO_BALANCE_UNITS, fromTokenUnits, formatToken } from '@/lib/token';
import { type Market } from '@/lib/markets';

const Map = dynamic(() => import('@/components/Map'), { ssr: false });

export default function Home() {
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [showVerify, setShowVerify] = useState(false);
  const [demoMode, setDemoMode] = useState(false);

  return (
    <AleoWalletProvider>
      <main className="h-screen flex flex-col bg-zinc-950">
        <header className="h-16 border-b border-white/[0.06] flex items-center justify-between px-6 bg-zinc-950/80 backdrop-blur-xl z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
              <span className="text-sm">🗺</span>
            </div>
            <span className="text-[15px] font-semibold text-white tracking-tight">GeoPredict</span>
            <span className="text-[11px] text-white/35">Balance: {formatToken(fromTokenUnits(DEMO_BALANCE_UNITS), true)} {demoMode ? '(demo)' : ''}</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowVerify(!showVerify)} className="px-4 py-2 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] rounded-full text-[13px] font-medium text-white/60 transition-all">
              Verify Proof
            </button>
            <ConnectButton onDemoModeChange={setDemoMode} />
          </div>
        </header>

        <div className="flex-1 relative">
          <Map onMarkerClick={setSelectedMarket} />

          {showVerify && (
            <div className="absolute top-6 left-6 w-80">
              <VerifyProof />
            </div>
          )}

          {selectedMarket && <MarketPanel market={selectedMarket} onClose={() => setSelectedMarket(null)} />}
        </div>
      </main>
    </AleoWalletProvider>
  );
}
