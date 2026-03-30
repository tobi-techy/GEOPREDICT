'use client';

import { usePrivy } from '@privy-io/react-auth';

export default function ConnectButton() {
  const { ready, authenticated, login, logout, user } = usePrivy();

  if (!ready) return null;

  if (!authenticated) {
    return (
      <button
        onClick={login}
        className="px-4 py-2 rounded-full bg-emerald-500 hover:bg-emerald-400 text-[13px] font-medium text-white transition-all"
      >
        Sign In
      </button>
    );
  }

  const display = user?.google?.name
    || user?.email?.address?.split('@')[0]
    || user?.wallet?.address?.slice(0, 6) + '...' + user?.wallet?.address?.slice(-4)
    || 'Connected';

  return (
    <div className="flex items-center gap-2">
      <span className="text-[12px] text-white/60 hidden sm:block">{display}</span>
      <button
        onClick={logout}
        className="px-3 py-1.5 rounded-full border border-white/[0.12] bg-white/[0.05] hover:bg-white/[0.08] text-[12px] text-white/70 transition-all"
      >
        Sign Out
      </button>
    </div>
  );
}
