'use client';

import { useEffect, useRef, useState } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { PROGRAM_ID } from './WalletProvider';
import { ALEO_API } from '@/lib/markets';
import {
  countPendingTransactions,
  markPendingTransactionConfirmed,
  markPendingTransactionFailed,
  readPendingTransactions,
  readTrackingMode,
  RelayPendingError,
  resolveOnchainTransactionId,
  TRACKING_MODE_EVENT,
  type TrackingMode,
} from '@/lib/transactionTracking';

interface PendingTxReconcilerProps {
  onPendingCountChange?: (count: number) => void;
}

export default function PendingTxReconciler({ onPendingCountChange }: PendingTxReconcilerProps) {
  const { connected, wallet, requestTransactionHistory, transactionStatus } = useWallet();
  const [trackingMode, setTrackingMode] = useState<TrackingMode>('privacy');
  const isRunning = useRef(false);
  const walletName = wallet?.adapter?.name ?? '';
  const isShieldWallet = walletName.toLowerCase().includes('shield');

  useEffect(() => {
    setTrackingMode(readTrackingMode());
    const onModeChange = () => setTrackingMode(readTrackingMode());
    window.addEventListener(TRACKING_MODE_EVENT, onModeChange);
    return () => window.removeEventListener(TRACKING_MODE_EVENT, onModeChange);
  }, []);

  useEffect(() => {
    onPendingCountChange?.(countPendingTransactions());
  }, [onPendingCountChange]);

  useEffect(() => {
    if (!connected) return;

    const reconcile = async () => {
      if (isRunning.current) return;
      isRunning.current = true;
      try {
        const pending = readPendingTransactions()
          .filter((tx) => tx.status === 'pending')
          .slice(0, 4);

        for (const tx of pending) {
          try {
            const onchainTxId = await resolveOnchainTransactionId({
              walletTxId: tx.walletTxId,
              aleoApi: ALEO_API,
              transactionStatus,
              useHistory: trackingMode === 'reliability' && isShieldWallet,
              historyProgram: tx.program || PROGRAM_ID,
              requestTransactionHistory,
              maxAttempts: 1,
              intervalMs: 0,
            });
            markPendingTransactionConfirmed(tx.walletTxId, onchainTxId);
          } catch (error) {
            if (error instanceof RelayPendingError) continue;
            const message = error instanceof Error ? error.message : 'Pending transaction reconcile failed';
            if (/failed|rejected/i.test(message)) {
              markPendingTransactionFailed(tx.walletTxId, message);
            }
          }
        }
      } finally {
        isRunning.current = false;
        onPendingCountChange?.(countPendingTransactions());
      }
    };

    void reconcile();
    const timer = window.setInterval(() => void reconcile(), 15_000);
    return () => window.clearInterval(timer);
  }, [
    connected,
    isShieldWallet,
    onPendingCountChange,
    requestTransactionHistory,
    trackingMode,
    transactionStatus,
  ]);

  return null;
}
