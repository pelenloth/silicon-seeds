export function galleryEtag(
  params: { type?: string; cursor?: string; limit: number },
  items: readonly { meta_id: string }[],
): string {
  const first = items[0];
  const last = items[items.length - 1];
  return `"g:${params.type ?? "all"}:${params.cursor ?? ""}:${params.limit}:${items.length}:${first?.meta_id ?? ""}:${last?.meta_id ?? ""}"`;
}
