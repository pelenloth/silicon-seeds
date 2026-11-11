export const INSTRUMENTAL_TAG = "[instrumental]";

export function resolveLyrics(input: string | null | undefined): string {
  const trimmed = input?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : INSTRUMENTAL_TAG;
}
