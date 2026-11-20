import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MINIMAX_H3_ASSETS_MANIFEST,
  parseSetupArgs,
  runSetupMiniMaxH3,
  selectManifestEntries,
} from "./setup-minimax-h3";

const tempDirs: string[] = [];
function makeTmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "h3-setup-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("setup-minimax-h3", () => {
  test("parses CLI flags accurately", () => {
    const opts = parseSetupArgs([
      "--comfy-dir",
      "/tmp/comfy",
      "--tier",
      "minimal",
      "--dry-run",
      "--skip-samples",
    ]);
    expect(opts).toEqual({
      comfyDir: "/tmp/comfy",
      tier: "minimal",
      dryRun: true,
      skipSamples: true,
      skipTemplates: false,
      onlyTemplates: false,
    });
  });

  test("defaults to the full tier so every weight the status check needs installs", () => {
    expect(parseSetupArgs(["--comfy-dir", "/tmp/comfy"]).tier).toBe("full");
  });

  test("selectManifestEntries filters minimal vs standard vs full tiers accurately", () => {
    const minimal = selectManifestEntries({
      tier: "minimal",
      skipSamples: true,
    });
    const minimalNames = minimal.map((m) => m.filename);
    expect(minimalNames).toContain(
      "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
    );
    expect(minimalNames).toContain(
      "minimax_h3_video_vae_int8_convrot.safetensors",
    );
    expect(minimalNames).toContain("minimax_h3_audio_vae_fp32.safetensors");
    expect(minimalNames).toContain(
      "minimax_h3_fl2va_pruned_int8_convrot.safetensors",
    );
    expect(minimalNames).toContain(
      "minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors",
    );
    expect(minimalNames).not.toContain(
      "minimax_h3_ref2va_pruned_int8_convrot.safetensors",
    );
    expect(minimalNames).not.toContain(
      "fastvideo_fasth3_8step_v2_pruned_int8_convrot.safetensors",
    );

    const standard = selectManifestEntries({
      tier: "standard",
      skipSamples: false,
    });
    const standardNames = standard.map((m) => m.filename);
    expect(standardNames).toContain(
      "minimax_h3_ref2va_pruned_int8_convrot.safetensors",
    );
    expect(standardNames).toContain(
      "minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors",
    );
    expect(standardNames).toContain("minimaxh3_bullet_time.safetensors");
    expect(standardNames).toContain("h3_frame_ref_1.png");
    expect(standardNames).not.toContain(
      "fastvideo_fasth3_8step_v2_pruned_int8_convrot.safetensors",
    );

    const full = selectManifestEntries({
      tier: "full",
      skipSamples: false,
    });
    expect(full.length).toBe(MINIMAX_H3_ASSETS_MANIFEST.length);
    expect(full.map((m) => m.filename)).toContain(
      "fastvideo_fasth3_8step_v2_pruned_int8_convrot.safetensors",
    );
  });

  test("installs canonical workflow templates and skips already present non-empty weights", async () => {
    const comfyDir = makeTmpDir();
    const fetchedUrls: string[] = [];

    // Pre-populate one weight so idempotency skip is verified
    const encDir = join(comfyDir, "models", "text_encoders");
    await Bun.write(
      join(encDir, "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors"),
      new Uint8Array([1, 2, 3, 4]),
    );

    const summary = await runSetupMiniMaxH3(
      {
        comfyDir,
        tier: "minimal",
        dryRun: false,
        skipSamples: true,
        skipTemplates: false,
        onlyTemplates: false,
      },
      {
        fetchImpl: async (url) => {
          fetchedUrls.push(String(url));
          return new Response(new Uint8Array([9, 8, 7, 6]), { status: 200 });
        },
        log: () => {},
      },
    );

    expect(summary.skippedWeights).toContain(
      "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
    );
    expect(summary.downloadedWeights).toHaveLength(4);
    expect(summary.installedTemplates).toHaveLength(4);

    // Check workflow template copied to user/default/workflows
    expect(
      existsSync(
        join(
          comfyDir,
          "user",
          "default",
          "workflows",
          "silicon_seeds_minimax_h3_t2v.json",
        ),
      ),
    ).toBe(true);
    // No lingering .part files
    expect(
      existsSync(
        join(
          comfyDir,
          "models",
          "vae",
          "minimax_h3_video_vae_int8_convrot.safetensors.part",
        ),
      ),
    ).toBe(false);
    expect(fetchedUrls.length).toBe(4);
  });

  test("onlyTemplates mode installs templates without downloading any weights", async () => {
    const comfyDir = makeTmpDir();
    writeFileSync(join(comfyDir, "README.md"), "comfy");
    let fetchCalls = 0;

    const summary = await runSetupMiniMaxH3(
      {
        comfyDir,
        tier: "full",
        dryRun: false,
        skipSamples: false,
        skipTemplates: false,
        onlyTemplates: true,
      },
      {
        fetchImpl: async () => {
          fetchCalls += 1;
          return new Response("unexpected", { status: 500 });
        },
        log: () => {},
      },
    );

    expect(fetchCalls).toBe(0);
    expect(summary.installedTemplates).toHaveLength(4);
  });
});
