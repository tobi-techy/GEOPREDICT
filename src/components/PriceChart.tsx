'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, type IChartApi, ColorType, LineStyle } from 'lightweight-charts';

interface PriceChartProps {
  probability: number;
  marketId: string;
  clobTokenId?: string;
}

type Candle = { time: string; open: number; high: number; low: number; close: number };

function generateCandles(currentProb: number, seed: string): Candle[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash << 5) - hash + seed.charCodeAt(i);
  const candles: Candle[] = [];
  const now = new Date();
  let price = Math.max(5, Math.min(95, currentProb * 100 + ((hash % 30) - 15)));
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const open = Math.max(1, Math.min(99, price));
    const drift = (currentProb * 100 - price) * 0.08;
    const noise = (((hash * (30 - i + 1)) % 1000) / 1000 - 0.5) * 6;
    const close = Math.max(1, Math.min(99, price + drift + noise));
    const wick = Math.abs(noise) * 0.6;
    candles.push({ time: d.toISOString().split('T')[0], open: +open.toFixed(1), high: +Math.min(99, Math.max(open, close) + wick).toFixed(1), low: +Math.max(1, Math.min(open, close) - wick).toFixed(1), close: +close.toFixed(1) });
    price = close;
  }
  if (candles.length) candles[candles.length - 1].close = +(currentProb * 100).toFixed(1);
  return candles;
}

async function fetchRealHistory(clobTokenId: string): Promise<Candle[] | null> {
  try {
    const res = await fetch(`https://clob.polymarket.com/prices-history?market=${clobTokenId}&interval=1m&fidelity=60`);
    if (!res.ok) return null;
    const data = await res.json() as { history?: { t: number; p: number }[] };
    const pts = data.history;
    if (!pts || pts.length < 2) return null;

    // Group into daily candles
    const days = new Map<string, number[]>();
    for (const pt of pts) {
      const date = new Date(pt.t * 1000).toISOString().split('T')[0];
      if (!days.has(date)) days.set(date, []);
      days.get(date)!.push(pt.p * 100);
    }

    return Array.from(days.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, prices]) => ({
        time: date,
        open: +prices[0].toFixed(1),
        high: +Math.max(...prices).toFixed(1),
        low: +Math.min(...prices).toFixed(1),
        close: +prices[prices.length - 1].toFixed(1),
      }));
  } catch {
    return null;
  }
}

export default function PriceChart({ probability, marketId, clobTokenId }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [isReal, setIsReal] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: 'rgba(255,255,255,0.35)', fontSize: 11 },
      grid: { vertLines: { color: 'rgba(255,255,255,0.04)' }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
      crosshair: {
        vertLine: { color: 'rgba(255,255,255,0.15)', style: LineStyle.Dashed, width: 1, labelBackgroundColor: '#1a1d21' },
        horzLine: { color: 'rgba(255,255,255,0.15)', style: LineStyle.Dashed, width: 1, labelBackgroundColor: '#1a1d21' },
      },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.06)', scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { borderColor: 'rgba(255,255,255,0.06)', timeVisible: false },
      handleScroll: false,
      handleScale: false,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981', downColor: '#ef4444',
      borderUpColor: '#10b981', borderDownColor: '#ef4444',
      wickUpColor: '#10b981', wickDownColor: '#ef4444',
      priceFormat: { type: 'custom', formatter: (p: number) => `${p.toFixed(1)}¢` },
    });

    // Start with simulated data immediately
    const simulated = generateCandles(probability, marketId);
    series.setData(simulated as Parameters<typeof series.setData>[0]);
    series.createPriceLine({ price: +(probability * 100).toFixed(1), color: 'rgba(16,185,129,0.5)', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true });
    chart.timeScale().fitContent();
    chartRef.current = chart;

    // Then replace with real data if available
    if (clobTokenId) {
      fetchRealHistory(clobTokenId).then(real => {
        if (real && real.length >= 2) {
          series.setData(real as Parameters<typeof series.setData>[0]);
          chart.timeScale().fitContent();
          setIsReal(true);
        }
      });
    }

    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
    });
    ro.observe(containerRef.current);
    return () => { ro.disconnect(); chart.remove(); };
  }, [probability, marketId, clobTokenId]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute bottom-2 left-2 flex items-center gap-1">
        <span className={`w-1.5 h-1.5 rounded-full ${isReal ? 'bg-emerald-400' : 'bg-white/20'}`} />
        <span className="text-[9px] text-white/25">{isReal ? 'Live Polymarket data' : 'Simulated'}</span>
      </div>
    </div>
  );
}
