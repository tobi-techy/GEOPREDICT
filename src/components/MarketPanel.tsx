'use client';

import { useState } from 'react';
import { type Market, calcOdds, formatAmount, CATEGORY_LABELS } from '@/lib/markets';
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

  return (
    <>
      <div className="absolute right-0 top-0 h-full w-[380px] bg-zinc-950/95 backdrop-blur-2xl border-l border-white/[0.06] overflow-y-auto">
        <div className="p-6">
          {/* Close */}
          <button onClick={onClose} className="absolute top-5 right-5 w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.05] hover:bg-white/[0.1] transition-all">
            <svg className="w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>

          {/* Category */}
          <span className="inline-block text-[11px] font-medium text-white/30 uppercase tracking-wider">
            {CATEGORY_LABELS[market.category]}
          </span>

          {/* Question */}
          <h2 className="text-[22px] font-semibold text-white tracking-tight mt-3 pr-8 leading-tight">
            {market.question}
          </h2>

          {/* Deadline */}
          <p className="text-[13px] text-white/30 mt-3">
            Resolves {market.deadline.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>

          {isResolved ? (
            <>
              <div className="mt-8 p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                <p className="text-[11px] font-medium text-white/30 uppercase tracking-wider">Outcome</p>
                <p className="text-2xl font-semibold text-white mt-2">
                  {market.outcome === 1 ? '✓ Yes' : '✗ No'}
                </p>
              </div>
              
              {/* Claim Button */}
              <button
                onClick={() => setShowClaim(true)}
                className="w-full mt-4 py-4 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-2xl font-medium text-amber-400 transition-all"
              >
                🏆 Claim Winnings
              </button>
              
              <p className="text-[12px] text-white/25 mt-3 text-center">
                If you bet on the winning outcome
              </p>
            </>
          ) : (
            <>
              {/* Odds Bar */}
              <div className="mt-8">
                <div className="flex justify-between text-[13px] mb-3">
                  <span className="text-emerald-400 font-medium">Yes {odds.yes}%</span>
                  <span className="text-rose-400 font-medium">No {odds.no}%</span>
                </div>
                <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden flex">
                  <div className="bg-emerald-500 h-full transition-all duration-500" style={{ width: `${odds.yes}%` }} />
                  <div className="bg-rose-500 h-full transition-all duration-500" style={{ width: `${odds.no}%` }} />
                </div>
                <p className="text-[12px] text-white/25 mt-3">
                  {formatAmount(total)} credits · {((market.totalYes + market.totalNo) / 1000).toFixed(0)} predictions
                </p>
              </div>

              {/* Bet Buttons */}
              <div className="mt-8 space-y-3">
                <button
                  onClick={() => setBetPosition(1)}
                  className="w-full py-4 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-2xl font-medium text-emerald-400 transition-all"
                >
                  Predict Yes
                </button>
                <button
                  onClick={() => setBetPosition(2)}
                  className="w-full py-4 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-2xl font-medium text-rose-400 transition-all"
                >
                  Predict No
                </button>
              </div>
            </>
          )}

          {/* Privacy Note */}
          <div className="mt-8 p-4 rounded-2xl bg-white/[0.02] border border-white/[0.04]">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-white/[0.05] flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              </div>
              <div>
                <p className="text-[13px] text-white/50 leading-relaxed">
                  Your bets are private. Only you can see your positions.
                </p>
              </div>
            </div>
          </div>

          {/* Market ID */}
          <p className="text-[11px] text-white/15 mt-6 font-mono">
            {market.fieldId}
          </p>
        </div>
      </div>

      {betPosition && (
        <BetModal
          market={market}
          position={betPosition}
          onClose={() => setBetPosition(null)}
          onSuccess={() => setBetPosition(null)}
        />
      )}

      {showClaim && (
        <ClaimModal
          market={market}
          onClose={() => setShowClaim(false)}
        />
      )}
    </>
  );
}
