'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export interface PoolSnapshot {
  t: number;   // unix ms
  yes: number; // microcredits
  no: number;
}

const STORAGE_KEY = 'geopredict_pool_history_v1';
const MAX_SNAPSHOTS = 100;

function loadHistory(marketId: string): PoolSnapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const all = raw ? JSON.parse(raw) : {};
    return Array.isArray(all[marketId]) ? all[marketId] : [];
  } catch { return []; }
}

function saveSnapshot(marketId: string, snap: PoolSnapshot) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const all = raw ? JSON.parse(raw) : {};
    const history: PoolSnapshot[] = Array.isArray(all[marketId]) ? all[marketId] : [];
    const last = history[history.length - 1];
    // only save if pool changed
    if (last && last.yes === snap.yes && last.no === snap.no) return;
    history.push(snap);
    if (history.length > MAX_SNAPSHOTS) history.splice(0, history.length - MAX_SNAPSHOTS);
    all[marketId] = history;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {}
}

function formatTime(t: number): string {
  const d = new Date(t);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

interface Props {
  marketId: string;
  totalYes: number;
  totalNo: number;
}

export default function PoolChart({ marketId, totalYes, totalNo }: Props) {
  const [history, setHistory] = useState<PoolSnapshot[]>([]);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const snap: PoolSnapshot = { t: Date.now(), yes: totalYes, no: totalNo };
    saveSnapshot(marketId, snap);
    setHistory(loadHistory(marketId));
  }, [marketId, totalYes, totalNo]);

  const points = useMemo(() => {
    if (history.length < 2) return null;
    return history.map((s) => {
      const total = s.yes + s.no;
      return { t: s.t, yesPct: total > 0 ? (s.yes / total) * 100 : 50, yes: s.yes, no: s.no };
    });
  }, [history]);

  const W = 320, H = 100, PAD = { t: 8, r: 8, b: 20, l: 32 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;

  const svgPath = useMemo(() => {
    if (!points || points.length < 2) return '';
    const minT = points[0].t, maxT = points[points.length - 1].t;
    const tRange = maxT - minT || 1;
    const coords = points.map((p, i) => {
      const x = PAD.l + (i === points.length - 1 ? innerW : ((p.t - minT) / tRange) * innerW);
      const y = PAD.t + innerH - (p.yesPct / 100) * innerH;
      return [x, y] as [number, number];
    });
    // smooth line with cubic bezier
    return coords.reduce((acc, [x, y], i) => {
      if (i === 0) return `M ${x} ${y}`;
      const [px, py] = coords[i - 1];
      const cpx = (px + x) / 2;
      return `${acc} C ${cpx} ${py}, ${cpx} ${y}, ${x} ${y}`;
    }, '');
  }, [points, innerW, innerH]);

  const areaPath = svgPath
    ? `${svgPath} L ${PAD.l + innerW} ${PAD.t + innerH} L ${PAD.l} ${PAD.t + innerH} Z`
    : '';

  const hoverPoint = hoverIdx !== null && points ? points[hoverIdx] : null;

  const getHoverX = (idx: number) => {
    if (!points) return 0;
    const minT = points[0].t, maxT = points[points.length - 1].t;
    const tRange = maxT - minT || 1;
    return idx === points.length - 1
      ? PAD.l + innerW
      : PAD.l + ((points[idx].t - minT) / tRange) * innerW;
  };

  const getHoverY = (idx: number) => {
    if (!points) return 0;
    return PAD.t + innerH - (points[idx].yesPct / 100) * innerH;
  };

  const total = totalYes + totalNo;
  const yesPct = total > 0 ? Math.round((totalYes / total) * 100) : 0;
  const noPct = 100 - yesPct;

  return (
    <div className="mt-5 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-medium text-white/40 uppercase tracking-wider">⛓ On-chain Pool</p>
        <div className="flex gap-3 text-[12px]">
          <span className="text-emerald-400">Yes {yesPct}%</span>
          <span className="text-rose-400">No {noPct}%</span>
        </div>
      </div>

      {/* stacked bar */}
      <div className="h-2 rounded-full overflow-hidden bg-white/[0.06] flex mb-4">
        <div className="bg-emerald-500 h-full transition-all duration-500" style={{ width: `${yesPct}%` }} />
        <div className="bg-rose-500 h-full transition-all duration-500" style={{ width: `${noPct}%` }} />
      </div>

      <div className="flex gap-4 text-[12px] mb-4">
        <div className="flex-1 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
          <p className="text-white/40 text-[10px] uppercase tracking-wider">Yes pool</p>
          <p className="text-emerald-400 font-medium mt-0.5">{(totalYes / 1_000_000).toFixed(4)} ALEO</p>
        </div>
        <div className="flex-1 rounded-xl bg-rose-500/10 border border-rose-500/20 px-3 py-2">
          <p className="text-white/40 text-[10px] uppercase tracking-wider">No pool</p>
          <p className="text-rose-400 font-medium mt-0.5">{(totalNo / 1_000_000).toFixed(4)} ALEO</p>
        </div>
      </div>

      {/* line chart */}
      {points && points.length >= 2 ? (
        <div className="relative">
          <p className="text-[10px] text-white/25 mb-1">Yes % over time (on-chain snapshots)</p>
          <svg
            ref={svgRef}
            width={W} height={H}
            viewBox={`0 0 ${W} ${H}`}
            className="w-full overflow-visible"
            onMouseLeave={() => setHoverIdx(null)}
            onMouseMove={(e) => {
              if (!points || !svgRef.current) return;
              const rect = svgRef.current.getBoundingClientRect();
              const mx = ((e.clientX - rect.left) / rect.width) * W;
              const minT = points[0].t, maxT = points[points.length - 1].t;
              const tRange = maxT - minT || 1;
              let closest = 0, minDist = Infinity;
              points.forEach((p, i) => {
                const x = i === points.length - 1 ? PAD.l + innerW : PAD.l + ((p.t - minT) / tRange) * innerW;
                const d = Math.abs(x - mx);
                if (d < minDist) { minDist = d; closest = i; }
              });
              setHoverIdx(closest);
            }}
          >
            <defs>
              <linearGradient id="yesGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* y-axis labels */}
            {[0, 50, 100].map((v) => (
              <text key={v} x={PAD.l - 4} y={PAD.t + innerH - (v / 100) * innerH + 4}
                textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.25)">{v}%</text>
            ))}
            {/* grid lines */}
            {[25, 50, 75].map((v) => (
              <line key={v}
                x1={PAD.l} y1={PAD.t + innerH - (v / 100) * innerH}
                x2={PAD.l + innerW} y2={PAD.t + innerH - (v / 100) * innerH}
                stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
            ))}
            {/* 50% reference */}
            <line x1={PAD.l} y1={PAD.t + innerH * 0.5} x2={PAD.l + innerW} y2={PAD.t + innerH * 0.5}
              stroke="rgba(255,255,255,0.1)" strokeWidth="1" strokeDasharray="3,3" />
            {/* area fill */}
            <path d={areaPath} fill="url(#yesGrad)" />
            {/* line */}
            <path d={svgPath} fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            {/* hover */}
            {hoverIdx !== null && (
              <>
                <line x1={getHoverX(hoverIdx)} y1={PAD.t} x2={getHoverX(hoverIdx)} y2={PAD.t + innerH}
                  stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
                <circle cx={getHoverX(hoverIdx)} cy={getHoverY(hoverIdx)} r="4"
                  fill="#10b981" stroke="#000" strokeWidth="1.5" />
              </>
            )}
          </svg>
          {hoverPoint && (
            <div className="mt-1 text-[10px] text-white/50">
              {formatTime(hoverPoint.t)} · Yes {Math.round(hoverPoint.yesPct)}% · {(hoverPoint.yes / 1_000_000).toFixed(4)} / {((hoverPoint.yes + hoverPoint.no) / 1_000_000).toFixed(4)} ALEO
            </div>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-white/25 text-center py-3">Chart builds as bets come in</p>
      )}
    </div>
  );
}
