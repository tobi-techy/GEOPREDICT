'use client';

interface PendingTxReconcilerProps {
  onPendingCountChange?: (count: number) => void;
}

// Stubbed — Aleo wallet removed, will be replaced with Fhenix tx tracking
export default function PendingTxReconciler({ onPendingCountChange: _ }: PendingTxReconcilerProps) {
  return null;
}
