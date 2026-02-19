const PREFERRED_RECORD_KEYS = [
  'plaintext',
  'recordPlaintext',
  'record',
  'value',
  'data',
  'rawRecord',
  'recordValue',
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function looksLikeRecord(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('record1')) return true;
  return (
    trimmed.includes('owner:') &&
    (
      trimmed.includes('amount:') ||
      trimmed.includes('microcredits:') ||
      trimmed.includes('market_id:') ||
      trimmed.includes('position:')
    )
  );
}

export function extractRecordPlaintext(candidate: unknown): string | null {
  const queue: unknown[] = [candidate];
  const seen = new Set<unknown>();
  let traversed = 0;

  while (queue.length > 0 && traversed < 128) {
    const current = queue.shift();
    traversed += 1;
    if (current === undefined || current === null || seen.has(current)) continue;
    seen.add(current);

    if (typeof current === 'string') {
      if (looksLikeRecord(current)) return current.trim();
      continue;
    }

    if (!isObject(current)) continue;
    for (const key of PREFERRED_RECORD_KEYS) {
      if (key in current) queue.push(current[key]);
    }
    for (const value of Object.values(current)) {
      queue.push(value);
    }
  }

  return null;
}

function matchU64Field(record: string, fieldName: string): number | null {
  const rx = new RegExp(`${fieldName}:\\s*(\\d+)u64`, 'i');
  const m = record.match(rx);
  if (!m) return null;
  const amount = Number(m[1]);
  return Number.isFinite(amount) ? amount : null;
}

function matchU8Field(record: string, fieldName: string): number | null {
  const rx = new RegExp(`${fieldName}:\\s*(\\d+)u8`, 'i');
  const m = record.match(rx);
  if (!m) return null;
  const value = Number(m[1]);
  return Number.isFinite(value) ? value : null;
}

function matchField(record: string, fieldName: string): string | null {
  const rx = new RegExp(`${fieldName}:\\s*([a-z0-9]+field)`, 'i');
  const m = record.match(rx);
  return m?.[1] ?? null;
}

export function extractRecordAmountMicrocredits(record: string): number | null {
  return matchU64Field(record, 'amount') ?? matchU64Field(record, 'microcredits');
}

export function pickCreditsRecord(
  records: unknown[],
  requiredAmountMicrocredits: number,
): string | null {
  const normalized = records
    .map((entry) => {
      const record = extractRecordPlaintext(entry);
      if (!record) return null;
      return {
        record,
        amount: extractRecordAmountMicrocredits(record),
      };
    })
    .filter((entry): entry is { record: string; amount: number | null } => entry !== null);

  const sufficient = normalized
    .filter((entry): entry is { record: string; amount: number } => entry.amount !== null && entry.amount >= requiredAmountMicrocredits)
    .sort((a, b) => a.amount - b.amount);
  if (sufficient.length > 0) return sufficient[0].record;

  const unknownAmount = normalized.find((entry) => entry.amount === null);
  if (unknownAmount) return unknownAmount.record;

  return null;
}

export function pickBetRecord(
  records: unknown[],
  marketId: string,
  winningPosition: 1 | 2,
): string | null {
  const normalized = records
    .map((entry) => {
      const record = extractRecordPlaintext(entry);
      if (!record) return null;
      return {
        record,
        marketId: matchField(record, 'market_id'),
        position: matchU8Field(record, 'position'),
      };
    })
    .filter((entry): entry is { record: string; marketId: string | null; position: number | null } => entry !== null);

  const exact = normalized.find(
    (entry) => entry.marketId === marketId && entry.position === winningPosition,
  );
  if (exact) return exact.record;

  const hasTaggedRecords = normalized.some((entry) => entry.marketId !== null || entry.position !== null);
  if (hasTaggedRecords) return null;

  return normalized[0]?.record ?? null;
}
