function hashNames(items: readonly { job_name?: string | null }[]): string {
  let h = 2166136261;
  for (const item of items) {
    const s = item.job_name ?? "";
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h ^= 0xff;
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function galleryEtag(
  params: { type?: string; cursor?: string; limit: number },
  items: readonly { meta_id: string; job_name?: string | null }[],
  nextCursor?: string | null,
): string {
  const first = items[0];
  const last = items[items.length - 1];
  const type = encodeURIComponent(params.type ?? "all");
  const cursor = encodeURIComponent(params.cursor ?? "");
  const names = hashNames(items);
  const nextPart =
    nextCursor === undefined ? "" : `:${encodeURIComponent(nextCursor ?? "")}`;
  return `"g:${type}:${cursor}:${params.limit}:${items.length}:${first?.meta_id ?? ""}:${last?.meta_id ?? ""}:${names}${nextPart}"`;
}
