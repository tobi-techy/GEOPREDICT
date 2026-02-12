'use client';

import { useEffect, useMemo, useState } from 'react';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { DecryptPermission } from '@demox-labs/aleo-wallet-adapter-base';
import { APP_NETWORK } from './WalletProvider';

declare global {
  interface Window {
    leoWallet?: unknown;
  }
}

export default function ConnectButton() {
  const { publicKey, connected, connecting, connect, disconnect, wallets, select } = useWallet();
  const [hasExtension, setHasExtension] = useState(false);

  useEffect(() => {
    const check = () => setHasExtension(typeof window !== 'undefined' && !!window.leoWallet);
    check();
    const t = setTimeout(check, 800);
    return () => clearTimeout(t);
  }, []);

  const accountLabel = useMemo(() => {
    if (!publicKey) return 'No account connected';
    return `${publicKey.slice(0, 10)}...${publicKey.slice(-8)}`;
  }, [publicKey]);

  const handleConnect = async () => {
    if (connected) {
      await disconnect();
      return;
    }

    if (!hasExtension) {
      window.open('https://leo.app/', '_blank', 'noopener,noreferrer');
      return;
    }

    if (wallets.length > 0) {
      select(wallets[0].adapter.name);
      await new Promise((r) => setTimeout(r, 150));
    }

    await connect(DecryptPermission.UponRequest, APP_NETWORK);
  };

  const cta = connected ? 'Disconnect' : connecting ? 'Connecting...' : 'Connect Leo Wallet';

  return (
    <div className="flex items-center gap-2">
      <div className="text-[11px] text-white/40 text-right hidden sm:block">
        <div>{APP_NETWORK}</div>
        <div className="font-mono">{accountLabel}</div>
      </div>

      {!hasExtension && (
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
        onClick={handleConnect}
        disabled={connecting}
        className="px-4 py-2 rounded-full text-[13px] font-semibold bg-white text-zinc-900 disabled:opacity-40"
      >
        {cta}
      </button>
    </div>
  );
}
