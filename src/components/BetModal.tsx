'use client';

import { useMemo, useState } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { WalletMultiButton } from '@provablehq/aleo-wallet-adaptor-react-ui';
import { type Market, calcParimutuelPayout, calcTradeImpact, formatAmount } from '@/lib/markets';
import { toMicrocredits, TOKEN } from '@/lib/token';
import { PROGRAM_ID } from './WalletProvider';
import { ALEO_API } from '@/lib/markets';
import { pickCreditsRecord } from '@/lib/aleoRecords';

async function fetchPublicCreditsBalance(address: string): Promise<number | null> {
  try {
    const res = await fetch(`${ALEO_API}/program/credits.aleo/mapping/account/${address}`);
    if (!res.ok) return null;
    const raw = await res.text();
    if (!raw || raw === 'null') return 0;
    const cleaned = raw.replace(/"/g, '');
    const match = cleaned.match(/(\d+)u64/);
    if (!match) return null;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

interface BetModalProps {
  market: Market;
  position: 1 | 2;
  onClose: () => void;
  onSuccess: (stake: number) => void;
}

export default function BetModal({ market, position, onClose, onSuccess }: BetModalProps) {
  const { connected, address, executeTransaction, requestRecords } = useWallet();
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<'idle' | 'pending' | 'confirming' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const [txId, setTxId] = useState('');

  const stakeNum = Number(amount) || 0;
  const bettingClosed = market.outcome !== 0;

  const payout = useMemo(
    () => stakeNum > 0 ? calcParimutuelPayout({ market, position, stake: stakeNum }) : null,
    [market, position, stakeNum],
  );

  const impact = useMemo(
    () => stakeNum > 0 ? calcTradeImpact({ market, position, stake: stakeNum }) : null,
    [market, position, stakeNum],
  );

  const handleBet = async () => {
    if (bettingClosed) {
      setError('This market is closed for new bets.');
      return;
    }

    const parsedUnits = toMicrocredits(amount);
    if (parsedUnits <= 0) { setError('Enter a valid amount'); return; }
    if (!connected || !address) { setError('Connect wallet first'); return; }

    setStatus('pending');
    setError('');
    try {
      const resolveStakeRecord = async (): Promise<{ stakeRecord: string | null; plainCount: number; encryptedCount: number }> => {
        const availableCreditsRecords = await requestRecords('credits.aleo', true);
        const nonPlainRecords = await requestRecords('credits.aleo', false);
        return {
          stakeRecord:
            pickCreditsRecord(availableCreditsRecords, parsedUnits) ??
            pickCreditsRecord(nonPlainRecords, parsedUnits),
          plainCount: Array.isArray(availableCreditsRecords) ? availableCreditsRecords.length : 0,
          encryptedCount: Array.isArray(nonPlainRecords) ? nonPlainRecords.length : 0,
        };
      };

      let { stakeRecord, plainCount, encryptedCount } = await resolveStakeRecord();
      let conversionError = '';
      if (!stakeRecord && address) {
        const receiverCandidates = [`${address}.private`, address];
        for (const receiverInput of receiverCandidates) {
          try {
            const conversionTx = await executeTransaction({
              program: 'credits.aleo',
              function: 'transfer_public_to_private',
              inputs: [receiverInput, `${parsedUnits}u64`],
              fee: 50_000,
              privateFee: false,
            });
            if (conversionTx?.transactionId) {
              for (let i = 0; i < 10; i += 1) {
                await new Promise((r) => setTimeout(r, 2_000));
                const next = await resolveStakeRecord();
                stakeRecord = next.stakeRecord;
                plainCount = next.plainCount;
                encryptedCount = next.encryptedCount;
                if (stakeRecord) break;
              }
            } else {
              const next = await resolveStakeRecord();
              stakeRecord = next.stakeRecord;
              plainCount = next.plainCount;
              encryptedCount = next.encryptedCount;
            }
            if (stakeRecord) break;
          } catch (conversionErr) {
            const nextMessage = conversionErr instanceof Error ? conversionErr.message : 'unknown conversion error';
            conversionError = conversionError ? `${conversionError} | ${nextMessage}` : nextMessage;
          }
        }
      }

      if (!stakeRecord) {
        const publicBalance = address ? await fetchPublicCreditsBalance(address) : null;
        const balanceDetail =
          publicBalance === null
            ? ''
            : ` Public account balance: ${publicBalance} microcredits.`;
        setStatus('error');
        setError(
          encryptedCount > 0 || plainCount > 0
            ? `Wallet has records (plaintext: ${plainCount}, encrypted: ${encryptedCount}) but none could be selected for this stake. Try a smaller amount or consolidate records in wallet.${conversionError ? ` Convert error: ${conversionError}` : ''}${balanceDetail}`
            : `No credits records available. Auto-convert from public balance also failed; fund wallet and create a private credits record first.${conversionError ? ` Convert error: ${conversionError}` : ''}${balanceDetail}`,
        );
        return;
      }

      const inputs = [stakeRecord, market.fieldId, `${position}u8`, `${parsedUnits}u64`];
      const result = await executeTransaction({
        program: PROGRAM_ID,
        function: 'place_bet',
        inputs,
        fee: 50_000,
        privateFee: false,
      });
      const id = result?.transactionId ?? '';
      setTxId(id);
      setStatus('confirming');
      // Poll for confirmation
      if (id) {
        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          try {
            const res = await fetch(`${ALEO_API}/transaction/${id}`);
            if (res.ok) { setStatus('success'); setTimeout(() => onSuccess(stakeNum), 1200); return; }
          } catch { /* keep polling */ }
        }
      }
      setStatus('success');
      setTimeout(() => onSuccess(stakeNum), 1200);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Transaction failed');
    }
  };

  const isYes = position === 1;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-zinc-900/95 backdrop-blur-2xl border border-white/[0.08] rounded-3xl p-8 w-full max-w-sm mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {status === 'idle' && (
          <>
            <div className="text-center mb-6">
              <h3 className="text-xl font-semibold text-white tracking-tight">Predict {isYes ? 'Yes' : 'No'}</h3>
              <p className="text-sm text-white/40 mt-2 leading-relaxed">{market.question}</p>
              <p className="text-[11px] text-white/30 mt-2">Betting closes {market.deadline.toLocaleString()}</p>
            </div>
            <div className="space-y-4">
              {bettingClosed && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[12px] text-amber-200">
                  Market is closed. Wait for resolution and claim flow.
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-white/30 uppercase tracking-wider mb-2">Amount ({TOKEN.symbol})</label>
                <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0"
                  disabled={bettingClosed}
                  className="w-full bg-white/[0.03] border border-white/[0.08] rounded-2xl px-5 py-4 text-2xl font-light text-white text-center placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-all disabled:opacity-50" />
              </div>

              {payout && impact && (
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] space-y-2 text-[12px]">
                  <div className="flex justify-between text-white/50"><span>Est. payout</span><span className="text-white/90 font-medium">{formatAmount(payout.payout)}</span></div>
                  <div className="flex justify-between text-white/50"><span>Est. profit</span><span className="text-emerald-400 font-medium">+{formatAmount(payout.profit)}</span></div>
                  <div className="flex justify-between text-white/50"><span>Odds shift</span><span className="text-white/70">{impact.beforeOdds}% → {impact.afterOdds}%</span></div>
                  <div className="flex justify-between text-white/50"><span>Slippage</span><span className="text-amber-400">{impact.slippagePct} pp</span></div>
                  <div className="flex justify-between text-white/50"><span>Pool depth</span><span className="text-white/70">{formatAmount(impact.poolDepth)}</span></div>
                  <p className="text-[11px] text-white/30 pt-1 border-t border-white/[0.04]">payout = stake + (stake / winner_pool) × loser_pool</p>
                </div>
              )}

              {error && <p className="text-rose-400/80 text-sm text-center">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={onClose} className="flex-1 py-4 bg-white/[0.05] hover:bg-white/[0.08] rounded-2xl font-medium text-white/60 transition-all">Cancel</button>
                {connected ? (
                  <button
                    onClick={handleBet}
                    disabled={bettingClosed}
                    className={`flex-1 py-4 rounded-2xl font-medium text-white transition-all disabled:opacity-50 ${isYes ? 'bg-emerald-500 hover:bg-emerald-400' : 'bg-rose-500 hover:bg-rose-400'}`}
                  >
                    Confirm
                  </button>
                ) : (
                  <div className="flex-1"><WalletMultiButton /></div>
                )}
              </div>
            </div>
          </>
        )}
        {status === 'pending' && <p className="text-center text-white/70 py-12">Submitting transaction to Aleo Testnet...</p>}
        {status === 'confirming' && (
          <div className="text-center py-8">
            <p className="text-white/70 mb-2">Confirming on-chain...</p>
            {txId && <p className="text-[11px] text-white/30 font-mono break-all px-2">{txId}</p>}
          </div>
        )}
        {status === 'success' && (
          <div className="text-center py-8">
            <p className="text-emerald-300 font-medium mb-2">✓ Bet confirmed on-chain</p>
            {txId && <p className="text-[11px] text-white/30 font-mono break-all px-2">{txId}</p>}
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
