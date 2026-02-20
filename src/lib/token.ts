// Aleo credits: 1 credit = 1_000_000 microcredits
export const TOKEN = {
  symbol: 'Credits',
  name: 'Aleo Credits',
  decimals: 6,
} as const;

export function toMicrocredits(value: string | number): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return 0;
    return Math.floor(value * 10 ** TOKEN.decimals);
  }

  const normalized = value.trim();
  if (!normalized) return 0;
  if (!/^\d+(\.\d+)?$/.test(normalized)) return 0;

  const [whole, frac = ''] = normalized.split('.');
  const safeWhole = Number(whole || '0');
  if (!Number.isFinite(safeWhole)) return 0;
  const fracPadded = Number((frac + '0'.repeat(TOKEN.decimals)).slice(0, TOKEN.decimals) || '0');
  if (!Number.isFinite(fracPadded)) return 0;
  return safeWhole * 10 ** TOKEN.decimals + fracPadded;
}

export function fromMicrocredits(units: number): number {
  return Number(units) / 10 ** TOKEN.decimals;
}

export function formatToken(amount: number, compact = false): string {
  const n = Number.isFinite(amount) ? amount : 0;
  const formatted = compact
    ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, notation: 'compact' }).format(n)
    : new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  return `${formatted} ${TOKEN.symbol}`;
}
