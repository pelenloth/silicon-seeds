export function galleryEtag(
  params: { type?: string; cursor?: string; limit: number },
  items: readonly { meta_id: string }[],
): string {
  const first = items[0];
  const last = items[items.length - 1];
  const type = encodeURIComponent(params.type ?? "all");
  const cursor = encodeURIComponent(params.cursor ?? "");
  return `"g:${type}:${cursor}:${params.limit}:${items.length}:${first?.meta_id ?? ""}:${last?.meta_id ?? ""}"`;
}
