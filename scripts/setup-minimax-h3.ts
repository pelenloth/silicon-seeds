import {
  createWriteStream,
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { CANONICAL_MINIMAX_H3_TEMPLATES } from "../src/comfyui/minimax-h3-workflows";
import { MINIMAX_H3_STYLE_EMBEDDINGS } from "../src/shared/video-models";

export type SetupTier = "minimal" | "standard" | "full";

export type SetupOptions = {
  comfyDir: string;
  tier: SetupTier;
  dryRun: boolean;
  skipSamples: boolean;
  skipTemplates: boolean;
  onlyTemplates: boolean;
};

export type AssetManifestEntry = {
  filename: string;
  relDir: string;
  urls: readonly string[];
  minTier: SetupTier;
  isSample?: boolean;
};

const HF_COMFY_H3 = "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main";
const HF_LIGHTX2V =
  "https://huggingface.co/lightx2v/Minimax-h3-Turbo/resolve/main";
const HF_FASTVIDEO =
  "https://huggingface.co/FastVideo/FastVideo-FastH3-Comfy/resolve/main";
const GH_SAMPLES =
  "https://raw.githubusercontent.com/Comfy-Org/workflow_templates/refs/heads/main/input";

const SAMPLE_FILENAMES = [
  "transparent_rgb_gaming_mouse.png",
  "red_superboy_on_city_roof.png",
  "mecha_dragon_lightning.png",
  "h3_frame_ref_1.png",
  "h3_frame_ref_2.png",
  "h3_frame_ref_3.png",
  "h3_frame_ref_4.png",
  "red_line_barrier.png",
] as const;

export const MINIMAX_H3_ASSETS_MANIFEST: readonly AssetManifestEntry[] = [
  {
    filename: "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
    relDir: "models/text_encoders",
    urls: [
      `${HF_COMFY_H3}/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors`,
    ],
    minTier: "minimal",
  },
  {
    filename: "minimax_h3_video_vae_int8_convrot.safetensors",
    relDir: "models/vae",
    urls: [`${HF_COMFY_H3}/vae/minimax_h3_video_vae_int8_convrot.safetensors`],
    minTier: "minimal",
  },
  {
    filename: "minimax_h3_audio_vae_fp32.safetensors",
    relDir: "models/vae",
    urls: [`${HF_COMFY_H3}/vae/minimax_h3_audio_vae_fp32.safetensors`],
    minTier: "minimal",
  },
  {
    filename: "minimax_h3_fl2va_pruned_int8_convrot.safetensors",
    relDir: "models/diffusion_models",
    urls: [
      `${HF_COMFY_H3}/diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors`,
    ],
    minTier: "minimal",
  },
  {
    filename: "minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors",
    relDir: "models/loras",
    urls: [
      `${HF_LIGHTX2V}/minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors`,
      `${HF_COMFY_H3}/loras/minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors`,
    ],
    minTier: "minimal",
  },
  {
    filename: "minimax_h3_ref2va_pruned_int8_convrot.safetensors",
    relDir: "models/diffusion_models",
    urls: [
      `${HF_COMFY_H3}/diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors`,
    ],
    minTier: "standard",
  },
  {
    filename: "minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors",
    relDir: "models/loras",
    urls: [
      `${HF_COMFY_H3}/loras/minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors`,
    ],
    minTier: "standard",
  },
  ...MINIMAX_H3_STYLE_EMBEDDINGS.map((emb): AssetManifestEntry => ({
    filename: emb.filename,
    relDir: "models/embeddings",
    urls: [`${HF_COMFY_H3}/embeddings/${emb.filename}`],
    minTier: "standard",
  })),
  {
    filename: "minimax_h3_fl2v_turbo_4step_v1.0_768p_comfyui_bf16.safetensors",
    relDir: "models/loras",
    urls: [
      `${HF_COMFY_H3}/loras/minimax_h3_fl2v_turbo_4step_v1.0_768p_comfyui_bf16.safetensors`,
    ],
    minTier: "full",
  },
  {
    filename: "fastvideo_fasth3_8step_v2_pruned_int8_convrot.safetensors",
    relDir: "models/diffusion_models",
    urls: [
      `${HF_FASTVIDEO}/diffusion_models/fastvideo_fasth3_8step_v2_pruned_int8_convrot.safetensors`,
    ],
    minTier: "full",
  },
  ...SAMPLE_FILENAMES.map((name): AssetManifestEntry => ({
    filename: name,
    relDir: "input",
    urls: [`${GH_SAMPLES}/${name}`],
    minTier: "minimal",
    isSample: true,
  })),
];

export type FetchImpl = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

const TIER_RANK: Record<SetupTier, number> = {
  minimal: 1,
  standard: 2,
  full: 3,
};

export function resolveDefaultComfyDir(): string {
  if (Bun.env.COMFYUI_DIR && Bun.env.COMFYUI_DIR.trim()) {
    return Bun.env.COMFYUI_DIR.trim();
  }
  if (Bun.env.INPUT_DIR && Bun.env.INPUT_DIR.trim()) {
    return dirname(Bun.env.INPUT_DIR.trim().replace(/\/+$/, ""));
  }
  return "/run/media/dennis/ai/comfy-ui";
}

export function parseSetupArgs(argv: readonly string[]): SetupOptions {
  let comfyDir = resolveDefaultComfyDir();
  let tier: SetupTier = "standard";
  let dryRun = false;
  let skipSamples = false;
  let skipTemplates = false;
  let onlyTemplates = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--comfy-dir" && argv[i + 1]) {
      comfyDir = argv[++i];
    } else if (arg === "--tier" && argv[i + 1]) {
      const next = argv[++i];
      if (next === "minimal" || next === "standard" || next === "full") {
        tier = next;
      } else {
        throw new Error(`Invalid --tier value: ${next}`);
      }
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--skip-samples") {
      skipSamples = true;
    } else if (arg === "--skip-templates") {
      skipTemplates = true;
    } else if (arg === "--only-templates") {
      onlyTemplates = true;
    }
  }

  return {
    comfyDir,
    tier,
    dryRun,
    skipSamples,
    skipTemplates,
    onlyTemplates,
  };
}

