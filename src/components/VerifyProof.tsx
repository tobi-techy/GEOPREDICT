'use client';

import { useState } from 'react';
import { ALEO_API, DEPLOYED_PROGRAM } from '@/lib/markets';

type ExplorerTransition = {
  id?: string;
  program?: string;
  function?: string;
};

function getTransitions(tx: unknown): ExplorerTransition[] {
  if (!tx || typeof tx !== 'object') return [];
  const root = tx as Record<string, unknown>;

  const direct = (root.execution as { transitions?: unknown[] } | undefined)?.transitions;
  if (Array.isArray(direct)) return direct as ExplorerTransition[];

  const nestedTx = root.transaction as Record<string, unknown> | undefined;
  const nested = (nestedTx?.execution as { transitions?: unknown[] } | undefined)?.transitions;
  if (Array.isArray(nested)) return nested as ExplorerTransition[];

  const confirmed = root.confirmed_transaction as Record<string, unknown> | undefined;
  const confirmedTx = confirmed?.transaction as Record<string, unknown> | undefined;
  const deepNested = (confirmedTx?.execution as { transitions?: unknown[] } | undefined)?.transitions;
  if (Array.isArray(deepNested)) return deepNested as ExplorerTransition[];

  return [];
}

export default function VerifyProof() {
  const [claimTxId, setClaimTxId] = useState('');
  const [status, setStatus] = useState<'idle' | 'verifying' | 'valid' | 'invalid' | 'error'>('idle');
  const [detail, setDetail] = useState('');

  const handleVerify = async () => {
    const txId = claimTxId.trim();
    if (!txId) return;

    setStatus('verifying');
    setDetail('');

    try {
      const res = await fetch(`${ALEO_API}/transaction/${txId}`);
      if (!res.ok) {
        setStatus('invalid');
        setDetail('Transaction not found on Aleo testnet.');
        return;
      }

      const tx: unknown = await res.json();
      const transitions = getTransitions(tx);
      const claimTransition = transitions.find(
        (transition) =>
          transition.program === DEPLOYED_PROGRAM &&
          transition.function === 'claim_winnings',
      );
      const isClaimTx = Boolean(claimTransition);

      if (!isClaimTx) {
        setStatus('invalid');
        setDetail('Transaction exists but is not a GeoPredict winnings claim.');
        return;
      }

      setStatus('valid');
      setDetail(`Valid GeoPredict claim transition on-chain${claimTransition?.id ? ` (${claimTransition.id})` : ''}.`);
    } catch {
      setStatus('error');
      setDetail('Verification failed due to a network error.');
    }
  };

  return (
    <div className="bg-zinc-900/90 backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6">
      <h3 className="text-[15px] font-semibold text-white mb-1">Verify Winner</h3>
      <p className="text-[13px] text-white/40 mb-4">Verify a claim transaction ID directly on Aleo testnet.</p>
      
      <input
        type="text"
        value={claimTxId}
        onChange={(e) => { setClaimTxId(e.target.value); setStatus('idle'); setDetail(''); }}
        placeholder="Enter claim transaction ID (at...)"
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
              <p className="text-[13px] text-emerald-400 font-medium">Valid Claim</p>
              <p className="text-[12px] text-white/40">{detail}</p>
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
              <p className="text-[13px] text-rose-400 font-medium">Invalid Claim</p>
              <p className="text-[12px] text-white/40">{detail || 'Claim verification failed.'}</p>
            </div>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="mt-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-amber-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M6 20h12a2 2 0 001.73-3l-6-10a2 2 0 00-3.46 0l-6 10A2 2 0 006 20z" /></svg>
            </div>
            <div>
              <p className="text-[13px] text-amber-200 font-medium">Verification Error</p>
              <p className="text-[12px] text-white/40">{detail}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
