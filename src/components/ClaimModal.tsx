'use client';

import { useMemo, useState } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { WalletMultiButton } from '@provablehq/aleo-wallet-adaptor-react-ui';
import { type Market, calcParimutuelPayout, formatAmount } from '@/lib/markets';
import { PROGRAM_ID } from './WalletProvider';
import { toMicrocredits } from '@/lib/token';
import { pickBetRecord } from '@/lib/aleoRecords';

interface ClaimModalProps {
  market: Market;
  stakeHint: number;
  onClose: () => void;
}

export default function ClaimModal({ market, stakeHint, onClose }: ClaimModalProps) {
  const { connected, address, executeTransaction, requestRecords } = useWallet();
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [txId, setTxId] = useState('');
  const [error, setError] = useState('');
  const [stakeInput, setStakeInput] = useState(() => (stakeHint > 0 ? String(Number(stakeHint.toFixed(2))) : ''));

  const stakeNum = Number(stakeInput) || 0;
  const settlement = useMemo(
    () => stakeNum > 0 ? calcParimutuelPayout({ market, position: market.outcome as 1 | 2, stake: stakeNum }) : null,
    [market, stakeNum],
  );

  const handleClaim = async () => {
    if (!connected || !address) { setError('Connect wallet first'); return; }
    if (market.outcome === 0) { setError('Market is not resolved yet'); return; }

    setStatus('pending');
    setError('');
    try {
      const winnerPool = market.outcome === 1 ? market.totalYes : market.totalNo;
      const loserPool = market.outcome === 1 ? market.totalNo : market.totalYes;
      const winnerPoolUnits = toMicrocredits(winnerPool);
      const loserPoolUnits = toMicrocredits(loserPool);
      if (winnerPoolUnits <= 0) {
        setStatus('error');
        setError('Winner pool is empty on-chain; cannot compute claim payout.');
        return;
      }
      const betRecords = await requestRecords(PROGRAM_ID, true);
      const nonPlainBetRecords = await requestRecords(PROGRAM_ID, false);
      const winningPosition = market.outcome as 1 | 2;
      const betRecord =
        pickBetRecord(betRecords, market.fieldId, winningPosition) ??
        pickBetRecord(nonPlainBetRecords, market.fieldId, winningPosition);
      if (!betRecord) {
        setStatus('error');
        setError('No winning bet record found in wallet for this market.');
        return;
      }

      const result = await executeTransaction({
        program: PROGRAM_ID,
        function: 'claim_winnings',
        inputs: [
          betRecord,
          `${market.outcome}u8`,
          `${winnerPoolUnits}u64`,
          `${loserPoolUnits}u64`,
        ],
        fee: 50_000,
        privateFee: false,
      });
      setTxId(result?.transactionId ?? 'submitted');
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Transaction failed');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-zinc-900/95 backdrop-blur-2xl border border-white/[0.08] rounded-3xl p-8 w-full max-w-sm mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {status === 'idle' && (
          <>
            <div className="text-center mb-6">
              <h3 className="text-xl font-semibold text-white tracking-tight">Claim Winnings</h3>
              <p className="text-sm text-white/60 mt-2">Outcome: {market.outcome === 1 ? 'Yes' : 'No'}</p>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-medium text-white/30 uppercase tracking-wider mb-2">Optional stake (preview payout)</label>
              <input type="number" min="0" step="0.01" value={stakeInput} onChange={(e) => setStakeInput(e.target.value)} placeholder="Enter stake to preview"
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3 text-[14px] text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-all" />
            </div>

            {settlement && (
              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.04] mb-4 text-[12px] text-white/60 space-y-1">
                <div className="flex justify-between"><span>Stake</span><span className="text-white/80">{formatAmount(stakeNum)}</span></div>
                <div className="flex justify-between"><span>Est. payout</span><span className="text-white/80">{formatAmount(settlement.payout)}</span></div>
                <div className="flex justify-between"><span>Est. profit</span><span className="text-emerald-400">+{formatAmount(settlement.profit)}</span></div>
                <p className="text-[11px] text-white/30 pt-1 border-t border-white/[0.04]">payout = stake + (stake / winner_pool) × loser_pool</p>
              </div>
            )}

            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.04] mb-6">
              <p className="text-[13px] text-white/40 leading-relaxed">
                Privacy: your winning bet record is consumed privately and a new private credits record is minted as payout.
              </p>
            </div>
            {error && <p className="text-rose-400/80 text-sm text-center mb-4">{error}</p>}
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-4 bg-white/[0.05] hover:bg-white/[0.08] rounded-2xl font-medium text-white/60 transition-all">Cancel</button>
              {connected ? (
                <button
                  onClick={handleClaim}
                  disabled={market.outcome === 0}
                  className="flex-1 py-4 bg-amber-500 hover:bg-amber-400 rounded-2xl font-medium text-white transition-all disabled:opacity-50"
                >
                  Claim
                </button>
              ) : (
                <div className="flex-1"><WalletMultiButton /></div>
              )}
            </div>
          </>
        )}

        {status === 'pending' && <p className="text-center text-white/70 py-12">Submitting claim to Aleo Testnet...</p>}

        {status === 'success' && (
          <div className="text-center py-8">
            <p className="text-white font-medium mb-1">Winnings Claimed</p>
            <p className="text-white/30 text-sm mb-6">Transaction submitted on-chain</p>
            {txId && (
              <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4 mb-4">
                <p className="text-[11px] text-white/30 uppercase tracking-wider mb-2">Transaction ID</p>
                <p className="text-[13px] text-white/80 font-mono break-all">{txId}</p>
              </div>
            )}
            <button onClick={onClose} className="px-6 py-2 bg-white/[0.05] hover:bg-white/[0.08] rounded-full text-sm text-white/60 transition-all">Close</button>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center py-12">
            <p className="text-white font-medium">Transaction Failed</p>
            <p className="text-white/30 text-sm mt-1">{error}</p>
            <button onClick={() => setStatus('idle')} className="mt-6 px-6 py-2 bg-white/[0.05] hover:bg-white/[0.08] rounded-full text-sm text-white/60 transition-all">Try Again</button>
          </div>
        )}
      </div>
    </div>
  );
}
