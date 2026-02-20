'use client';

import { FC, ReactNode, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AleoWalletProvider as WalletProvider } from '@provablehq/aleo-wallet-adaptor-react';
import { WalletModalProvider } from '@provablehq/aleo-wallet-adaptor-react-ui';
import { LeoWalletAdapter } from '@provablehq/aleo-wallet-adaptor-leo';
import { ShieldWalletAdapter } from '@provablehq/aleo-wallet-adaptor-shield';
import { Network } from '@provablehq/aleo-types';
import { DecryptPermission } from '@provablehq/aleo-wallet-adaptor-core';
import {
  readTrackingMode,
  TRACKING_MODE_EVENT,
  type TrackingMode,
} from '@/lib/transactionTracking';

import '@provablehq/aleo-wallet-adaptor-react-ui/dist/styles.css';

export const APP_NETWORK = Network.TESTNET;
export const PROGRAM_ID = 'geopredict_private_v3.aleo';

const Inner: FC<{ children: ReactNode }> = ({ children }) => {
  const wallets = useMemo(() => [new ShieldWalletAdapter(), new LeoWalletAdapter()], []);
  const [trackingMode, setTrackingMode] = useState<TrackingMode>(() =>
    typeof window === 'undefined' ? 'privacy' : readTrackingMode(),
  );

  useEffect(() => {
    const onChange = () => setTrackingMode(readTrackingMode());
    window.addEventListener(TRACKING_MODE_EVENT, onChange);
    return () => window.removeEventListener(TRACKING_MODE_EVENT, onChange);
  }, []);

  const decryptPermission =
    trackingMode === 'reliability'
      ? DecryptPermission.OnChainHistory
      : DecryptPermission.AutoDecrypt;

  const handleWalletError = (error: Error) => {
    const message = error?.message ?? '';
    if (/onchain history permission required/i.test(message)) {
      console.warn(
        'Shield denied on-chain history. Switch to Reliability mode and reconnect wallet permissions.',
      );
      return;
    }
    if (/unknown error occured|unknown error occurred/i.test(message)) {
      console.warn('Wallet reported a transient unknown error. Retrying flow is usually sufficient.');
      return;
    }
    console.error(message);
  };

  return (
    <WalletProvider
      key={trackingMode}
      wallets={wallets}
      autoConnect={true}
      network={APP_NETWORK}
      decryptPermission={decryptPermission}
      programs={['credits.aleo', PROGRAM_ID]}
      onError={handleWalletError}
    >
      <WalletModalProvider>{children}</WalletModalProvider>
    </WalletProvider>
  );
};

export const AleoWalletProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  // Wait for client mount so useLocalStorage inside WalletProvider
  // reads the persisted walletName instead of hydrating with null.
  if (!mounted) return null;

  return <Inner>{children}</Inner>;
};
