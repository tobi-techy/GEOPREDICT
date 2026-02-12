'use client';

import { useState } from 'react';

export default function VerifyProof() {
  const [proofHash, setProofHash] = useState('');
  const [status, setStatus] = useState<'idle' | 'verifying' | 'valid' | 'invalid'>('idle');

  const handleVerify = () => {
    if (!proofHash.trim()) return;
    setStatus('verifying');
    // Simulate verification delay
    setTimeout(() => {
      // In production, this would verify against on-chain data
      setStatus(proofHash.startsWith('wp_') ? 'valid' : 'invalid');
    }, 1500);
  };

  return (
    <div className="bg-zinc-900/90 backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6">
      <h3 className="text-[15px] font-semibold text-white mb-1">Verify Winner</h3>
      <p className="text-[13px] text-white/40 mb-4">Check if a win attestation ID is valid (reveals no market/bet details)</p>
      
      <input
        type="text"
        value={proofHash}
        onChange={(e) => { setProofHash(e.target.value); setStatus('idle'); }}
        placeholder="Enter proof hash"
        className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3 text-[14px] text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-all mb-3"
      />
      
      <button
        onClick={handleVerify}
        disabled={status === 'verifying'}
        className="w-full py-3 bg-white/[0.05] hover:bg-white/[0.08] rounded-xl font-medium text-white/70 transition-all disabled:opacity-50"
      >
        {status === 'verifying' ? 'Verifying...' : 'Verify'}
      </button>

      {status === 'valid' && (
        <div className="mt-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            </div>
            <div>
              <p className="text-[13px] text-emerald-400 font-medium">Valid Proof</p>
              <p className="text-[12px] text-white/40">This person won a prediction</p>
            </div>
          </div>
        </div>
      )}

      {status === 'invalid' && (
        <div className="mt-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-rose-500/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </div>
            <div>
              <p className="text-[13px] text-rose-400 font-medium">Invalid Proof</p>
              <p className="text-[12px] text-white/40">Proof not found on chain</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
