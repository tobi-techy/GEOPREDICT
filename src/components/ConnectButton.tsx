'use client';

import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { WalletMultiButton } from '@demox-labs/aleo-wallet-adapter-reactui';

export default function ConnectButton() {
  const { publicKey } = useWallet();

  return (
    <div className="flex items-center gap-3">
      {publicKey && (
        <span className="text-[13px] text-white/40 font-mono">
          {publicKey.slice(0, 6)}...{publicKey.slice(-4)}
        </span>
      )}
      <WalletMultiButton 
        style={{
          backgroundColor: publicKey ? 'rgba(255,255,255,0.05)' : 'white',
          color: publicKey ? 'rgba(255,255,255,0.7)' : '#18181b',
          borderRadius: '9999px',
          fontSize: '13px',
          fontWeight: 600,
          padding: '5px 20px',
          border: publicKey ? '1px solid rgba(255,255,255,0.08)' : 'none',
          // height: 'auto',
        }}
      />
    </div>
  );
}
