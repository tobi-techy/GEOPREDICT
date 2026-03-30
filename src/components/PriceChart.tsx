'use client';

import { useEffect, useRef, useState } from 'react';
import CandlestickChart from 'react-candlestick-chart';

interface PriceChartProps {
  probability: number;
  marketId: string;
  clobTokenId?: string;
}

type Candle = { date: string; open: number; high: number; low: number; close: number };

function generateCandles(currentProb: number, seed: string): Candle[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash << 5) - hash + seed.charCodeAt(i);
  const candles: Candle[] = [];
  const now = new Date();
  let price = Math.max(5, Math.min(95, currentProb * 100 + ((hash % 30) - 15)));
  for (let i = 90; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const open = Math.max(1, Math.min(99, price));
    const drift = (currentProb * 100 - price) * 0.08;
    const noise = (((hash * (30 - i + 1)) % 1000) / 1000 - 0.5) * 4;
    const close = Math.max(1, Math.min(99, price + drift + noise));
    const wick = Math.abs(noise) * 0.4;
    candles.push({
      date: d.toISOString().split('T')[0],
      open: +open.toFixed(2),
      high: +Math.min(99, Math.max(open, close) + wick).toFixed(2),
      low: +Math.max(1, Math.min(open, close) - wick).toFixed(2),
      close: +close.toFixed(2),
    });
    price = close;
  }
  if (candles.length) candles[candles.length - 1].close = +(currentProb * 100).toFixed(2);
  return candles;
}

async function fetchRealHistory(clobTokenId: string): Promise<Candle[] | null> {
  try {
    const res = await fetch(`https://clob.polymarket.com/prices-history?market=${clobTokenId}&interval=1m&fidelity=60`);
    if (!res.ok) return null;
    const data = await res.json() as { history?: { t: number; p: number }[] };
    const pts = data.history;
    if (!pts || pts.length < 2) return null;

    const days = new Map<string, number[]>();
    for (const pt of pts) {
      const date = new Date(pt.t * 1000).toISOString().split('T')[0];
      if (!days.has(date)) days.set(date, []);
      days.get(date)!.push(pt.p * 100);
    }

    return Array.from(days.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, prices]) => ({
        date,
        open: +prices[0].toFixed(2),
        high: +Math.max(...prices).toFixed(2),
        low: +Math.min(...prices).toFixed(2),
        close: +prices[prices.length - 1].toFixed(2),
      }));
  } catch {
    return null;
  }
}

export default function PriceChart({ probability, marketId, clobTokenId }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<Candle[]>([]);
  const [isReal, setIsReal] = useState(false);
  const [size, setSize] = useState({ w: 600, h: 400 });

  useEffect(() => {
    setData(generateCandles(probability, marketId));
    if (clobTokenId) {
      fetchRealHistory(clobTokenId).then(real => {
        if (real && real.length >= 2) { setData(real); setIsReal(true); }
      });
    }
  }, [probability, marketId, clobTokenId]);

  useEffect(() => {
    if (!containerRef.current) return;
    const update = () => {
      if (containerRef.current) {
        setSize({ w: containerRef.current.clientWidth, h: containerRef.current.clientHeight });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="relative w-full h-full">
      {data.length > 0 && size.w > 0 && (
        <CandlestickChart
          data={data}
          id={`chart-${marketId}`}
          width={size.w}
          height={size.h}
          decimal={1}
          scrollZoom={{ enable: true, max: 10 }}
          rangeSelector={{ enable: false, height: 0, initialRange: { type: 'month', value: 1 } }}
          ColorPalette={{
            background: '#0b0d10',
            grid: 'rgba(255,255,255,0.04)',
            tick: 'rgba(255,255,255,0.35)',
            greenCandle: '#10b981',
            redCandle: '#ef4444',
            selectorLine: 'rgba(255,255,255,0.15)',
            selectorLabelBackground: '#1a1d21',
            selectorLabelText: '#ffffff',
          }}
        />
      )}
      <div className="absolute bottom-2 left-2 flex items-center gap-1">
        <span className={`w-1.5 h-1.5 rounded-full ${isReal ? 'bg-emerald-400' : 'bg-white/20'}`} />
        <span className="text-[9px] text-white/25">{isReal ? 'Live Polymarket data' : 'Simulated'}</span>
      </div>
    </div>
  );
}
