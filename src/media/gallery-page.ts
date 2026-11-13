export function clampGalleryLimit(
  raw: string | number | null | undefined,
): number {
  if (raw === null || raw === undefined || raw === "") return 20;
  const n = typeof raw === "number" ? raw : parseInt(raw, 10);
  if (Number.isNaN(n) || !Number.isFinite(n)) return 20;
  return Math.min(Math.max(n, 1), 100);
}

export function pickGalleryPage<T extends { meta_id: string }>(input: {
  limit: number;
  scanLimit: number;
  scannedCount: number;
  lastScannedMetaId: string | null;
  surviving: readonly T[];
}): { items: T[]; nextCursor: string | null } {
  const items = input.surviving.slice(0, input.limit);
  let nextCursor: string | null = null;
  if (
    input.surviving.length >= input.limit &&
    input.scannedCount > items.length &&
    items.length > 0
  ) {
    nextCursor = items[items.length - 1].meta_id;
  } else if (
    input.scannedCount >= input.scanLimit &&
    items.length < input.limit
  ) {
    nextCursor = input.lastScannedMetaId;
  }
  return { items, nextCursor };
}
