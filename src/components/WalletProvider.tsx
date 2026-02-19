'use client';

import { FC, ReactNode, useMemo, useSyncExternalStore } from 'react';
import { AleoWalletProvider as WalletProvider } from '@provablehq/aleo-wallet-adaptor-react';
import { WalletModalProvider } from '@provablehq/aleo-wallet-adaptor-react-ui';
import { ShieldWalletAdapter } from '@provablehq/aleo-wallet-adaptor-shield';
import { Network } from '@provablehq/aleo-types';
import { DecryptPermission } from '@provablehq/aleo-wallet-adaptor-core';

import '@provablehq/aleo-wallet-adaptor-react-ui/dist/styles.css';

export const APP_NETWORK = Network.TESTNET;
export const PROGRAM_ID = 'geopredict_private_v3.aleo';

const Inner: FC<{ children: ReactNode }> = ({ children }) => {
  const wallets = useMemo(() => [new ShieldWalletAdapter()], []);

  return (
    <WalletProvider
      wallets={wallets}
      autoConnect={true}
      network={APP_NETWORK}
      decryptPermission={DecryptPermission.UponRequest}
      programs={['credits.aleo', PROGRAM_ID]}
      onError={(error) => console.error(error.message)}
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
