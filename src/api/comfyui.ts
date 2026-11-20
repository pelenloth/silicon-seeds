import { Hono } from "hono";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { MINIMAX_H3_WEIGHTS } from "../comfyui/minimax-h3-workflows";

const app = new Hono();

async function listLorasFromComfy(): Promise<string[]> {
  const base = Bun.env.COMFYUI_BASE_URL;
  if (!base) return [];
  const candidates = [
    `${base}/api/models/loras`,
    `${base}/models/loras`,
    `${base}/api/experiment/models/loras`,
    `${base}/api/loras`,
    `${base}/loras`,
  ];
  for (const url of candidates) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data: any = await res.json();
      if (Array.isArray(data)) {
        // /api/models/loras returns string[] , experiment returns objects with name/filename
        const names = data
          .map((d: any) => {
            if (typeof d === "string") return d;
            return d.name ?? d.filename ?? d.path ?? "";
          })
          .filter(Boolean)
          .map((n: string) => n.split("/").pop() ?? n);
        if (names.length) return names;
      }
      if (
        data &&
        typeof data === "object" &&
        Array.isArray((data as any).loras)
      )
        return (data as any).loras;
    } catch {}
  }
  return [];
}

app.get("/loras", async (c) => {
  try {
    const loras = await listLorasFromComfy();
    return c.json({ loras });
  } catch (e) {
    return c.json({ error: String(e) }, 502);
  }
});

// ComfyUI model subfolders a MiniMax H3 weight may live in, by weight key.
const MINIMAX_H3_WEIGHT_DIRS: Record<
  keyof typeof MINIMAX_H3_WEIGHTS,
  string[]
> = {
  textEncoder: ["text_encoders", "clip"],
  videoVae: ["vae"],
  audioVae: ["vae"],
  fl2vaUnet: ["diffusion_models", "unet"],
  ref2vaUnet: ["diffusion_models", "unet"],
  fastH3Unet: ["diffusion_models", "unet"],
  fl2vTurbo8Lora: ["loras"],
  fl2vTurbo4Lora: ["loras"],
  ref2vTurbo4Lora: ["loras"],
};

// Mirrors resolveDefaultComfyDir in scripts/setup-minimax-h3.ts.
function comfyUiDir(): string {
  const comfyDir = Bun.env.COMFYUI_DIR?.trim();
  if (comfyDir) return comfyDir;
  const inputDir = Bun.env.INPUT_DIR?.trim();
  if (inputDir) return dirname(inputDir.replace(/\/+$/, ""));
  return "/run/media/dennis/ai/comfy-ui";
}

app.get("/minimax-h3/status", (c) => {
  const modelsDir = join(comfyUiDir(), "models");
  const installed: Record<string, boolean> = {};
  const missing: string[] = [];
  for (const [key, filename] of Object.entries(MINIMAX_H3_WEIGHTS) as [
    keyof typeof MINIMAX_H3_WEIGHTS,
    string,
  ][]) {
    const found = MINIMAX_H3_WEIGHT_DIRS[key].some((sub) =>
      existsSync(join(modelsDir, sub, filename)),
    );
    installed[filename] = found;
    if (!found) missing.push(filename);
  }
  return c.json({ ready: missing.length === 0, installed, missing });
});

export default app;
