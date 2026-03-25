'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { type Market, calcOdds, formatAmount } from '@/lib/markets';
import BetModal from './BetModal';
import ClaimModal from './ClaimModal';
import OrderBook from './OrderBook';

const PriceChart = dynamic(() => import('./PriceChart'), { ssr: false });

interface Props {
  market: Market;
  onClose: () => void;
  myYesStake?: number;
  myNoStake?: number;
  onBetPlaced?: (position: 1 | 2, stake: number) => void;
}

export default function MarketPanel({ market, onClose, myYesStake = 0, myNoStake = 0, onBetPlaced }: Props) {
  const [showBetModal, setShowBetModal] = useState(false);
  const [showClaim, setShowClaim] = useState(false);
  const [activeTab, setActiveTab] = useState<1 | 2>(1); // 1=Yes, 2=No
  const [stakeInput, setStakeInput] = useState('');
  const [hasClaimed, setHasClaimed] = useState(() => {
    if (typeof window === 'undefined') return false;
    const c = window.localStorage.getItem('geopredict_claimed_v1');
    return c ? JSON.parse(c).includes(market.id) : false;
  });

  const odds = calcOdds(market);
  const pool = market.totalYes + market.totalNo;
  const isResolved = market.outcome !== 0;
  const prob = market.yesProbability ?? 0.5;
  const yesPrice = Math.round(prob * 100);
  const src = market.source === 'polymarket' ? 'Polymarket' : market.source === 'manifold' ? 'Manifold' : 'Source';

  const markClaimed = () => {
    const arr = JSON.parse(window.localStorage.getItem('geopredict_claimed_v1') || '[]');
    if (!arr.includes(market.id)) { arr.push(market.id); window.localStorage.setItem('geopredict_claimed_v1', JSON.stringify(arr)); }
    setHasClaimed(true);
  };

  const handleQuickBet = () => {
    const val = parseFloat(stakeInput);
    if (!val || val <= 0) return;
    setShowBetModal(true);
  };

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/50" onClick={onClose} />
      <div className="fixed right-0 top-0 z-40 w-full sm:w-[78%] h-full bg-[#0b0d10] border-l border-white/[0.06] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-start gap-3 px-5 pt-3 pb-2 border-b border-white/[0.06]">
          <div className="flex-1 min-w-0">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 mb-1.5 rounded bg-violet-500/15 border border-violet-500/25 text-[10px] font-bold text-violet-300 uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
              Live from {src}
            </span>
            <h2 className="text-[17px] font-bold text-white leading-snug pr-10">{market.question}</h2>
          </div>
          <button onClick={onClose} className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.05] hover:bg-white/[0.12] text-white/50 hover:text-white text-sm">✕</button>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-5 border-b border-white/[0.06] text-center">
          {[
            { l: 'Price', v: `${yesPrice}¢`, c: 'text-emerald-400' },
            { l: '24h Chg', v: `${yesPrice >= 50 ? '+' : ''}${(yesPrice - 50).toFixed(1)}%`, c: yesPrice >= 50 ? 'text-emerald-400' : 'text-rose-400' },
            { l: 'Volume', v: pool > 0 ? formatAmount(pool) : '$0', c: 'text-white/80' },
            { l: 'Liquidity', v: pool > 0 ? formatAmount(pool * 0.6) : '$0', c: 'text-white/80' },
            { l: 'Auto-close', v: market.deadline.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), c: 'text-white/80' },
          ].map(s => (
            <div key={s.l} className="py-2 px-2">
              <p className="text-[9px] text-white/30 uppercase tracking-wider">{s.l}</p>
              <p className={`text-[13px] font-semibold mt-0.5 ${s.c}`}>{s.v}</p>
            </div>
          ))}
        </div>

        {/* Main content: Chart + OrderBook + Trade panel */}
        <div className="flex flex-1 min-h-0">
          {/* Chart */}
          <div className="flex-1 min-w-0 p-1">
            <PriceChart probability={prob} marketId={market.id} clobTokenId={market.clobTokenId} />
          </div>

          {/* Order Book */}
          <div className="w-[170px] shrink-0 border-l border-white/[0.06] flex flex-col">
            <OrderBook yesProbability={prob} totalYes={market.totalYes} totalNo={market.totalNo} />
          </div>

          {/* Trade sidebar */}
          <div className="w-[280px] shrink-0 border-l border-white/[0.06] flex flex-col bg-[#0e1014] overflow-y-auto">
            {isResolved ? (
              <div className="flex-1 flex flex-col p-5 gap-4">
                <div className="p-5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <p className="text-[10px] text-white/30 uppercase font-semibold">Outcome</p>
                  <p className="text-xl font-bold text-white mt-1">{market.outcome === 1 ? '✓ Yes' : '✗ No'}</p>
                </div>
                {hasClaimed ? (
                  <div className="py-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-center font-medium text-sm">✓ Claimed</div>
                ) : (
                  <button onClick={() => setShowClaim(true)} className="w-full py-3.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-xl font-medium text-amber-400 text-sm">🏆 Claim</button>
                )}
              </div>
            ) : (
              <div className="flex flex-col h-full">
                {/* Yes / No tabs */}
                <div className="grid grid-cols-2">
                  <button onClick={() => { setActiveTab(1); setShowBetModal(false); }} className={`py-3 text-[14px] font-bold transition-all ${activeTab === 1 ? 'text-emerald-400 bg-emerald-500/10 border-b-2 border-emerald-400' : 'text-white/35 hover:text-white/55 border-b border-white/[0.06]'}`}>YES</button>
                  <button onClick={() => { setActiveTab(2); setShowBetModal(false); }} className={`py-3 text-[14px] font-bold transition-all ${activeTab === 2 ? 'text-rose-400 bg-rose-500/10 border-b-2 border-rose-400' : 'text-white/35 hover:text-white/55 border-b border-white/[0.06]'}`}>NO</button>
                </div>

                {showBetModal ? (
                  <div className="flex-1 p-4">
                    <BetModal
                      market={market}
                      position={activeTab}
                      initialAmount={stakeInput}
                      inline
                      onClose={() => setShowBetModal(false)}
                      onSuccess={(s) => { setShowBetModal(false); setStakeInput(''); onBetPlaced?.(activeTab, s); }}
                    />
                  </div>
                ) : (
                  <div className="flex-1 p-5 flex flex-col gap-4">
                    <div>
                      <div className="flex justify-between text-[11px] text-white/35 mb-2">
                        <span>Amount</span>
                        <span>Bal. —</span>
                      </div>
                      <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] focus-within:border-white/[0.2] transition-colors">
                        <span className="text-white/30 text-xl">◎</span>
                        <input
                          type="number"
                          value={stakeInput}
                          onChange={e => setStakeInput(e.target.value)}
                          placeholder="0.00"
                          className="flex-1 bg-transparent text-white text-2xl font-bold outline-none placeholder:text-white/15 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <span className="text-[12px] text-white/25 font-medium">ALEO</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-5 gap-1.5">
                      {['0.1', '0.5', '1', '5', 'MAX'].map(v => (
                        <button key={v} onClick={() => v !== 'MAX' && setStakeInput(v)} className="py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-[11px] text-white/50 font-medium transition-all">{v}</button>
                      ))}
                    </div>

                    <div className="space-y-2 px-1">
                      <div className="flex justify-between text-[12px]">
                        <span className="text-white/30">Est. payout</span>
                        <span className="text-white/70 font-semibold">
                          {stakeInput && parseFloat(stakeInput) > 0 ? `${(parseFloat(stakeInput) * (100 / (activeTab === 1 ? yesPrice || 1 : (100 - yesPrice) || 1))).toFixed(2)} ALEO` : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between text-[12px]">
                        <span className="text-white/30">{activeTab === 1 ? 'Yes' : 'No'} price</span>
                        <span className={`font-semibold ${activeTab === 1 ? 'text-emerald-400' : 'text-rose-400'}`}>{activeTab === 1 ? yesPrice : 100 - yesPrice}¢</span>
                      </div>
                      <div className="flex justify-between text-[12px]">
                        <span className="text-white/30">Pool depth</span>
                        <span className="text-white/50">{pool > 0 ? formatAmount(pool) : '0'} ALEO</span>
                      </div>
                    </div>

                    <div className="flex-1" />

                    <button
                      onClick={handleQuickBet}
                      className={`w-full py-4 rounded-xl font-bold text-[15px] transition-all ${activeTab === 1 ? 'bg-emerald-500 hover:bg-emerald-400 text-black' : 'bg-rose-500 hover:bg-rose-400 text-white'}`}
                    >
                      {activeTab === 1 ? `Predict Yes ${odds.yes}¢` : `Predict No ${odds.no}¢`}
                    </button>

                    <p className="text-[10px] text-white/20 text-center leading-relaxed">🔒 Private on Aleo<br />Stakes: Yes {formatAmount(myYesStake)} · No {formatAmount(myNoStake)}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-2 border-t border-white/[0.06] text-[11px]">
          <span className="text-white/30">Market data from <span className="text-white/60 font-medium">{src}</span></span>
          {market.sourceUrl && <a href={market.sourceUrl} target="_blank" rel="noreferrer" className="text-violet-300 hover:text-violet-200">View on {src} ↗</a>}
        </div>
      </div>

      {showClaim && <ClaimModal market={market} stakeHint={market.outcome === 1 ? myYesStake : myNoStake} onClose={() => setShowClaim(false)} onSuccess={markClaimed} />}
    </>
  );
}
