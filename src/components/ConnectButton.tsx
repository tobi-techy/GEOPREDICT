'use client';

import { useMemo } from 'react';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { WalletMultiButton } from '@demox-labs/aleo-wallet-adapter-reactui';
import { APP_NETWORK } from './WalletProvider';

declare global {
  interface Window {
    leoWallet?: unknown;
  }
}

export default function ConnectButton() {
  const { publicKey, connected } = useWallet();

  const accountLabel = useMemo(() => {
    if (!publicKey) return 'No account connected';
    return `${publicKey.slice(0, 10)}...${publicKey.slice(-8)}`;
  }, [publicKey]);

  const hasExtension = typeof window !== 'undefined' && !!window.leoWallet;

  return (
    <div className="flex items-center gap-2">
      <div className="text-[11px] text-white/40 text-right hidden sm:block">
        <div>{APP_NETWORK}</div>
        <div className="font-mono">{accountLabel}</div>
      </div>

      {!hasExtension && !connected && (
        <a
          href="https://leo.app/"
          target="_blank"
          rel="noreferrer"
          className="px-3 py-2 rounded-full text-[12px] bg-amber-500/15 text-amber-300 border border-amber-500/30"
        >
          Install Leo Wallet
        </a>
      )}

      <WalletMultiButton className="!h-10 !rounded-full !bg-white !text-zinc-900 !text-[13px] !font-semibold !px-4 hover:!opacity-90" />
    </div>
  );
}
