'use client';

import { useMemo, useState } from 'react';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { useWalletModal } from '@demox-labs/aleo-wallet-adapter-reactui';
import { DecryptPermission } from '@demox-labs/aleo-wallet-adapter-base';
import { APP_NETWORK } from './WalletProvider';

declare global {
  interface Window {
    leoWallet?: unknown;
  }
}

export default function ConnectButton() {
  const { publicKey, connected, connecting, wallets, select, connect, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const [error, setError] = useState('');

  const accountLabel = useMemo(() => {
    if (!publicKey) return 'No account connected';
    return `${publicKey.slice(0, 10)}...${publicKey.slice(-8)}`;
  }, [publicKey]);

  const hasExtension = typeof window !== 'undefined' && !!window.leoWallet;

  const handleOpenWallet = async () => {
    setError('');

    if (connected) {
      await disconnect();
      return;
    }

    if (!hasExtension) {
      window.open('https://leo.app/', '_blank', 'noopener,noreferrer');
      return;
    }

    try {
      if (wallets.length > 0) {
        select(wallets[0].adapter.name);
      }
      setVisible(true);
      // Fallback in case modal UI does not render in some environments.
      await connect(DecryptPermission.UponRequest, APP_NETWORK);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Wallet connection failed');
    }
  };

  const cta = connected ? 'Disconnect' : connecting ? 'Connecting...' : 'Connect Leo Wallet';

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

      <button
        onClick={handleOpenWallet}
        disabled={connecting}
        className="px-4 py-2 rounded-full text-[13px] font-semibold bg-white text-zinc-900 disabled:opacity-40"
      >
        {cta}
      </button>

      {error ? <span className="text-[11px] text-rose-300 max-w-[220px] truncate">{error}</span> : null}
    </div>
  );
}
