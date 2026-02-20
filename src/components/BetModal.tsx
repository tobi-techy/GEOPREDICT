'use client';

import { useEffect, useMemo, useState } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { WalletMultiButton } from '@provablehq/aleo-wallet-adaptor-react-ui';
import { type Market, calcParimutuelPayout, calcTradeImpact, formatAmount } from '@/lib/markets';
import { toMicrocredits, TOKEN } from '@/lib/token';
import { APP_NETWORK, PROGRAM_ID } from './WalletProvider';
import { ALEO_API } from '@/lib/markets';
import { pickCreditsRecord } from '@/lib/aleoRecords';
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
  const isLeoWallet = walletName.toLowerCase().includes('leo');
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
    const recordTimeoutMs = isLeoWallet ? 60_000 : 15_000;

    // Leo performs best with encrypted records first. Avoid blocking on plaintext fetch when encrypted records exist.
    if (isLeoWallet) {
      try {
        const encryptedOnly = await withTimeout(
          requestRecords(program, false),
          recordTimeoutMs,
          `${walletName} timed out while requesting encrypted records for ${program}.`,
        );
        if (Array.isArray(encryptedOnly) && encryptedOnly.length > 0) {
          return { encryptedRecords: encryptedOnly, plaintextRecords: [] };
        }
      } catch {
        // Continue to dual-path fallback below.
      }
    }

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let encryptedRecords: unknown[] = [];
      let plaintextRecords: unknown[] = [];
      let encryptedError: unknown = null;
      let plaintextError: unknown = null;

      const [encryptedResult, plaintextResult] = await Promise.allSettled([
        withTimeout(
          requestRecords(program, false),
          recordTimeoutMs,
          `${walletName} timed out while requesting encrypted records for ${program}.`,
        ),
        withTimeout(
          requestRecords(program, true),
          recordTimeoutMs,
          `${walletName} timed out while requesting plaintext records for ${program}.`,
        ),
      ]);

      if (encryptedResult.status === 'fulfilled') {
        encryptedRecords = encryptedResult.value;
      } else {
        encryptedError = encryptedResult.reason;
      }

      if (plaintextResult.status === 'fulfilled') {
        plaintextRecords = plaintextResult.value;
      } else {
        plaintextError = plaintextResult.reason;
      }

      if (encryptedError && plaintextError) {
        const encryptedMessage =
          encryptedError instanceof Error ? encryptedError.message : 'unknown encrypted-record error';
        const plaintextMessage =
          plaintextError instanceof Error ? plaintextError.message : 'unknown plaintext-record error';
        lastError = new Error(
          `Failed to request records for ${program}. Encrypted path: ${encryptedMessage}. Plaintext path: ${plaintextMessage}.`,
        );
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 1_000));
          continue;
        }
        throw lastError;
      }

      if (encryptedError && !plaintextError) {
        const message = encryptedError instanceof Error ? encryptedError.message : 'unknown encrypted-record error';
        return {
          encryptedRecords: [],
          plaintextRecords: Array.isArray(plaintextRecords) ? plaintextRecords : [],
          warning: `${walletName} denied encrypted records (${message}); using plaintext records only.`,
        };
      }

      if (!encryptedError && plaintextError) {
        const message = plaintextError instanceof Error ? plaintextError.message : 'unknown plaintext-record error';
        return {
          encryptedRecords: Array.isArray(encryptedRecords) ? encryptedRecords : [],
          plaintextRecords: [],
          warning: `${walletName} denied plaintext records (${message}); using encrypted records only.`,
        };
      }

      return {
        encryptedRecords: Array.isArray(encryptedRecords) ? encryptedRecords : [],
        plaintextRecords: Array.isArray(plaintextRecords) ? plaintextRecords : [],
      };
    }

    throw lastError ?? new Error(`Failed to request records for ${program}.`);
  };

  const resolveExplorerTxId = async (submittedId: string, maxAttempts = 90): Promise<string> =>
    resolveOnchainTransactionId({
      walletTxId: submittedId,
      aleoApi: ALEO_API,
      transactionStatus,
      useHistory: trackingMode === 'reliability' && isShieldWallet,
      historyProgram: PROGRAM_ID,
      requestTransactionHistory,
      maxAttempts,
      intervalMs: 2_000,
      onExplorerTxId: (nextId) => setTxId(nextId),
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
      const resolveStakeRecord = async (): Promise<{ stakeRecord: string | null; plainCount: number; encryptedCount: number }> => {
        const {
          encryptedRecords: nonPlainRecords,
          plaintextRecords: availableCreditsRecords,
          warning,
        } = await loadProgramRecords('credits.aleo');
        if (warning && !recordsWarningNotified) {
          appendFeeNotice(warning);
          recordsWarningNotified = true;
        }
        return {
          stakeRecord:
            pickCreditsRecord(availableCreditsRecords, parsedUnits) ??
            pickCreditsRecord(nonPlainRecords, parsedUnits),
          plainCount: Array.isArray(availableCreditsRecords) ? availableCreditsRecords.length : 0,
          encryptedCount: Array.isArray(nonPlainRecords) ? nonPlainRecords.length : 0,
        };
      };
      const waitForStakeRecord = async (
        attempts: number,
        intervalMs: number,
      ): Promise<{ stakeRecord: string | null; plainCount: number; encryptedCount: number }> => {
        let latest = await resolveStakeRecord();
        if (latest.stakeRecord) return latest;
        for (let i = 0; i < attempts; i += 1) {
          await new Promise((r) => setTimeout(r, intervalMs));
          latest = await resolveStakeRecord();
          if (latest.stakeRecord) return latest;
        }
        return latest;
      };

      let { stakeRecord, plainCount, encryptedCount } = await resolveStakeRecord();
      let conversionError = '';
      let conversionWalletTxId: string | null = null;
      if (!stakeRecord && address) {
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
                60_000,
                `${walletName} did not return conversion tx id in time. Waiting for wallet sync...`,
              );
            } catch (conversionErr) {
              const message = conversionErr instanceof Error ? conversionErr.message : '';
              if (!usePrivateFee || !/private fee/i.test(message)) {
                throw conversionErr;
              }
              conversionTx = await withTimeout(
                submitConversion(false),
                60_000,
                `${walletName} did not return conversion tx id in time. Waiting for wallet sync...`,
              );
              appendFeeNotice('Private fee unavailable for wallet top-up, so conversion used public fee.');
            }
            const conversionTxId = conversionTx?.transactionId ?? '';
            if (conversionTxId) {
              conversionWalletTxId = conversionTxId;
              setTxId(conversionTxId);
              // Do not block bet flow on conversion explorer lookup; record sync is the source of truth here.
              void resolveExplorerTxId(conversionTxId, isShieldWallet ? 45 : 70).catch(() => undefined);
            }
            if (conversionTx?.transactionId) {
              setPendingMessage('Waiting for converted private record to become available...');
              const next = await waitForStakeRecord(isShieldWallet ? 12 : 90, 2_000);
              stakeRecord = next.stakeRecord;
              plainCount = next.plainCount;
              encryptedCount = next.encryptedCount;
            } else {
              const next = await waitForStakeRecord(isShieldWallet ? 6 : 30, 2_000);
              stakeRecord = next.stakeRecord;
              plainCount = next.plainCount;
              encryptedCount = next.encryptedCount;
            }
            if (stakeRecord) break;
          } catch (conversionErr) {
            const nextMessage = conversionErr instanceof Error ? conversionErr.message : 'unknown conversion error';
            conversionError = conversionError ? `${conversionError} | ${nextMessage}` : nextMessage;
            const next = await waitForStakeRecord(isShieldWallet ? 6 : 30, 2_000);
            stakeRecord = next.stakeRecord;
            plainCount = next.plainCount;
            encryptedCount = next.encryptedCount;
            if (stakeRecord) break;
          }
        }
      }

      if (!stakeRecord) {
        const publicBalance = address ? await fetchPublicCreditsBalance(address) : null;
        const balanceDetail =
          publicBalance === null
            ? ''
            : ` Public account balance: ${publicBalance} microcredits.`;
        if (conversionWalletTxId) {
          setRelayPendingId(conversionWalletTxId);
          setStatus('error');
          setError(
            `Conversion transaction was submitted but private record is still syncing in ${walletName}. Once wallet shows it as successful, click "Try Again" to place the bet.${balanceDetail}`,
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

      setPendingMessage('Submitting bet to Aleo Testnet...');
      const inputs = [stakeRecord, market.fieldId, `${position}u8`, `${parsedUnits}u64`];
      const submitBet = async (privateFee: boolean) => executeTransaction({
        program: PROGRAM_ID,
        function: 'place_bet',
        inputs,
        fee: 50_000,
        privateFee,
      });

      let result;
      try {
        result = await submitBet(usePrivateFee);
      } catch (txErr) {
        if (!usePrivateFee) throw txErr;
        // Fall back to public fee if a private fee record is unavailable.
        result = await submitBet(false);
        appendFeeNotice('Private fee unavailable for bet, so transaction used public fee.');
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
    try {
      const resolvedTxId = await resolveExplorerTxId(relayPendingId, 45);
      setTxId(resolvedTxId);
      markPendingTransactionConfirmed(relayPendingId, resolvedTxId);
      setRelayPendingId(null);
      setStatus('success');
      setTimeout(() => onSuccess(stakeNum), 1200);
    } catch (err) {
      setStatus('error');
      const message = err instanceof Error ? err.message : 'Transaction confirmation failed';
      if (err instanceof RelayPendingError) {
        setError('Still waiting for wallet relay. Retry again in a few seconds.');
        return;
      }
      markPendingTransactionFailed(relayPendingId, message);
      setError(message);
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
            <button onClick={() => setStatus('idle')} className="mt-3 px-6 py-2 bg-white/[0.05] hover:bg-white/[0.08] rounded-full text-sm text-white/60 transition-all">Try Again</button>
          </div>
        )}
      </div>
    </div>
  );
}
