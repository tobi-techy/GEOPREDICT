'use client';

import { useState } from 'react';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { Transaction, WalletAdapterNetwork } from '@demox-labs/aleo-wallet-adapter-base';
import { type Market } from '@/lib/markets';

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

  const handleBet = async () => {
    if (!publicKey || !requestTransaction) {
      setError('Connect wallet to continue');
      return;
    }
    const amountNum = parseInt(amount);
    if (!amountNum || amountNum <= 0) {
      setError('Enter amount');
      return;
    }
    setStatus('pending');
    setError('');
    try {
      const inputs = [market.fieldId, `${position}u8`, `${amountNum}u64`];
      const tx = Transaction.createTransaction(
        publicKey,
        WalletAdapterNetwork.TestnetBeta,
        PROGRAM_ID,
        'place_bet',
        inputs,
        50000,
      );
      await requestTransaction(tx);
      setStatus('success');
      setTimeout(() => { onSuccess(); onClose(); }, 2000);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed');
    }
  };

  const isYes = position === 1;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-zinc-900/95 backdrop-blur-2xl border border-white/[0.08] rounded-3xl p-8 w-full max-w-sm mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {status === 'idle' && (
          <>
            <div className="text-center mb-8">
              <div className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 ${isYes ? 'bg-emerald-500/15' : 'bg-rose-500/15'}`}>
                <span className={`text-2xl ${isYes ? 'text-emerald-400' : 'text-rose-400'}`}>{isYes ? '↑' : '↓'}</span>
              </div>
              <h3 className="text-xl font-semibold text-white tracking-tight">Predict {isYes ? 'Yes' : 'No'}</h3>
              <p className="text-sm text-white/40 mt-2 leading-relaxed">{market.question}</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-white/30 uppercase tracking-wider mb-2">Amount</label>
                <div className="relative">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0"
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-2xl px-5 py-4 text-2xl font-light text-white text-center placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-all"
                  />
                  <span className="absolute right-5 top-1/2 -translate-y-1/2 text-white/20 text-sm">credits</span>
                </div>
              </div>
              {error && <p className="text-rose-400/80 text-sm text-center">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={onClose} className="flex-1 py-4 bg-white/[0.05] hover:bg-white/[0.08] rounded-2xl font-medium text-white/60 transition-all">Cancel</button>
                <button onClick={handleBet} className={`flex-1 py-4 rounded-2xl font-medium text-white transition-all ${isYes ? 'bg-emerald-500 hover:bg-emerald-400' : 'bg-rose-500 hover:bg-rose-400'}`}>Confirm</button>
              </div>
            </div>
            <p className="text-center text-[11px] text-white/25 mt-6">Your position remains private on Aleo</p>
          </>
        )}
        {status === 'pending' && (
          <div className="text-center py-12">
            <div className="w-10 h-10 border-2 border-white/10 border-t-white/50 rounded-full animate-spin mx-auto mb-6" />
            <p className="text-white/70 font-medium">Processing</p>
            <p className="text-white/30 text-sm mt-1">Confirm in wallet</p>
          </div>
        )}
        {status === 'success' && (
          <div className="text-center py-12">
            <div className="w-14 h-14 bg-emerald-500/15 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            </div>
            <p className="text-white font-medium">Bet Placed</p>
            <p className="text-white/30 text-sm mt-1">Privately recorded</p>
          </div>
        )}
        {status === 'error' && (
          <div className="text-center py-12">
            <div className="w-14 h-14 bg-rose-500/15 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-7 h-7 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </div>
            <p className="text-white font-medium">Failed</p>
            <p className="text-white/30 text-sm mt-1">{error}</p>
            <button onClick={() => setStatus('idle')} className="mt-6 px-6 py-2 bg-white/[0.05] hover:bg-white/[0.08] rounded-full text-sm text-white/60 transition-all">Try Again</button>
          </div>
        )}
      </div>
    </div>
  );
}
