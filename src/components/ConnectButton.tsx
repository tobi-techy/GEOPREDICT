'use client';

import { useSyncExternalStore } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { WalletMultiButton } from '@provablehq/aleo-wallet-adaptor-react-ui';

export default function ConnectButton() {
  const { connected, address, network } = useWallet();
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  const leoInstalled = (() => {
    if (!mounted || typeof window === 'undefined') return true;
    const w = window as Window & { leoWallet?: unknown; leo?: unknown };
    return Boolean(w.leoWallet ?? w.leo);
  })();

  const networkLabel = typeof network === 'string' ? network : network == null ? 'Testnet' : String(network);

  return (
    <div className="flex items-center gap-2">
      {!connected && !leoInstalled && (
        <a
          href="https://leo.app/"
          target="_blank"
          rel="noreferrer"
          className="px-3 py-2 rounded-full border border-amber-400/30 bg-amber-500/10 text-[12px] text-amber-300 hover:bg-amber-500/20 transition-all"
        >
          Install Leo Wallet
        </a>
      )}
      {connected && (
        <div className="text-[11px] text-white/50 text-right hidden sm:block">
          <div>{networkLabel}</div>
          <div className="font-mono">{address ? `${address.slice(0, 12)}...${address.slice(-6)}` : ''}</div>
        </div>
      )}
      <WalletMultiButton />
    </div>
  );
}
