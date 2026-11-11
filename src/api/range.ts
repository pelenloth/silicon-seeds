export type ByteRange = { start: number; end: number };

export function parseRange(
  header: string | null | undefined,
  size: number,
): ByteRange | "unsatisfiable" | null {
  if (!header) return null;
  const cleaned = header.replace(/\s+/g, "");
  const match = cleaned.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;
  const [, startStr, endStr] = match;
  if (startStr === "" && endStr === "") return null;

  if (startStr === "") {
    const n = parseInt(endStr, 10);
    if (n === 0 || size === 0) return "unsatisfiable";
    return { start: Math.max(0, size - n), end: size - 1 };
  }

  const start = parseInt(startStr, 10);
  const end =
    endStr === "" ? size - 1 : Math.min(parseInt(endStr, 10), size - 1);
  if (start >= size || start > end) return "unsatisfiable";
  return { start, end };
}
