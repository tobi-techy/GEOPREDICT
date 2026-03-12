'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { type Market, formatAmount } from '@/lib/markets';
import { extractRecordPlaintext } from '@/lib/aleoRecords';

interface BetEntry {
  marketId: string;
  position: 1 | 2;
  amount: number;
  question: string;
  outcome: number;
  totalYes: number;
  totalNo: number;
}

function parseBetRecords(records: unknown[], markets: Market[]): BetEntry[] {
  const entries: BetEntry[] = [];
  for (const rec of records) {
    const plaintext = extractRecordPlaintext(rec);
    if (!plaintext) continue;
    const midMatch = plaintext.match(/market_id:\s*(\d+)field/i);
    const posMatch = plaintext.match(/position:\s*(\d+)u8/i);
    const amtMatch = plaintext.match(/amount:\s*(\d+)u64/i);
    if (!midMatch || !posMatch || !amtMatch) continue;
    const marketId = `${midMatch[1]}field`;
    const position = parseInt(posMatch[1]) as 1 | 2;
    const amount = parseInt(amtMatch[1]);
    const market = markets.find((m) => m.fieldId === marketId || m.id === marketId);
    if (!market) continue;
    entries.push({ marketId, position, amount, question: market.question, outcome: market.outcome, totalYes: market.totalYes, totalNo: market.totalNo });
  }
  return entries;
}

export default function YourBets({ markets }: { markets: Market[] }) {
  const { connected, requestRecords } = useWallet();
  const [bets, setBets] = useState<BetEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!connected || !requestRecords) return;
    setLoading(true);
    requestRecords('geopredict_private_v3.aleo')
      .then((records) => setBets(parseBetRecords(records as unknown[], markets)))
      .catch(() => setBets([]))
      .finally(() => setLoading(false));
  }, [connected, requestRecords, markets]);

  if (!connected) return null;

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
      <p className="text-[11px] font-medium text-white/40 uppercase tracking-wider mb-3">🎯 Your Bets</p>
      {loading && <p className="text-[12px] text-white/35">Scanning wallet records…</p>}
      {!loading && bets.length === 0 && (
        <p className="text-[12px] text-white/35">No bet records found in wallet.</p>
      )}
      {bets.map((bet, i) => {
        const isWinner = bet.outcome !== 0 && bet.outcome === bet.position;
        const isLoser = bet.outcome !== 0 && bet.outcome !== bet.position;
        const winnerPool = bet.position === 1 ? bet.totalYes : bet.totalNo;
        const loserPool = bet.position === 1 ? bet.totalNo : bet.totalYes;
        const estPayout = winnerPool > 0
          ? bet.amount + Math.floor((bet.amount * loserPool) / winnerPool)
          : bet.amount;
        return (
          <div key={i} className="mb-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
            <p className="text-[12px] text-white/80 leading-snug line-clamp-2">{bet.question}</p>
            <div className="mt-1.5 flex items-center gap-3 text-[11px]">
              <span className={bet.position === 1 ? 'text-emerald-400' : 'text-rose-400'}>
                {bet.position === 1 ? 'Yes' : 'No'} · {formatAmount(bet.amount)}
              </span>
              {bet.outcome === 0 ? (
                <span className="text-white/35">Est. payout: {formatAmount(estPayout)}</span>
              ) : isWinner ? (
                <span className="text-amber-400">🏆 Won · Claim {formatAmount(estPayout)}</span>
              ) : isLoser ? (
                <span className="text-white/35">Lost</span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
