'use client';

import { useMemo, useState } from 'react';
import { type Market, calcOdds, formatAmount } from '@/lib/markets';
import { formatToken } from '@/lib/token';
import BetModal from './BetModal';
import ClaimModal from './ClaimModal';

interface MarketPanelProps {
  market: Market;
  onClose: () => void;
}

export default function MarketPanel({ market, onClose }: MarketPanelProps) {
  const [betPosition, setBetPosition] = useState<1 | 2 | null>(null);
  const [showClaim, setShowClaim] = useState(false);
  const odds = calcOdds(market);
  const total = market.totalYes + market.totalNo;
  const isResolved = market.outcome !== 0;

  const liquidity = useMemo(
    () => ({ yes: market.totalYes, no: market.totalNo, depth: total }),
    [market.totalNo, market.totalYes, total]
  );

  return (
    <>
      <div className="absolute right-0 top-0 h-full w-[380px] bg-zinc-950/95 backdrop-blur-2xl border-l border-white/[0.06] overflow-y-auto">
        <div className="p-6">
          <button onClick={onClose} className="absolute top-5 right-5 w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.05] hover:bg-white/[0.1] transition-all">×</button>

          <h2 className="text-[22px] font-semibold text-white tracking-tight mt-3 pr-8 leading-tight">{market.question}</h2>
          <p className="text-[13px] text-white/30 mt-3">Resolves {market.deadline.toLocaleDateString()}</p>

          <div className="mt-5 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-[12px] text-white/65 space-y-1">
            <p>Liquidity pools</p>
            <p>YES pool: {formatToken(liquidity.yes, true)}</p>
            <p>NO pool: {formatToken(liquidity.no, true)}</p>
            <p>Total depth: {formatToken(liquidity.depth, true)}</p>
            <p>AMM-like implied odds from pool ratio (higher side = higher implied probability).</p>
          </div>

          {isResolved ? (
            <>
              <div className="mt-6 p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                <p className="text-[11px] font-medium text-white/30 uppercase tracking-wider">Outcome</p>
                <p className="text-2xl font-semibold text-white mt-2">{market.outcome === 1 ? '✓ Yes' : '✗ No'}</p>
              </div>
              <button onClick={() => setShowClaim(true)} className="w-full mt-4 py-4 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-2xl font-medium text-amber-400 transition-all">🏆 Claim Winnings</button>
            </>
          ) : (
            <>
              <div className="mt-8">
                <div className="flex justify-between text-[13px] mb-3">
                  <span className="text-emerald-400 font-medium">Yes {odds.yes}%</span>
                  <span className="text-rose-400 font-medium">No {odds.no}%</span>
                </div>
                <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden flex">
                  <div className="bg-emerald-500 h-full" style={{ width: `${odds.yes}%` }} />
                  <div className="bg-rose-500 h-full" style={{ width: `${odds.no}%` }} />
                </div>
                <p className="text-[12px] text-white/25 mt-3">{formatAmount(total)} total liquidity</p>
              </div>

              <div className="mt-8 space-y-3">
                <button onClick={() => setBetPosition(1)} className="w-full py-4 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-2xl font-medium text-emerald-400 transition-all">Predict Yes</button>
                <button onClick={() => setBetPosition(2)} className="w-full py-4 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-2xl font-medium text-rose-400 transition-all">Predict No</button>
              </div>
            </>
          )}

          <div className="mt-8 p-4 rounded-2xl bg-white/[0.02] border border-white/[0.04]">
            <p className="text-[13px] text-white/50 leading-relaxed">Private by default: market pools are public, your position and amount remain private records.</p>
          </div>
        </div>
      </div>

      {betPosition && <BetModal market={market} position={betPosition} onClose={() => setBetPosition(null)} onSuccess={() => setBetPosition(null)} />}
      {showClaim && <ClaimModal market={market} onClose={() => setShowClaim(false)} />}
    </>
  );
}
