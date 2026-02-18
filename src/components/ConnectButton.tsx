'use client';

import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { WalletMultiButton } from '@provablehq/aleo-wallet-adaptor-react-ui';

export default function ConnectButton() {
  const { connected, address, network } = useWallet();

  return (
    <div className="flex items-center gap-2">
      {connected && (
        <div className="text-[11px] text-white/50 text-right hidden sm:block">
          <div>{network ?? 'Testnet'}</div>
          <div className="font-mono">{address ? `${address.slice(0, 12)}...${address.slice(-6)}` : ''}</div>
        </div>
      )}
      <WalletMultiButton />
    </div>
  );
}
