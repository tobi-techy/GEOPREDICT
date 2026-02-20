'use client';

import { useEffect, useMemo, useState } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { WalletMultiButton } from '@provablehq/aleo-wallet-adaptor-react-ui';
import { type Market, calcParimutuelPayout, formatAmount } from '@/lib/markets';
import { ALEO_API } from '@/lib/markets';
import { APP_NETWORK, PROGRAM_ID } from './WalletProvider';
import { toMicrocredits } from '@/lib/token';
import { extractRecordAmountMicrocredits, pickBetRecord } from '@/lib/aleoRecords';
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

interface ClaimModalProps {
  market: Market;
  stakeHint: number;
  onClose: () => void;
}

function makePrivateNonceField(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let value = BigInt(0);
  for (const b of bytes) value = (value << BigInt(8)) + BigInt(b);
  return `${value}field`;
}

export default function ClaimModal({ market, stakeHint, onClose }: ClaimModalProps) {
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
  const [status, setStatus] = useState<'idle' | 'pending' | 'confirming' | 'success' | 'error'>('idle');
  const [txId, setTxId] = useState('');
  const [relayPendingId, setRelayPendingId] = useState<string | null>(null);
  const [trackingMode, setTrackingMode] = useState<TrackingMode>('privacy');
  const [error, setError] = useState('');
  const [stakeInput, setStakeInput] = useState(() => (stakeHint > 0 ? String(Number(stakeHint.toFixed(2))) : ''));
  const [usePrivateFee, setUsePrivateFee] = useState(false);
  const [feeNotice, setFeeNotice] = useState('');
  const [needsProgramReconnect, setNeedsProgramReconnect] = useState(false);
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
  const loadProgramRecords = async (program: string): Promise<{
    encryptedRecords: unknown[];
    plaintextRecords: unknown[];
    warning?: string;
  }> => {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let encryptedRecords: unknown[] = [];
      let plaintextRecords: unknown[] = [];
      let encryptedError: unknown = null;
      let plaintextError: unknown = null;

      try {
        encryptedRecords = await requestRecords(program, false);
      } catch (err) {
        encryptedError = err;
      }

      try {
        plaintextRecords = await requestRecords(program, true);
      } catch (err) {
        plaintextError = err;
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
      setFeeNotice('Wallet reconnected. Program permissions refreshed; retry your claim.');
      setStatus('idle');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to reconnect wallet');
    }
  };

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
    setFeeNotice('');
    setNeedsProgramReconnect(false);
    setRelayPendingId(null);
    let submittedIdForFailure: string | null = null;
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
      const {
        plaintextRecords: betRecords,
        encryptedRecords: nonPlainBetRecords,
        warning: recordsWarning,
      } = await loadProgramRecords(PROGRAM_ID);
      if (recordsWarning) {
        setFeeNotice((prev) => (prev ? `${prev} ${recordsWarning}` : recordsWarning));
      }
      const winningPosition = market.outcome as 1 | 2;
      const betRecord =
        pickBetRecord(betRecords, market.fieldId, winningPosition) ??
        pickBetRecord(nonPlainBetRecords, market.fieldId, winningPosition);
      if (!betRecord) {
        setStatus('error');
        setError('No winning bet record found in wallet for this market.');
        return;
      }

      const parsedStakeUnits = extractRecordAmountMicrocredits(betRecord);
      const fallbackStakeUnits = toMicrocredits(stakeInput);
      const stakeUnits = parsedStakeUnits ?? fallbackStakeUnits;
      if (stakeUnits <= 0) {
        setStatus('error');
        setError('Unable to infer stake from selected bet record. Enter your exact winning stake to compute claim.');
        return;
      }

      const loserShare = (BigInt(stakeUnits) * BigInt(loserPoolUnits)) / BigInt(winnerPoolUnits);
      const expectedPayout = BigInt(stakeUnits) + loserShare;
      const claimNonce = makePrivateNonceField();

      const inputs = [
        betRecord,
        `${market.outcome}u8`,
        `${expectedPayout}u64`,
        claimNonce,
      ];

      const submitClaim = async (privateFee: boolean) => executeTransaction({
        program: PROGRAM_ID,
        function: 'claim_winnings',
        inputs,
        fee: 50_000,
        privateFee,
      });

      let result;
      try {
        result = await submitClaim(usePrivateFee);
      } catch (txErr) {
        if (!usePrivateFee) throw txErr;
        result = await submitClaim(false);
        setFeeNotice('Private fee record unavailable. Used public fee fallback for this claim.');
      }
      const submittedId = result?.transactionId ?? '';
      if (!submittedId) throw new Error('Wallet did not return a transaction ID.');
      submittedIdForFailure = submittedId;
      setTxId(submittedId);
      setRelayPendingId(submittedId);
      upsertPendingTransaction({
        walletTxId: submittedId,
        status: 'pending',
        kind: 'claim',
        program: PROGRAM_ID,
        functionName: 'claim_winnings',
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
                Privacy: claim derives payout from on-chain market totals, consumes your private bet record, and mints a private payout record.
              </p>
            </div>
            <label className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] mb-4">
              <input
                type="checkbox"
                checked={usePrivateFee}
                onChange={(e) => setUsePrivateFee(e.target.checked)}
                className="mt-0.5 accent-emerald-500"
              />
              <span className="text-[12px] text-white/45 leading-relaxed">
                Use private fee for stronger metadata privacy. If unavailable, app will retry with public fee.
              </span>
            </label>
            {feeNotice && <p className="text-amber-300/80 text-[12px] text-center mb-2">{feeNotice}</p>}
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
        {status === 'confirming' && (
          <div className="text-center py-8">
            <p className="text-white/70 mb-2">{txId.startsWith('at') ? 'Finalizing explorer confirmation...' : `Waiting for ${walletName} relay...`}</p>
            {txId && <p className="text-[11px] text-white/30 font-mono break-all px-2">{txId}</p>}
          </div>
        )}

        {status === 'success' && (
          <div className="text-center py-8">
            <p className="text-white font-medium mb-1">Winnings Claimed</p>
            <p className="text-white/30 text-sm mb-6">Transaction confirmed on-chain</p>
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
