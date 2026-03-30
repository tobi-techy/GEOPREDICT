'use client';

import { PrivyProvider as Privy } from '@privy-io/react-auth';
import { sepolia, arbitrumSepolia, baseSepolia } from '@privy-io/chains';
import type { ReactNode } from 'react';

export default function PrivyProvider({ children }: { children: ReactNode }) {
  return (
    <Privy
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        loginMethods: ['google', 'email', 'wallet'],
        appearance: {
          theme: 'dark',
          accentColor: '#10b981',
        },
        defaultChain: sepolia,
        supportedChains: [sepolia, arbitrumSepolia, baseSepolia],
        embeddedWallets: {
          ethereum: { createOnLogin: 'users-without-wallets' },
        },
      }}
    >
      {children}
    </Privy>
  );
}
