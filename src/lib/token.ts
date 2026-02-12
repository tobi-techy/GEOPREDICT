export const TOKEN = {
  symbol: 'CRED',
  name: 'GeoCredit',
  decimals: 6,
} as const;

export const DEMO_BALANCE_UNITS = 2_500 * 10 ** TOKEN.decimals;

export function toTokenUnits(value: string | number): number {
  const normalized = typeof value === 'number' ? value.toString() : value.trim();
  if (!normalized) return 0;

  const [whole, frac = ''] = normalized.split('.');
  const safeWhole = Number(whole || '0');
  const fracPadded = Number((frac + '0'.repeat(TOKEN.decimals)).slice(0, TOKEN.decimals) || '0');
  return safeWhole * 10 ** TOKEN.decimals + fracPadded;
}

export function fromTokenUnits(units: number): number {
  return Number(units) / 10 ** TOKEN.decimals;
}

export function formatToken(amount: number, compact = false): string {
  const n = Number.isFinite(amount) ? amount : 0;
  const formatted = compact
    ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, notation: 'compact' }).format(n)
    : new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  return `${formatted} ${TOKEN.symbol}`;
}
