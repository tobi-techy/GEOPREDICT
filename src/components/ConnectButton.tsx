'use client';

import { useEffect, useMemo, useState } from 'react';
import { DecryptPermission, WalletNotReadyError, WalletNotSelectedError, WalletReadyState } from '@demox-labs/aleo-wallet-adapter-base';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { useWalletModal } from '@demox-labs/aleo-wallet-adapter-reactui';
import { APP_NETWORK } from './WalletProvider';

declare global {
  interface Window {
    leoWallet?: { isAvailable?: () => Promise<boolean> | boolean };
    leo?: { isAvailable?: () => Promise<boolean> | boolean };
  }
}

const LEO_DISPLAY_NAME = 'Leo Wallet';
const LEO_INSTALL_URL = 'https://leo.app/';
const SHOW_WALLET_DEBUG = process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_WALLET_DEBUG === '1';

function getActionableErrorMessage(error: unknown): string {
  const fallback = 'Wallet connection failed. Please retry.';
  if (!(error instanceof Error)) return fallback;

  const msg = error.message || '';

  if (error instanceof WalletNotSelectedError || /not selected/i.test(msg)) {
    return 'No wallet selected yet. Retrying with Leo wallet selected.';
  }

  if (error instanceof WalletNotReadyError || /not ready/i.test(msg)) {
    return 'Leo extension is not ready. Confirm it is installed and unlocked, then refresh this page.';
  }

  if (/popup|blocked/i.test(msg)) {
    return 'Wallet popup was blocked. Allow popups for this site and try again.';
  }

  if (/user.*reject|denied|cancel/i.test(msg)) {
    return 'Connection request was rejected in Leo wallet. Open Leo and approve the prompt.';
  }

  if (/network/i.test(msg)) {
    return `Wallet network mismatch. Switch Leo wallet to ${APP_NETWORK} and reconnect.`;
  }

  return msg;
}

export default function ConnectButton() {
  const { publicKey, connected, connecting, wallet, wallets, select, connect, disconnect } = useWallet();
  const { setVisible } = useWalletModal();

  const [mounted, setMounted] = useState(false);
  const [connectIntent, setConnectIntent] = useState(false);
  const [error, setError] = useState('');
  const [debugOpen, setDebugOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const leoWallet = useMemo(() => wallets.find((w) => w.adapter.name === LEO_DISPLAY_NAME) ?? null, [wallets]);
  const selectedWalletName = wallet?.adapter?.name ?? 'None';
  const leoReadyState = leoWallet?.readyState ?? WalletReadyState.NotDetected;

  const extensionDetected = useMemo(() => {
    if (!mounted) return false;
    return leoReadyState === WalletReadyState.Installed || !!window.leoWallet || !!window.leo;
  }, [mounted, leoReadyState]);

  const accountLabel = useMemo(() => {
    if (!publicKey) return 'No account connected';
    return `${publicKey.slice(0, 12)}...${publicKey.slice(-8)}`;
  }, [publicKey]);

  const performConnect = async () => {
    setError('');
    try {
      setVisible(true);
      await connect(DecryptPermission.UponRequest, APP_NETWORK);
    } catch (e) {
      const resolved = getActionableErrorMessage(e);
      if (!/retrying with leo wallet selected/i.test(resolved)) {
        setError(resolved);
      }
    } finally {
      setConnectIntent(false);
    }
  };

  useEffect(() => {
    if (!connectIntent) return;
    if (!leoWallet) return;
    if (!wallet || wallet.adapter.name !== leoWallet.adapter.name) return;
    void performConnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectIntent, wallet, leoWallet]);

  const openInstall = () => {
    setError('Leo wallet extension not detected. Install Leo, unlock it, then reload this page.');
    const win = window.open(LEO_INSTALL_URL, '_blank', 'noopener,noreferrer');
    if (!win) {
      setError('Could not open Leo install page (popup blocked). Please open https://leo.app/ manually.');
    }
  };

  const handleOpenWallet = async () => {
    setError('');

    if (connected) {
      try {
        await disconnect();
      } catch (e) {
        setError(getActionableErrorMessage(e));
      }
      return;
    }

    if (!extensionDetected) {
      openInstall();
      return;
    }

    if (!leoWallet) {
      setError('Leo wallet adapter not available in app. Reinstall dependencies and restart the app.');
      return;
    }

    if (!wallet || wallet.adapter.name !== leoWallet.adapter.name) {
      setConnectIntent(true);
      select(leoWallet.adapter.name);
      setVisible(true);
      return;
    }

    await performConnect();
  };

  const cta = connected ? 'Disconnect' : connecting ? 'Connecting...' : 'Connect Leo Wallet';

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <div className="text-[11px] text-white/50 text-right hidden sm:block">
          <div>{APP_NETWORK}</div>
          <div className="font-mono">{accountLabel}</div>
        </div>

        {!connected && !extensionDetected && (
          <a
            href={LEO_INSTALL_URL}
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

        {SHOW_WALLET_DEBUG && (
          <button
            onClick={() => setDebugOpen((v) => !v)}
            className="px-2 py-1 rounded-md text-[11px] border border-white/20 text-white/70"
            type="button"
          >
            {debugOpen ? 'Hide debug' : 'Debug'}
          </button>
        )}
      </div>

      {error ? <span className="text-[11px] text-rose-300 max-w-[340px] text-right">{error}</span> : null}

      {SHOW_WALLET_DEBUG && debugOpen && (
        <div className="w-[360px] max-w-[90vw] rounded-lg border border-white/10 bg-zinc-900/95 p-3 text-[11px] text-white/80 space-y-1">
          <div>
            <span className="text-white/50">Extension detected:</span> {String(extensionDetected)}
          </div>
          <div>
            <span className="text-white/50">Leo ready state:</span> {leoReadyState}
          </div>
          <div>
            <span className="text-white/50">Selected wallet:</span> {selectedWalletName}
          </div>
          <div>
            <span className="text-white/50">Connected:</span> {String(connected)}
          </div>
          <div>
            <span className="text-white/50">Public key:</span> {publicKey ?? 'None'}
          </div>
        </div>
      )}
    </div>
  );
}
