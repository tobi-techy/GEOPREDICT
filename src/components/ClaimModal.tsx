'use client';

import { useState } from 'react';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { Transaction, WalletAdapterNetwork } from '@demox-labs/aleo-wallet-adapter-base';
import { type Market } from '@/lib/markets';

const PROGRAM_ID = 'geopredict_contract.aleo';

interface ClaimModalProps {
  market: Market;
  onClose: () => void;
}

export default function ClaimModal({ market, onClose }: ClaimModalProps) {
  const { publicKey, requestTransaction } = useWallet();
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [proofHash, setProofHash] = useState('');
  const [error, setError] = useState('');

  const handleClaim = async () => {
    if (!publicKey || !requestTransaction) {
      setError('Connect wallet');
      return;
    }
    setStatus('pending');
    try {
      // In production, this would use the actual bet record from wallet
      // For demo, we simulate the claim_winnings call
      const mockBetRecord = `{owner:${publicKey}.private,market_id:${market.fieldId}.private,position:${market.outcome}u8.private,amount:100u64.private,_nonce:0group.public}`;
      const tx = Transaction.createTransaction(
        publicKey,
        WalletAdapterNetwork.TestnetBeta,
        PROGRAM_ID,
        'claim_winnings',
        [mockBetRecord, `${market.outcome}u8`],
        50000,
      );
      await requestTransaction(tx);
      // Simulate proof hash generation
      setProofHash(`proof_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`);
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-zinc-900/95 backdrop-blur-2xl border border-white/[0.08] rounded-3xl p-8 w-full max-w-sm mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {status === 'idle' && (
          <>
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 bg-amber-500/15">
                <span className="text-2xl">🏆</span>
              </div>
              <h3 className="text-xl font-semibold text-white tracking-tight">Claim Winnings</h3>
              <p className="text-sm text-white/40 mt-2">{market.question}</p>
              <p className="text-sm text-white/60 mt-3">
                Outcome: <span className="font-medium text-white">{market.outcome === 1 ? 'Yes' : 'No'}</span>
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.04] mb-6">
              <p className="text-[13px] text-white/40 leading-relaxed">
                Claiming generates a <span className="text-white/70">WinProof</span> — cryptographic proof you won without revealing your bet amount or which market.
              </p>
            </div>
            {error && <p className="text-rose-400/80 text-sm text-center mb-4">{error}</p>}
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-4 bg-white/[0.05] hover:bg-white/[0.08] rounded-2xl font-medium text-white/60 transition-all">Cancel</button>
              <button onClick={handleClaim} className="flex-1 py-4 bg-amber-500 hover:bg-amber-400 rounded-2xl font-medium text-white transition-all">Claim</button>
            </div>
          </>
        )}
        {status === 'pending' && (
          <div className="text-center py-12">
            <div className="w-10 h-10 border-2 border-white/10 border-t-white/50 rounded-full animate-spin mx-auto mb-6" />
            <p className="text-white/70 font-medium">Generating Proof</p>
            <p className="text-white/30 text-sm mt-1">Confirm in wallet</p>
          </div>
        )}
        {status === 'success' && (
          <div className="text-center py-8">
            <div className="w-14 h-14 bg-emerald-500/15 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            </div>
            <p className="text-white font-medium mb-1">Winnings Claimed</p>
            <p className="text-white/30 text-sm mb-6">Share your proof to verify</p>
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4 mb-4">
              <p className="text-[11px] text-white/30 uppercase tracking-wider mb-2">Proof Hash</p>
              <p className="text-[13px] text-white/80 font-mono break-all">{proofHash}</p>
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(proofHash)}
              className="px-6 py-2 bg-white/[0.05] hover:bg-white/[0.08] rounded-full text-sm text-white/60 transition-all"
            >
              Copy Proof
            </button>
          </div>
        )}
        {status === 'error' && (
          <div className="text-center py-12">
            <div className="w-14 h-14 bg-rose-500/15 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-7 h-7 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </div>
            <p className="text-white font-medium">Failed</p>
            <p className="text-white/30 text-sm mt-1">{error}</p>
            <button onClick={() => setStatus('idle')} className="mt-6 px-6 py-2 bg-white/[0.05] hover:bg-white/[0.08] rounded-full text-sm text-white/60 transition-all">Try Again</button>
          </div>
        )}
      </div>
    </div>
  );
}
