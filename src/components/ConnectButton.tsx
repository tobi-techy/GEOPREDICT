'use client';

import { useEffect, useMemo, useState } from 'react';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { DecryptPermission } from '@demox-labs/aleo-wallet-adapter-base';
import { APP_NETWORK } from './WalletProvider';

interface ConnectButtonProps {
  onDemoModeChange?: (demo: boolean) => void;
}

declare global {
  interface Window {
    leoWallet?: unknown;
  }
}

export default function ConnectButton({ onDemoModeChange }: ConnectButtonProps) {
  const { publicKey, connected, connecting, connect, disconnect, wallets, select } = useWallet();
  const [hasExtension] = useState(() => typeof window !== 'undefined' && !!window.leoWallet);
  const [demoMode, setDemoMode] = useState(() => typeof window !== 'undefined' && window.localStorage.getItem('geopredict-demo-mode') === '1');

  useEffect(() => {
    onDemoModeChange?.(demoMode);
  }, [demoMode, onDemoModeChange]);

  const accountLabel = useMemo(() => {
    if (!publicKey) return 'No account';
    return `${publicKey.slice(0, 8)}...${publicKey.slice(-6)}`;
  }, [publicKey]);

  const toggleDemo = () => {
    const next = !demoMode;
    setDemoMode(next);
    window.localStorage.setItem('geopredict-demo-mode', next ? '1' : '0');
  };

  const handleConnect = async () => {
    if (connected) {
      await disconnect();
      return;
    }
    if (wallets.length > 0) {
      select(wallets[0].adapter.name);
    }
    await connect(DecryptPermission.UponRequest, APP_NETWORK);
  };

  const cta = connected ? 'Disconnect' : connecting ? 'Connecting...' : 'Connect Leo Wallet';

  return (
    <div className="flex items-center gap-2">
      <div className="text-[11px] text-white/40 text-right hidden sm:block">
        <div>{demoMode ? 'Demo mode' : APP_NETWORK}</div>
        <div className="font-mono">{accountLabel}</div>
      </div>

      {!hasExtension && (
        <a href="https://leo.app/" target="_blank" rel="noreferrer" className="px-3 py-2 rounded-full text-[12px] bg-amber-500/15 text-amber-300 border border-amber-500/30">
          Install Leo Wallet
        </a>
      )}

      <button onClick={handleConnect} disabled={!hasExtension || connecting} className="px-4 py-2 rounded-full text-[13px] font-semibold bg-white text-zinc-900 disabled:opacity-40">
        {cta}
      </button>

      <button onClick={toggleDemo} className={`px-3 py-2 rounded-full text-[12px] border ${demoMode ? 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10' : 'border-white/15 text-white/60 bg-white/[0.04]'}`}>
        {demoMode ? 'Demo ON' : 'Demo OFF'}
      </button>
    </div>
  );
}
