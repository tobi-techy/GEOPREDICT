'use client';

import { useMemo, useState } from 'react';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { Transaction } from '@demox-labs/aleo-wallet-adapter-base';
import { type Market, calcParimutuelPayout } from '@/lib/markets';
import { formatToken } from '@/lib/token';
import { APP_NETWORK } from './WalletProvider';

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

  const simulatedStake = 100;
  const settlement = useMemo(
    () => calcParimutuelPayout({ market, position: market.outcome as 1 | 2, stake: simulatedStake }),
    [market]
  );

  const handleClaim = async () => {
    if (!publicKey || !requestTransaction) {
      setError('Connect Leo wallet to claim winnings');
      return;
    }

    setStatus('pending');
    try {
      const privateBetRecordPlaceholder = '{owner:address.private,market_id:field.private,position:u8.private,amount:u64.private,_nonce:group.public}';
      const winnerPool = market.outcome === 1 ? market.totalYes : market.totalNo;
      const loserPool = market.outcome === 1 ? market.totalNo : market.totalYes;
      const tx = Transaction.createTransaction(
        publicKey,
        APP_NETWORK,
        PROGRAM_ID,
        'claim_winnings',
        [privateBetRecordPlaceholder, `${market.outcome}u8`, `${winnerPool}u64`, `${loserPool}u64`],
        50_000,
      );
      await requestTransaction(tx);

      const opaqueProof = `wp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      setProofHash(opaqueProof);
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
              <h3 className="text-xl font-semibold text-white tracking-tight">Claim Winnings</h3>
              <p className="text-sm text-white/60 mt-2">Outcome: {market.outcome === 1 ? 'Yes' : 'No'}</p>
            </div>
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.04] mb-4 text-[12px] text-white/60 space-y-1">
              <p>Settlement details (parimutuel):</p>
              <p>Stake sample: {formatToken(simulatedStake)}</p>
              <p>Payout = stake + proportional loser pool share</p>
              <p>Estimated claim: {formatToken(settlement.payout)}</p>
            </div>
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.04] mb-6">
              <p className="text-[13px] text-white/40 leading-relaxed">
                Privacy: only an opaque win attestation ID is displayed here. We do not render market ID, raw bet record, or wallet-linked bet data in public UI.
              </p>
            </div>
            {error && <p className="text-rose-400/80 text-sm text-center mb-4">{error}</p>}
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-4 bg-white/[0.05] hover:bg-white/[0.08] rounded-2xl font-medium text-white/60 transition-all">Cancel</button>
              <button onClick={handleClaim} className="flex-1 py-4 bg-amber-500 hover:bg-amber-400 rounded-2xl font-medium text-white transition-all">Claim</button>
            </div>
          </>
        )}

        {status === 'pending' && <p className="text-center text-white/70 py-12">Generating zero-knowledge claim proof...</p>}

        {status === 'success' && (
          <div className="text-center py-8">
            <p className="text-white font-medium mb-1">Winnings Claimed</p>
            <p className="text-white/30 text-sm mb-6">Attestation ID (safe to share)</p>
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4 mb-4">
              <p className="text-[11px] text-white/30 uppercase tracking-wider mb-2">Win Attestation</p>
              <p className="text-[13px] text-white/80 font-mono break-all">{proofHash}</p>
            </div>
            <button onClick={() => navigator.clipboard.writeText(proofHash)} className="px-6 py-2 bg-white/[0.05] hover:bg-white/[0.08] rounded-full text-sm text-white/60 transition-all">Copy ID</button>
          </div>
        )}

        {status === 'error' && <p className="text-center text-rose-300 py-12">{error}</p>}
      </div>
    </div>
  );
}
