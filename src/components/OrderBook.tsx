'use client';

interface OrderBookProps {
  yesProbability: number; // 0-1
  totalYes: number;
  totalNo: number;
}

function generateDepth(midPrice: number, side: 'yes' | 'no', seed: number): { price: number; shares: number; total: number }[] {
  const rows: { price: number; shares: number; total: number }[] = [];
  let cumulative = 0;
  for (let i = 0; i < 10; i++) {
    const offset = (i + 1);
    const price = side === 'yes'
      ? Math.max(1, Math.round(midPrice * 100) - offset)
      : Math.min(99, Math.round((1 - midPrice) * 100) + offset);
    const shares = Math.round(((seed * (i + 3)) % 500) + 10 + (10 - i) * 50);
    cumulative += shares;
    rows.push({ price, shares, total: Math.round(shares * price) / 100 });
  }
  return rows;
}

export default function OrderBook({ yesProbability, totalYes, totalNo }: OrderBookProps) {
  const seed = Math.round((totalYes + totalNo + yesProbability) * 1000) + 42;
  const yesPrice = Math.round(yesProbability * 100);
  const noPrice = 100 - yesPrice;
  const yesRows = generateDepth(yesProbability, 'yes', seed);
  const noRows = generateDepth(yesProbability, 'no', seed + 7);
  const maxShares = Math.max(...yesRows.map(r => r.shares), ...noRows.map(r => r.shares), 1);

  return (
    <div className="flex flex-col h-full text-[11px]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
        <span className="text-white/60 font-semibold text-[12px]">ORDER BOOK</span>
        <div className="flex gap-2 text-[10px]">
          <span className="text-emerald-400">Yes</span>
          <span className="text-white/20">|</span>
          <span className="text-rose-400">No</span>
        </div>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-3 px-3 py-1.5 text-white/25 text-[10px] uppercase tracking-wider border-b border-white/[0.04]">
        <span>Price</span>
        <span className="text-right">Shares</span>
        <span className="text-right">Total</span>
      </div>

      {/* Spread */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.02] border-b border-white/[0.04]">
        <span className="text-white/30 text-[10px]">Last Traded</span>
        <span className="text-emerald-400 font-semibold">▲ {yesPrice}¢</span>
      </div>

      {/* Yes side (bids - green) */}
      <div className="flex-1 overflow-y-auto">
        {yesRows.map((row, i) => (
          <div key={`y${i}`} className="relative grid grid-cols-3 px-3 py-[3px] hover:bg-white/[0.03]">
            <div
              className="absolute inset-y-0 left-0 bg-emerald-500/8"
              style={{ width: `${(row.shares / maxShares) * 100}%` }}
            />
            <span className="relative text-emerald-400 font-medium">{row.price}¢</span>
            <span className="relative text-right text-white/50">{row.shares.toLocaleString()}</span>
            <span className="relative text-right text-white/35">${row.total.toLocaleString()}</span>
          </div>
        ))}
      </div>

      {/* Divider */}
      <div className="px-3 py-1 border-y border-white/[0.06] bg-white/[0.02]">
        <div className="flex justify-between text-[10px]">
          <span className="text-white/25">Spread</span>
          <span className="text-white/40">1¢</span>
        </div>
      </div>

      {/* No side (asks - red) */}
      <div className="flex-1 overflow-y-auto">
        {noRows.map((row, i) => (
          <div key={`n${i}`} className="relative grid grid-cols-3 px-3 py-[3px] hover:bg-white/[0.03]">
            <div
              className="absolute inset-y-0 left-0 bg-rose-500/8"
              style={{ width: `${(row.shares / maxShares) * 100}%` }}
            />
            <span className="relative text-rose-400 font-medium">{row.price}¢</span>
            <span className="relative text-right text-white/50">{row.shares.toLocaleString()}</span>
            <span className="relative text-right text-white/35">${row.total.toLocaleString()}</span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-white/[0.06] flex justify-between text-[10px] text-white/25">
        <span>Ask {noPrice}%</span>
        <div className="flex gap-1">
          <span className="inline-block w-8 h-1.5 rounded-full bg-rose-500/40" />
          <span className="inline-block w-12 h-1.5 rounded-full bg-emerald-500/40" />
        </div>
        <span>{yesPrice}% Bid</span>
      </div>
    </div>
  );
}
