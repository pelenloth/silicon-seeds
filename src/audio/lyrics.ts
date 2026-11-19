import {
  formatModelLyrics,
  type AudioModelId,
} from "../shared/audio-models";

export const INSTRUMENTAL_TAG = "[instrumental]";

export function resolveLyrics(
  input: string | null | undefined,
  modelId: AudioModelId | string = "ace-step-1.5",
): string {
  return formatModelLyrics(modelId, input);
}
