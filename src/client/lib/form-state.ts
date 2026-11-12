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

export function draftOf(
  values: Readonly<Record<string, string>>,
  touched: ReadonlySet<string>,
  opts?: {
    lorasTouched?: boolean;
    loras?: readonly { name: string; strength: number }[];
  },
): Record<string, string> {
  const sparse: Record<string, string> = {};
  for (const k of touched) {
    if (Object.hasOwn(values, k)) {
      sparse[k] = values[k];
    }
  }
  if (opts?.lorasTouched && opts.loras && opts.loras.length > 0) {
    sparse.loras = JSON.stringify(opts.loras);
  }
  return sparse;
}

export function createDraftTracker(opts: {
  route: string;
  allowedKeys: Iterable<string>;
  storage?: StorageLike;
  draft?: Record<string, string | undefined> | null;
  prefill?: Record<string, string | undefined> | null;
  query?: Record<string, string | undefined> | null;
}) {
  const allowed = new Set(opts.allowedKeys);
  const touched = new Set<string>();
  const provided = new Set<string>();

  if (opts.draft) {
    for (const [k, v] of Object.entries(opts.draft)) {
      if (typeof v === "string" && allowed.has(k)) {
        touched.add(k);
      }
    }
  }
  for (const layer of [opts.prefill, opts.query]) {
    if (!layer) continue;
    for (const [k, v] of Object.entries(layer)) {
      if (typeof v === "string" && allowed.has(k)) {
        provided.add(k);
        touched.add(k);
      }
    }
  }

  let lorasTouched = Boolean(
    opts.prefill?.loras !== undefined || opts.draft?.loras,
  );

  return {
    touched,
    provided,
    touch(field: string) {
      if (allowed.has(field)) {
        touched.add(field);
      }
    },
    touchLoras(hasLoras: boolean) {
      lorasTouched = hasLoras;
    },
    isUntouched(field: string): boolean {
      return !provided.has(field) && !touched.has(field);
    },
    draftOf(
      values: Readonly<Record<string, string>>,
      loras?: readonly { name: string; strength: number }[],
    ): Record<string, string> {
      return draftOf(values, touched, { lorasTouched, loras });
    },
    persist(
      values: Readonly<Record<string, string>>,
      loras?: readonly { name: string; strength: number }[],
    ): void {
      const sparse = draftOf(values, touched, { lorasTouched, loras });
      if (Object.keys(sparse).length === 0) {
        clearDraft(opts.route, opts.storage);
      } else {
        saveDraft(opts.route, sparse, opts.storage);
      }
    },
    reset(): void {
      touched.clear();
      provided.clear();
      lorasTouched = false;
      clearDraft(opts.route, opts.storage);
    },
  };
}
