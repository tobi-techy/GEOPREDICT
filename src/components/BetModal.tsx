'use client';

import { useEffect, useMemo, useState } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { WalletMultiButton } from '@provablehq/aleo-wallet-adaptor-react-ui';
import { type Market, calcParimutuelPayout, calcTradeImpact, formatAmount } from '@/lib/markets';
import { toMicrocredits, TOKEN } from '@/lib/token';
import { APP_NETWORK, PROGRAM_ID } from './WalletProvider';
import { ALEO_API } from '@/lib/markets';
import { pickCreditsRecord, sumCreditsRecords } from '@/lib/aleoRecords';
import PrivacyIndicator from './PrivacyIndicator';
import {
  markPendingTransactionConfirmed,
  markPendingTransactionFailed,
  readTrackingMode,
  RelayPendingError,
  resolveOnchainTransactionId,
  TRACKING_MODE_EVENT,
  type TrackingMode,
  upsertPendingTransaction,
} from '@/lib/transactionTracking';

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
  const {
    connected,
    wallet,
    address,
    executeTransaction,
    requestRecords,
    requestTransactionHistory,
    transactionStatus,
    connect,
    disconnect,
  } = useWallet();
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<'idle' | 'pending' | 'confirming' | 'success' | 'error'>('idle');
  const [pendingMessage, setPendingMessage] = useState('Submitting transaction to Aleo Testnet...');
  const [error, setError] = useState('');
  const [txId, setTxId] = useState('');
  const [relayPendingId, setRelayPendingId] = useState<string | null>(null);
  // When set, "Try Again" will re-poll for the private record then place the bet
  const [pendingConversionStake, setPendingConversionStake] = useState<number | null>(null);
  const [trackingMode, setTrackingMode] = useState<TrackingMode>('privacy');
  const [usePrivateFee, setUsePrivateFee] = useState(false);
  const [feeNotice, setFeeNotice] = useState('');
  const [needsProgramReconnect, setNeedsProgramReconnect] = useState(false);
  const appendFeeNotice = (message: string) => {
    setFeeNotice((prev) => (prev ? `${prev} ${message}` : message));
  };
  const isAllowedProgramError = (err: unknown): boolean => {
    if (!(err instanceof Error)) return false;
    return /not in the allowed programs/i.test(err.message);
  };
  const isRecordAccessError = (err: unknown): boolean => {
    if (!(err instanceof Error)) return false;
    return /failed to request records|permission denied|record/i.test(err.message);
  };
  useEffect(() => {
    setTrackingMode(readTrackingMode());
    const onModeChange = () => setTrackingMode(readTrackingMode());
    window.addEventListener(TRACKING_MODE_EVENT, onModeChange);
    return () => window.removeEventListener(TRACKING_MODE_EVENT, onModeChange);
  }, []);

  const walletName = wallet?.adapter?.name ?? 'Wallet';
  const isShieldWallet = walletName.toLowerCase().includes('shield');
  const withTimeout = async <T,>(promise: Promise<T>, ms: number, message: string): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race<T>([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error(message)), ms);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
  const loadProgramRecords = async (program: string): Promise<{
    encryptedRecords: unknown[];
    plaintextRecords: unknown[];
    warning?: string;
  }> => {
    const recordTimeoutMs = 10_000;
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const [encryptedResult, plaintextResult] = await Promise.allSettled([
        withTimeout(requestRecords(program, false), recordTimeoutMs, `${walletName} timed out fetching encrypted records.`),
        withTimeout(requestRecords(program, true), recordTimeoutMs, `${walletName} timed out fetching plaintext records.`),
      ]);
      const encryptedRecords = encryptedResult.status === 'fulfilled' ? (encryptedResult.value ?? []) : [];
      const plaintextRecords = plaintextResult.status === 'fulfilled' ? (plaintextResult.value ?? []) : [];
      if (encryptedResult.status === 'rejected' && plaintextResult.status === 'rejected') {
        lastError = new Error(`Failed to request records: ${encryptedResult.reason instanceof Error ? encryptedResult.reason.message : 'unknown'}`);
        if (attempt < 2) { await new Promise(r => setTimeout(r, 1_000)); continue; }
        throw lastError;
      }
      return {
        encryptedRecords: Array.isArray(encryptedRecords) ? encryptedRecords : [],
        plaintextRecords: Array.isArray(plaintextRecords) ? plaintextRecords : [],
      };
    }
    throw lastError ?? new Error(`Failed to request records for ${program}.`);
  };

  const resolveExplorerTxId = async (submittedId: string, maxAttempts = 120): Promise<string> =>
    resolveOnchainTransactionId({
      walletTxId: submittedId,
      aleoApi: ALEO_API,
      transactionStatus,
      useHistory: trackingMode === 'reliability' && isShieldWallet,
      historyProgram: PROGRAM_ID,
      requestTransactionHistory,
      maxAttempts,
      intervalMs: 3_000,
      onExplorerTxId: (nextId) => setTxId(nextId),
      address: address ?? undefined,
      functionName: 'place_bet',
      submittedAt: Date.now(),
    });

  const handleReconnectPermissions = async () => {
    setError('');
    setNeedsProgramReconnect(false);
    try {
      await disconnect();
      await connect(APP_NETWORK);
      setFeeNotice('Wallet reconnected. Program permissions refreshed; retry your bet.');
      setStatus('idle');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to reconnect wallet');
    }
  };

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
    if (!Number.isFinite(parsedUnits) || parsedUnits <= 0) { setError('Enter a valid numeric amount'); return; }
    if (!connected || !address) { setError('Connect wallet first'); return; }

    setStatus('pending');
    setPendingMessage('Reading wallet records...');
    setError('');
    setFeeNotice('');
    setNeedsProgramReconnect(false);
    setRelayPendingId(null);
    let submittedIdForFailure: string | null = null;
    let recordsWarningNotified = false;
    try {
      const resolveStakeRecord = async (): Promise<{ stakeRecord: string | null; plainCount: number; encryptedCount: number; totalPrivate: number }> => {
        const {
          encryptedRecords: nonPlainRecords,
          plaintextRecords: availableCreditsRecords,
          warning,
        } = await loadProgramRecords('credits.aleo');
        if (warning && !recordsWarningNotified) {
          appendFeeNotice(warning);
          recordsWarningNotified = true;
        }
        const allRecords = [...(Array.isArray(availableCreditsRecords) ? availableCreditsRecords : []), ...(Array.isArray(nonPlainRecords) ? nonPlainRecords : [])];
        return {
          stakeRecord:
            pickCreditsRecord(availableCreditsRecords, parsedUnits) ??
            pickCreditsRecord(nonPlainRecords, parsedUnits),
          plainCount: Array.isArray(availableCreditsRecords) ? availableCreditsRecords.length : 0,
          encryptedCount: Array.isArray(nonPlainRecords) ? nonPlainRecords.length : 0,
          totalPrivate: sumCreditsRecords(allRecords),
        };
      };
      const waitForStakeRecord = async (
        attempts: number,
        intervalMs: number,
      ): Promise<{ stakeRecord: string | null; plainCount: number; encryptedCount: number; totalPrivate: number }> => {
        let latest = await resolveStakeRecord();
        if (latest.stakeRecord) return latest;
        for (let i = 0; i < attempts; i += 1) {
          await new Promise((r) => setTimeout(r, intervalMs));
          latest = await resolveStakeRecord();
          if (latest.stakeRecord) return latest;
        }
        return latest;
      };

      let { stakeRecord, plainCount, encryptedCount, totalPrivate } = await resolveStakeRecord();
      
      // Check if user has enough total balance before attempting conversion
      const publicBalance = address ? await fetchPublicCreditsBalance(address) : 0;
      const totalAvailable = totalPrivate + (publicBalance ?? 0);
      const feeBuffer = 100_000; // 0.1 credits for fees
      if (totalAvailable < parsedUnits + feeBuffer) {
        setStatus('error');
        setError(`Insufficient balance. You have ${(totalAvailable / 1_000_000).toFixed(2)} credits but need ${((parsedUnits + feeBuffer) / 1_000_000).toFixed(2)} (including fees). Use the Faucet in Shield Wallet to get testnet credits.`);
        return;
      }

      let conversionError = '';
      let conversionWalletTxId: string | null = null;
      if (!stakeRecord && address && (publicBalance ?? 0) > 0) {
        setPendingMessage('Converting public credits to private and syncing wallet records...');
        const receiverCandidates = [`${address}.private`, address];
        for (const receiverInput of receiverCandidates) {
          try {
            const submitConversion = async (privateFee: boolean) => executeTransaction({
              program: 'credits.aleo',
              function: 'transfer_public_to_private',
              inputs: [receiverInput, `${parsedUnits}u64`],
              fee: 50_000,
              privateFee,
            });

            let conversionTx;
            try {
              conversionTx = await withTimeout(
                submitConversion(usePrivateFee),
                30_000,
                `${walletName} did not return conversion tx id in time. Waiting for wallet sync...`,
              );
            } catch (conversionErr) {
              const message = conversionErr instanceof Error ? conversionErr.message : '';
              if (!usePrivateFee || !/private fee/i.test(message)) {
                throw conversionErr;
              }
              conversionTx = await withTimeout(
                submitConversion(false),
                30_000,
                `${walletName} did not return conversion tx id in time. Waiting for wallet sync...`,
              );
              appendFeeNotice('Private fee unavailable for wallet top-up, so conversion used public fee.');
            }
            const conversionTxId = conversionTx?.transactionId ?? '';
            if (conversionTxId) {
              conversionWalletTxId = conversionTxId;
              setTxId(conversionTxId);
              // Do not block bet flow on conversion explorer lookup; record sync is the source of truth here.
              void resolveExplorerTxId(conversionTxId, 30).catch(() => undefined);
            }
            if (conversionTx?.transactionId) {
              setPendingMessage('Waiting for converted private record to become available...');
              const next = await waitForStakeRecord(20, 2_000);
              stakeRecord = next.stakeRecord;
              plainCount = next.plainCount;
              encryptedCount = next.encryptedCount;
              totalPrivate = next.totalPrivate;
            } else {
              const next = await waitForStakeRecord(10, 2_000);
              stakeRecord = next.stakeRecord;
              plainCount = next.plainCount;
              encryptedCount = next.encryptedCount;
              totalPrivate = next.totalPrivate;
            }
            if (stakeRecord) break;
          } catch (conversionErr) {
            const nextMessage = conversionErr instanceof Error ? conversionErr.message : 'unknown conversion error';
            conversionError = conversionError ? `${conversionError} | ${nextMessage}` : nextMessage;
            const next = await waitForStakeRecord(10, 2_000);
            stakeRecord = next.stakeRecord;
            plainCount = next.plainCount;
            encryptedCount = next.encryptedCount;
            totalPrivate = next.totalPrivate;
            if (stakeRecord) break;
          }
        }
      }

      if (!stakeRecord) {
        const balanceDetail = ` Private: ${(totalPrivate / 1_000_000).toFixed(2)}, Public: ${((publicBalance ?? 0) / 1_000_000).toFixed(2)} credits.`;
        if (conversionWalletTxId) {
          setRelayPendingId(conversionWalletTxId);
          setPendingConversionStake(parsedUnits);
          setStatus('error');
          setError(
            `Conversion transaction was submitted but private record is still syncing in ${walletName}. Click "Try Again" to re-poll for the record and place the bet.${balanceDetail}`,
          );
          return;
        }
        setStatus('error');
        setError(
          encryptedCount > 0 || plainCount > 0
            ? `Wallet has records (plaintext: ${plainCount}, encrypted: ${encryptedCount}) but none could be selected for this stake. Try a smaller amount or consolidate records in wallet.${conversionError ? ` Convert error: ${conversionError}` : ''}${balanceDetail}`
            : `No credits records available. Auto-convert from public balance also failed; fund wallet and create a private credits record first.${conversionError ? ` Convert error: ${conversionError}` : ''}${balanceDetail}`,
        );
        return;
      }

      setPendingMessage('Generating ZK proof... This can take 2-5 minutes. Check Shield Wallet for status.');
      const submitBet = async (record: string, privateFee: boolean) => executeTransaction({
        program: PROGRAM_ID,
        function: 'place_bet',
        inputs: [record, market.fieldId, `${position}u8`, `${parsedUnits}u64`],
        fee: 200_000,
        privateFee,
      });

      let result;
      let usedRecord = stakeRecord;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          try {
            result = await submitBet(usedRecord, usePrivateFee);
          } catch (txErr) {
            if (!usePrivateFee) throw txErr;
            result = await submitBet(usedRecord, false);
            appendFeeNotice('Private fee unavailable for bet, so transaction used public fee.');
          }
          break; // success
        } catch (txErr) {
          const msg = txErr instanceof Error ? txErr.message : '';
          if (/already exists in the ledger/i.test(msg) && attempt < 2) {
            setPendingMessage(`Record already spent, fetching fresh record (attempt ${attempt + 2}/3)...`);
            await new Promise(r => setTimeout(r, 3_000));
            const fresh = await resolveStakeRecord();
            if (fresh.stakeRecord && fresh.stakeRecord !== usedRecord) {
              usedRecord = fresh.stakeRecord;
              continue;
            }
          }
          throw txErr;
        }
      }
      const submittedId = result?.transactionId ?? '';
      if (!submittedId) throw new Error('Wallet did not return a transaction ID.');
      submittedIdForFailure = submittedId;
      setTxId(submittedId);
      setRelayPendingId(submittedId);
      upsertPendingTransaction({
        walletTxId: submittedId,
        status: 'pending',
        kind: 'bet',
        program: PROGRAM_ID,
        functionName: 'place_bet',
        marketId: market.id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      setStatus('confirming');
      const resolvedTxId = await resolveExplorerTxId(submittedId);
      setTxId(resolvedTxId);
      setRelayPendingId(null);
      markPendingTransactionConfirmed(submittedId, resolvedTxId);
      setStatus('success');
      setTimeout(() => onSuccess(stakeNum), 1200);
    } catch (err) {
      setStatus('error');
      const message = err instanceof Error ? err.message : 'Transaction failed';
      if (err instanceof RelayPendingError || /temporary tx id/i.test(message)) {
        setError(
          `${walletName} relay is delayed. Transaction may be accepted in wallet but explorer ID is not available yet. Click "Check On-Chain Again".`,
        );
        return;
      }
      if (/already exists in the ledger/i.test(message)) {
        setError('All available records are already spent. Open Shield Wallet, wait for sync to complete, then try again.');
        return;
      }
      if (isAllowedProgramError(err)) {
        setNeedsProgramReconnect(true);
        setError('Wallet session is missing permission for geopredict_private_v3.aleo. Reconnect wallet permissions, then retry.');
        return;
      }
      if (isRecordAccessError(err)) {
        setNeedsProgramReconnect(true);
        setError(
          `${message} Reconnect wallet and approve records/decrypt access for credits.aleo and ${PROGRAM_ID}.`,
        );
        return;
      }
      if (submittedIdForFailure) {
        markPendingTransactionFailed(submittedIdForFailure, message);
      }
      setError(message);
    }
  };

  const handleRecheckOnChain = async () => {
    if (!relayPendingId) return;
    setStatus('confirming');
    setError('');
    setPendingMessage('Checking on-chain for your bet...');
    try {
      const resolvedTxId = await resolveExplorerTxId(relayPendingId, 60);
      setTxId(resolvedTxId);
      markPendingTransactionConfirmed(relayPendingId, resolvedTxId);
      setRelayPendingId(null);
      setStatus('success');
      setTimeout(() => onSuccess(stakeNum), 1200);
    } catch (err) {
      setStatus('error');
      if (err instanceof RelayPendingError) {
        setError('Still not indexed yet. Keep checking — Shield Wallet may take 10+ minutes to relay.');
        return;
      }
      const message = err instanceof Error ? err.message : 'Transaction confirmation failed';
      markPendingTransactionFailed(relayPendingId, message);
      setError(message);
    }
  };

  // Re-poll for the private record after a conversion and then place the bet
  const handleRetryAfterConversion = async () => {
    if (!pendingConversionStake) { setStatus('idle'); return; }
    setStatus('pending');
    setError('');
    setPendingMessage('Re-checking wallet for converted private record...');
    try {
      let stakeRecord: string | null = null;
      for (let i = 0; i < 40; i++) {
        const { encryptedRecords, plaintextRecords } = await (async () => {
          try { return await loadProgramRecords('credits.aleo'); } catch { return { encryptedRecords: [], plaintextRecords: [] }; }
        })();
        stakeRecord = pickCreditsRecord(plaintextRecords as never[], pendingConversionStake) ?? pickCreditsRecord(encryptedRecords as never[], pendingConversionStake) ?? null;
        if (stakeRecord) break;
        if (i < 39) await new Promise(r => setTimeout(r, 2_000));
      }
      if (!stakeRecord) {
        setStatus('error');
        setError('Private record still not visible in wallet. Wait a minute and try again, or manually create a private credits record in your wallet.');
        return;
      }
      setPendingMessage('Submitting bet to Aleo Testnet...');
      const submitBet = async (privateFee: boolean) => executeTransaction({
        program: PROGRAM_ID,
        function: 'place_bet',
        inputs: [stakeRecord!, market.fieldId, `${position}u8`, `${pendingConversionStake}u64`],
        fee: 50_000,
        privateFee,
      });
      let result;
      try { result = await submitBet(usePrivateFee); } catch { result = await submitBet(false); }
      const submittedId = result?.transactionId ?? '';
      if (!submittedId) throw new Error('Wallet did not return a transaction ID.');
      setTxId(submittedId);
      setRelayPendingId(submittedId);
      setPendingConversionStake(null);
      upsertPendingTransaction({ walletTxId: submittedId, status: 'pending', kind: 'bet', program: PROGRAM_ID, functionName: 'place_bet', marketId: market.id, createdAt: Date.now(), updatedAt: Date.now() });
      setStatus('confirming');
      const resolvedTxId = await resolveExplorerTxId(submittedId);
      setTxId(resolvedTxId);
      setRelayPendingId(null);
      markPendingTransactionConfirmed(submittedId, resolvedTxId);
      setStatus('success');
      setTimeout(() => onSuccess(pendingConversionStake / 1_000_000), 1200);
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
                  <div className="flex justify-between text-white/50"><span>Est. payout if you win</span><span className="text-white/90 font-medium">{formatAmount(payout.payout)}</span></div>
                  <div className="flex justify-between text-white/50"><span>Est. profit</span><span className={payout.profit > 0 ? "text-emerald-400 font-medium" : "text-white/50"}>+{formatAmount(payout.profit)}{payout.profit === 0 && impact.poolDepth === 0 ? ' (first bet)' : ''}</span></div>
                  <div className="flex justify-between text-white/50"><span>Your share of winner pool</span><span className="text-white/70">{payout.winnerPoolAfter > 0 ? ((stakeNum / payout.winnerPoolAfter) * 100).toFixed(1) : 100}%</span></div>
                  <div className="flex justify-between text-white/50"><span>Loser pool to split</span><span className="text-white/70">{formatAmount(payout.loserPoolAfter)}</span></div>
                  {impact.poolDepth === 0 && (
                    <p className="text-[11px] text-amber-300/70 pt-1 border-t border-white/[0.04]">🎯 First bet on this market! Your profit depends on opposing bets.</p>
                  )}
                  <p className="text-[11px] text-white/30 pt-1 border-t border-white/[0.04]">Formula: payout = stake + (stake ÷ winner_pool) × loser_pool</p>
                </div>
              )}

              <PrivacyIndicator context="bet" position={position} amount={stakeNum > 0 ? stakeNum : undefined} />

              <label className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <input
                  type="checkbox"
                  checked={usePrivateFee}
                  onChange={(e) => setUsePrivateFee(e.target.checked)}
                  className="mt-0.5 accent-emerald-500"
                />
                <span className="text-[12px] text-white/45 leading-relaxed">
                  Use private fee for stronger metadata privacy. If unavailable, app retries with public fee. If wallet
                  needs an auto top-up to create a private credits record, that prep transaction may also fall back.
                </span>
              </label>

              {feeNotice && <p className="text-amber-300/80 text-[12px] text-center">{feeNotice}</p>}
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
        {status === 'pending' && <p className="text-center text-white/70 py-12">{pendingMessage}</p>}
        {status === 'confirming' && (
          <div className="text-center py-8">
            <p className="text-white/70 mb-2">{txId.startsWith('at') ? 'Finalizing explorer confirmation...' : `Waiting for ${walletName} relay...`}</p>
            {txId && <p className="text-[11px] text-white/30 font-mono break-all px-2">{txId}</p>}
            {txId && !txId.startsWith('at') && (
              <p className="text-[11px] text-amber-300/70 mt-3">Check your wallet for transaction status</p>
            )}
            <button
              onClick={() => { setStatus('idle'); setError(''); }}
              className="mt-4 px-4 py-2 bg-white/[0.05] hover:bg-white/[0.08] rounded-xl text-sm text-white/50 transition-all"
            >
              Cancel
            </button>
          </div>
        )}
        {status === 'success' && (
          <div className="text-center py-8">
            <p className="text-emerald-300 font-medium mb-2">✓ Bet confirmed on-chain</p>
            {txId && (
              <>
                <a
                  href={`${ALEO_API}/transaction/${txId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-emerald-400/70 hover:text-emerald-400 font-mono break-all px-2 underline underline-offset-2"
                >
                  {txId}
                </a>
                <div className="mt-4 mx-4 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-left">
                  <p className="text-[11px] font-medium text-white/40 uppercase tracking-wider mb-2">🔒 ZK Proof Generated</p>
                  <p className="text-[11px] text-white/50 leading-relaxed">Your bet was executed as a <span className="text-emerald-400">private Aleo record</span>. The zero-knowledge proof verifies you had sufficient credits without revealing your position or stake amount to anyone on-chain.</p>
                  <p className="text-[11px] text-white/30 mt-2 font-mono break-all">proof: {txId.slice(0, 20)}…</p>
                </div>
              </>
            )}
          </div>
        )}
        {status === 'error' && (
          <div className="text-center py-12">
            <p className="text-white font-medium">Transaction Failed</p>
            <p className="text-white/30 text-sm mt-1">{error}</p>
            {needsProgramReconnect && (
              <button
                onClick={handleReconnectPermissions}
                className="mt-6 px-6 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 rounded-full text-sm text-emerald-200 transition-all"
              >
                Reconnect Wallet Permissions
              </button>
            )}
            {relayPendingId && (
              <button
                onClick={handleRecheckOnChain}
                className="mt-3 px-6 py-2 bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/30 rounded-full text-sm text-sky-200 transition-all"
              >
                Check On-Chain Again
              </button>
            )}
            <button onClick={pendingConversionStake ? handleRetryAfterConversion : () => { setPendingConversionStake(null); setStatus('idle'); }} className="mt-3 px-6 py-2 bg-white/[0.05] hover:bg-white/[0.08] rounded-full text-sm text-white/60 transition-all">Try Again</button>
          </div>
        )}
      </div>
    </div>
  );
}