export function selectManifestEntries(opts: {
  tier: SetupTier;
  skipSamples: boolean;
}): AssetManifestEntry[] {
  const maxRank = TIER_RANK[opts.tier];
  return MINIMAX_H3_ASSETS_MANIFEST.filter((entry) => {
    if (entry.isSample && opts.skipSamples) return false;
    return TIER_RANK[entry.minTier] <= maxRank;
  });
}

async function downloadWithFallback(
  urls: readonly string[],
  destPath: string,
  fetchImpl: FetchImpl,
): Promise<void> {
  mkdirSync(dirname(destPath), { recursive: true });
  const partPath = `${destPath}.part`;
  const headers: Record<string, string> = {};
  if (Bun.env.HF_TOKEN && Bun.env.HF_TOKEN.trim()) {
    headers.Authorization = `Bearer ${Bun.env.HF_TOKEN.trim()}`;
  }

  let lastErr: Error | null = null;
  for (const url of urls) {
    try {
      const res = await fetchImpl(url, { headers, redirect: "follow" });
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status} for ${url}`);
        continue;
      }
      if (res.body) {
        const nodeReadable = Readable.fromWeb(
          res.body as unknown as import("node:stream/web").ReadableStream,
        );
        await pipeline(nodeReadable, createWriteStream(partPath));
      } else {
        const buf = await res.arrayBuffer();
        await Bun.write(partPath, buf);
      }
      renameSync(partPath, destPath);
      return;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastErr ?? new Error(`Failed to download ${destPath}`);
}

export type SetupSummary = {
  downloadedWeights: string[];
  skippedWeights: string[];
  installedTemplates: string[];
};

export async function runSetupMiniMaxH3(
  options: SetupOptions,
  deps?: {
    fetchImpl?: FetchImpl;
    log?: (msg: string) => void;
  },
): Promise<SetupSummary> {
  const fetchImpl = deps?.fetchImpl ?? fetch;
  const log = deps?.log ?? ((msg: string) => process.stdout.write(`${msg}\n`));

  const downloadedWeights: string[] = [];
  const skippedWeights: string[] = [];
  const installedTemplates: string[] = [];

  if (!options.onlyTemplates) {
    const entries = selectManifestEntries({
      tier: options.tier,
      skipSamples: options.skipSamples,
    });

    for (const entry of entries) {
      const targetPath = join(options.comfyDir, entry.relDir, entry.filename);
      if (existsSync(targetPath) && statSync(targetPath).size > 0) {
        log(`[skip] ${entry.relDir}/${entry.filename} (already exists)`);
        skippedWeights.push(entry.filename);
        continue;
      }

      if (options.dryRun) {
        log(`[dry-run] download ${entry.urls[0]} -> ${targetPath}`);
        downloadedWeights.push(entry.filename);
        continue;
      }

      log(`[download] ${entry.filename} -> ${entry.relDir}/`);
      await downloadWithFallback(entry.urls, targetPath, fetchImpl);
      downloadedWeights.push(entry.filename);
    }
  }

  if (!options.skipTemplates) {
    const wfDir = join(options.comfyDir, "user", "default", "workflows");
    if (!options.dryRun) {
      mkdirSync(wfDir, { recursive: true });
    }
    for (const tpl of CANONICAL_MINIMAX_H3_TEMPLATES) {
      const outName = tpl.filename.replace(
        /^video_minimax_h3_/,
        "silicon_seeds_minimax_h3_",
      );
      const outPath = join(wfDir, outName);
      if (options.dryRun) {
        log(`[dry-run] install template -> ${outPath}`);
      } else {
        await Bun.write(outPath, `${JSON.stringify(tpl.ui, null, 2)}\n`);
        log(`[template] installed ${outName}`);
      }
      installedTemplates.push(outName);
    }
  }

  return { downloadedWeights, skippedWeights, installedTemplates };
}

if (import.meta.main) {
  const opts = parseSetupArgs(process.argv.slice(2));
  await runSetupMiniMaxH3(opts);
}
