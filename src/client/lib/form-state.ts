export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function getDefaultStorage(): StorageLike | null {
  try {
    if (typeof sessionStorage !== "undefined") return sessionStorage;
  } catch {}
  return null;
}

function readRecord(
  key: string,
  storage?: StorageLike,
): Record<string, string> | null {
  const s = storage ?? getDefaultStorage();
  if (!s) return null;
  try {
    const raw = s.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return null;
  }
}

function writeRecord(
  key: string,
  values: Record<string, string>,
  storage?: StorageLike,
): void {
  const s = storage ?? getDefaultStorage();
  if (!s) return;
  try {
    s.setItem(key, JSON.stringify(values));
  } catch {}
}

function removeRecord(key: string, storage?: StorageLike): void {
  const s = storage ?? getDefaultStorage();
  if (!s) return;
  try {
    s.removeItem(key);
  } catch {}
}

export function loadDraft(
  route: string,
  storage?: StorageLike,
): Record<string, string> | null {
  return readRecord(`ss:draft:${route}`, storage);
}

export function saveDraft(
  route: string,
  values: Record<string, string>,
  storage?: StorageLike,
): void {
  writeRecord(`ss:draft:${route}`, values, storage);
}

export function clearDraft(route: string, storage?: StorageLike): void {
  removeRecord(`ss:draft:${route}`, storage);
}

export function setPrefill(
  route: string,
  values: Record<string, string>,
  storage?: StorageLike,
): void {
  writeRecord(`ss:prefill:${route}`, values, storage);
}

export function takePrefill(
  route: string,
  storage?: StorageLike,
): Record<string, string> | null {
  const key = `ss:prefill:${route}`;
  const val = readRecord(key, storage);
  removeRecord(key, storage);
  return val;
}

export function mergeInitial<T extends Record<string, string>>(
  fallback: T,
  ...layers: (Record<string, string | undefined> | null | undefined)[]
): T {
  const out: Record<string, string> = { ...fallback };
  const allowedKeys = new Set(Object.keys(fallback));
  for (const layer of layers) {
    if (!layer || typeof layer !== "object") continue;
    for (const [k, v] of Object.entries(layer)) {
      if (allowedKeys.has(k) && typeof v === "string") {
        out[k] = v;
      }
    }
  }
  return out as T;
}

export function resolveInitialValues<T extends Record<string, string>>(opts: {
  base: T;
  defaults?: Record<string, string | undefined> | null;
  draft?: Record<string, string | undefined> | null;
  prefill?: Record<string, string | undefined> | null;
  query?: Record<string, string | undefined> | null;
}): T {
  return mergeInitial(
    opts.base,
    opts.defaults,
    opts.draft,
    opts.prefill,
    opts.query,
  );
}
