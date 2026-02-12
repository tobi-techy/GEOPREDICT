'use client';

import { useMemo, useState } from 'react';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { Transaction } from '@demox-labs/aleo-wallet-adapter-base';
import { type Market, calcParimutuelPayout, calcTradeImpact } from '@/lib/markets';
import { formatToken, toTokenUnits } from '@/lib/token';
import { APP_NETWORK } from './WalletProvider';

const PROGRAM_ID = 'geopredict_contract.aleo';

interface BetModalProps {
  market: Market;
  position: 1 | 2;
  onClose: () => void;
  onSuccess: () => void;
}

export default function BetModal({ market, position, onClose, onSuccess }: BetModalProps) {
  const { publicKey, requestTransaction } = useWallet();
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');

  const amountNum = Number(amount || 0);
  const payoutPreview = useMemo(
    () => calcParimutuelPayout({ market, position, stake: Math.max(0, amountNum) }),
    [amountNum, market, position]
  );
  const tradeImpact = useMemo(
    () => calcTradeImpact({ market, position, stake: Math.max(0, amountNum) }),
    [amountNum, market, position]
  );

  const isDemo = typeof window !== 'undefined' && window.localStorage.getItem('geopredict-demo-mode') === '1';

  const handleBet = async () => {
    const parsedUnits = toTokenUnits(amount);
    if (parsedUnits <= 0) {
      setError('Enter a valid amount');
      return;
    }

    if (isDemo) {
      setStatus('success');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
      return;
    }

    if (!publicKey || !requestTransaction) {
      setError('Connect Leo wallet or enable Demo mode');
      return;
    }

    setStatus('pending');
    setError('');
    try {
      const inputs = [market.fieldId, `${position}u8`, `${parsedUnits}u64`];
      const tx = Transaction.createTransaction(publicKey, APP_NETWORK, PROGRAM_ID, 'place_bet', inputs, 50_000);
      await requestTransaction(tx);
      setStatus('success');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1400);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to place bet');
    }
  };

  const isYes = position === 1;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-zinc-900/95 backdrop-blur-2xl border border-white/[0.08] rounded-3xl p-8 w-full max-w-sm mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {status === 'idle' && (
          <>
            <div className="text-center mb-8">
              <h3 className="text-xl font-semibold text-white tracking-tight">Predict {isYes ? 'Yes' : 'No'}</h3>
              <p className="text-sm text-white/40 mt-2 leading-relaxed">{market.question}</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-white/30 uppercase tracking-wider mb-2">Amount</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0"
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-2xl px-5 py-4 text-2xl font-light text-white text-center placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-all"
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.07] text-[12px] text-white/70 space-y-1">
                <p>Payout formula: stake + (stake / winner pool) × loser pool</p>
                <p>Estimated payout: <span className="text-emerald-300">{formatToken(payoutPreview.payout)}</span></p>
                <p>Est. profit: <span className="text-emerald-300">{formatToken(payoutPreview.profit)}</span></p>
                <p>Implied odds: {tradeImpact.beforeOdds}% → {tradeImpact.afterOdds}% (impact {tradeImpact.slippagePct}%)</p>
                <p>Pool depth: {formatToken(tradeImpact.poolDepth, true)}</p>
              </div>

              {error && <p className="text-rose-400/80 text-sm text-center">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={onClose} className="flex-1 py-4 bg-white/[0.05] hover:bg-white/[0.08] rounded-2xl font-medium text-white/60 transition-all">Cancel</button>
                <button onClick={handleBet} className={`flex-1 py-4 rounded-2xl font-medium text-white transition-all ${isYes ? 'bg-emerald-500 hover:bg-emerald-400' : 'bg-rose-500 hover:bg-rose-400'}`}>Confirm</button>
              </div>
            </div>
          </>
        )}
        {status === 'pending' && <p className="text-center text-white/70 py-12">Processing wallet transaction...</p>}
        {status === 'success' && <p className="text-center text-emerald-300 py-12">Bet submitted.</p>}
        {status === 'error' && (
          <div className="text-center py-12">
            <p className="text-white font-medium">Failed</p>
            <p className="text-white/30 text-sm mt-1">{error}</p>
            <button onClick={() => setStatus('idle')} className="mt-6 px-6 py-2 bg-white/[0.05] hover:bg-white/[0.08] rounded-full text-sm text-white/60 transition-all">Try Again</button>
          </div>
        )}
      </div>
    </div>
  );
}
