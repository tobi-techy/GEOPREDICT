export type TrackingMode = 'privacy' | 'reliability';

export const TRACKING_MODE_STORAGE_KEY = 'geopredict_tracking_mode_v1';
export const TRACKING_MODE_EVENT = 'geopredict:tracking-mode-changed';
export const PENDING_TX_STORAGE_KEY = 'geopredict_pending_txs_v1';
export const PENDING_TX_EVENT = 'geopredict:pending-transactions-changed';

export interface WalletStatusLike {
  status: string;
  transactionId?: string;
  error?: string;
  txId?: string;
  id?: string;
}

export interface WalletHistoryLike {
  transactions: Array<{ id: string; transactionId: string }>;
}

export interface PendingTransaction {
  walletTxId: string;
  explorerTxId?: string;
  status: 'pending' | 'confirmed' | 'failed';
  program: string;
  functionName: string;
  kind: 'bet' | 'claim' | 'other';
  marketId?: string;
  createdAt: number;
  updatedAt: number;
  error?: string;
}

export class RelayPendingError extends Error {
  walletTxId: string;

  constructor(walletTxId: string) {
    super(`Wallet returned temporary tx id (${walletTxId}) but on-chain tx id is still pending.`);
    this.walletTxId = walletTxId;
  }
}

function hasWindow(): boolean {
  return typeof window !== 'undefined';
}

export function readTrackingMode(): TrackingMode {
  if (!hasWindow()) return 'privacy';
  const value = window.localStorage.getItem(TRACKING_MODE_STORAGE_KEY);
  return value === 'reliability' ? 'reliability' : 'privacy';
}

export function setTrackingMode(mode: TrackingMode): void {
  if (!hasWindow()) return;
  window.localStorage.setItem(TRACKING_MODE_STORAGE_KEY, mode);
  window.dispatchEvent(new CustomEvent(TRACKING_MODE_EVENT, { detail: mode }));
}

export function readPendingTransactions(): PendingTransaction[] {
  if (!hasWindow()) return [];
  try {
    const raw = window.localStorage.getItem(PENDING_TX_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingTransaction[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePendingTransactions(items: PendingTransaction[]): void {
  if (!hasWindow()) return;
  window.localStorage.setItem(PENDING_TX_STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(PENDING_TX_EVENT));
}

export function upsertPendingTransaction(tx: PendingTransaction): void {
  const current = readPendingTransactions();
  const idx = current.findIndex((item) => item.walletTxId === tx.walletTxId);
  if (idx >= 0) {
    current[idx] = { ...current[idx], ...tx, updatedAt: Date.now() };
  } else {
    current.unshift({ ...tx, updatedAt: Date.now() });
  }
  writePendingTransactions(current.slice(0, 200));
}

export function markPendingTransactionConfirmed(walletTxId: string, explorerTxId: string): void {
  const current = readPendingTransactions();
  const next = current.map((item) =>
    item.walletTxId === walletTxId
      ? {
          ...item,
          status: 'confirmed' as const,
          explorerTxId,
          updatedAt: Date.now(),
          error: undefined,
        }
      : item,
  );
  writePendingTransactions(next);
}

export function markPendingTransactionFailed(walletTxId: string, error: string): void {
  const current = readPendingTransactions();
  const next = current.map((item) =>
    item.walletTxId === walletTxId
      ? {
          ...item,
          status: 'failed' as const,
          updatedAt: Date.now(),
          error,
        }
      : item,
  );
  writePendingTransactions(next);
}

export function countPendingTransactions(): number {
  return readPendingTransactions().filter((item) => item.status === 'pending').length;
}

async function explorerHasTx(aleoApi: string, txId: string): Promise<boolean> {
  try {
    const res = await fetch(`${aleoApi}/transaction/${txId}`);
    return res.ok;
  } catch {
    return false;
  }
}

function normalizeStatus(status: string | undefined): string {
  return String(status ?? '').trim().toLowerCase();
}

function extractExplorerTxId(status: WalletStatusLike): string | undefined {
  const candidate = status.transactionId ?? status.txId ?? status.id;
  if (!candidate) return undefined;
  return String(candidate);
}

function isIgnorableHistoryError(message: string): boolean {
  return /permission|not implemented|unsupported|requesttransactionhistory|uponrequest|onchain history/i.test(
    message,
  );
}

export async function resolveOnchainTransactionId(params: {
  walletTxId: string;
  aleoApi: string;
  transactionStatus: (walletTxId: string) => Promise<WalletStatusLike>;
  useHistory: boolean;
  historyProgram?: string;
  requestTransactionHistory?: (program: string) => Promise<WalletHistoryLike>;
  maxAttempts?: number;
  intervalMs?: number;
  onExplorerTxId?: (txId: string) => void;
}): Promise<string> {
  const {
    walletTxId,
    aleoApi,
    transactionStatus,
    useHistory,
    historyProgram,
    requestTransactionHistory,
    maxAttempts = 90,
    intervalMs = 2_000,
    onExplorerTxId,
  } = params;

  let candidate = walletTxId;

  for (let i = 0; i < maxAttempts; i += 1) {
    if (candidate.startsWith('at') && (await explorerHasTx(aleoApi, candidate))) {
      return candidate;
    }

    try {
      const status = await transactionStatus(walletTxId);
      const normalized = normalizeStatus(status.status);

      const explorerTxId = extractExplorerTxId(status);
      if (explorerTxId) {
        candidate = explorerTxId;
        onExplorerTxId?.(candidate);
      }
      if (status.error) throw new Error(status.error);

      if (normalized === 'failed' || normalized === 'rejected') {
        throw new Error(`Transaction ${normalized}${status.error ? `: ${status.error}` : ''}`);
      }

      if (candidate.startsWith('at') && (await explorerHasTx(aleoApi, candidate))) {
        return candidate;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (!/not found|pending|timeout|unknown/i.test(message)) throw error;
    }

    if (useHistory && historyProgram && requestTransactionHistory) {
      try {
        const history = await requestTransactionHistory(historyProgram);
        const row = history.transactions.find(
          (item) => item.id === walletTxId || item.transactionId === walletTxId,
        );
        if (row?.transactionId?.startsWith('at')) {
          candidate = row.transactionId;
          onExplorerTxId?.(candidate);
          if (await explorerHasTx(aleoApi, candidate)) return candidate;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message.toLowerCase() : '';
        if (!isIgnorableHistoryError(message)) throw error;
      }
    }

    if (intervalMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  if (candidate.startsWith('at') && (await explorerHasTx(aleoApi, candidate))) {
    return candidate;
  }
  throw new RelayPendingError(walletTxId);
}
