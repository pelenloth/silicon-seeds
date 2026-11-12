export type PlanKind = "image" | "video" | "audio";

export type Plan = {
  kind: PlanKind;
  prompt: string;
  count: number;
  resolution: string;
  style_preset: string;
  duration_seconds: number;
};
