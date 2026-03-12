'use client';

import { ALEO_API } from '@/lib/markets';

const VERIFIED_TXS = [
  { label: 'place_bet', id: 'at1qvj6rmkw89texp2aew4wupa0hvxmzyqewd690h95ugf2ux54zqqqfuzww4' },
  { label: 'resolve_market', id: 'at1ptdm833gfvunew6dz03vee32k7j2j2kznttqx6z6pfu3dzwdeyzsw5qcy9' },
  { label: 'claim_winnings', id: 'at1msaetrj5dur4fn7kv8tzex9fw5nxust53w8xdrcz4uqelyprkgyq4h0uan' },
];

export default function RecentActivity() {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
      <p className="text-[11px] font-medium text-white/40 uppercase tracking-wider mb-3">⛓ Verified On-Chain Activity</p>
      <div className="space-y-2">
        {VERIFIED_TXS.map((tx) => (
          <a
            key={tx.id}
            href={`${ALEO_API}/transaction/${tx.id}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-all group"
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              <span className="text-[12px] font-medium text-white/70 group-hover:text-white/90">{tx.label}</span>
            </div>
            <span className="text-[11px] text-white/30 font-mono group-hover:text-emerald-400/70 truncate max-w-[180px]">
              {tx.id.slice(0, 12)}…{tx.id.slice(-6)}
            </span>
          </a>
        ))}
      </div>
      <p className="text-[10px] text-white/25 mt-2">Click any transaction to verify on Aleo Explorer</p>
    </div>
  );
}
