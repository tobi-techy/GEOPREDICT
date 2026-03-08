'use client';

interface PrivacyIndicatorProps {
  context: 'bet' | 'claim';
  position?: 1 | 2;
  amount?: number;
}

export default function PrivacyIndicator({ context, position, amount }: PrivacyIndicatorProps) {
  return (
    <div className="rounded-xl bg-gradient-to-r from-emerald-500/5 to-sky-500/5 border border-emerald-500/20 px-3 py-2">
      <div className="flex items-center gap-4 text-[11px]">
        <span className="text-emerald-400 flex items-center gap-1">🛡️ <span className="font-medium">ZK Private:</span></span>
        {context === 'bet' ? (
          <span className="text-white/60">
            Position {position ? (position === 1 ? '(Yes)' : '(No)') : ''} · Amount{amount ? ` (${amount})` : ''} · Bet record
          </span>
        ) : (
          <span className="text-white/60">Bet record · Claim nonce · Payout</span>
        )}
      </div>
    </div>
  );
}
