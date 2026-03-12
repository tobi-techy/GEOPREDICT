'use client';

export default function HowItWorksModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-lg rounded-3xl border border-white/[0.1] bg-zinc-900 p-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-white/40 hover:text-white/80 text-xl">✕</button>
        <h2 className="text-[20px] font-semibold text-white mb-1">How GeoPredict Works</h2>
        <p className="text-[13px] text-white/45 mb-6">Privacy-preserving prediction markets on Aleo</p>

        <div className="space-y-5">
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-[13px] font-bold shrink-0">1</div>
            <div>
              <p className="text-[14px] font-medium text-white">Discover markets on the map</p>
              <p className="text-[12px] text-white/50 mt-1">300+ live markets from Polymarket & Manifold, geolocated and clustered on an interactive world map.</p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-[13px] font-bold shrink-0">2</div>
            <div>
              <p className="text-[14px] font-medium text-white">Bet privately with ZK proofs</p>
              <p className="text-[12px] text-white/50 mt-1">Your position (Yes/No), stake amount, and bet record are <span className="text-emerald-400">private Aleo records</span> — invisible to other participants. Only aggregate pool totals are public.</p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-[13px] font-bold shrink-0">3</div>
            <div>
              <p className="text-[14px] font-medium text-white">Parimutuel payouts</p>
              <p className="text-[12px] text-white/50 mt-1">Winners split the losers' pool proportionally: <code className="text-emerald-300 bg-white/[0.05] px-1 rounded">payout = stake + (stake ÷ winner_pool) × loser_pool</code></p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-[13px] font-bold shrink-0">4</div>
            <div>
              <p className="text-[14px] font-medium text-white">Claim winnings privately</p>
              <p className="text-[12px] text-white/50 mt-1">Your private <code className="text-emerald-300 bg-white/[0.05] px-1 rounded">Bet</code> record is the proof. A random nonce prevents linking your claim to your bet on-chain.</p>
            </div>
          </div>
        </div>

        <div className="mt-6 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
          <p className="text-[11px] font-medium text-white/40 uppercase tracking-wider mb-2">Privacy model</p>
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <div>
              <p className="text-emerald-400 font-medium mb-1">🔒 Private (ZK)</p>
              <p className="text-white/50">Your position (Yes/No)</p>
              <p className="text-white/50">Stake amount</p>
              <p className="text-white/50">Bet record ownership</p>
              <p className="text-white/50">Claim nonce</p>
            </div>
            <div>
              <p className="text-white/60 font-medium mb-1">🌐 Public (on-chain)</p>
              <p className="text-white/50">Market ID</p>
              <p className="text-white/50">Pool totals (Yes/No)</p>
              <p className="text-white/50">Market outcome</p>
            </div>
          </div>
        </div>

        <a
          href="https://api.explorer.provable.com/v1/testnet/program/geopredict_private_v3.aleo"
          target="_blank"
          rel="noreferrer"
          className="mt-4 block text-center text-[12px] text-emerald-400/70 hover:text-emerald-400 underline underline-offset-2"
        >
          View contract on Aleo Explorer →
        </a>
      </div>
    </div>
  );
}
