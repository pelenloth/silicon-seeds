import { spawn } from "bun";
import { Utils } from "../utils/utils";
import { Logger } from "../logger/logger";
import { comfyClient } from "../comfyui/comfyui-client";
import { LLM } from "../llm/llm";
import { Chroma } from "../chroma/chroma";
import z from "zod/v3";

// This is sort of like a utils directory
export namespace Metadata {
  // TODO delete these
  export const FPS = 16;
  export const CLIP_DURATION = 5;
  export const TRANSITION_DURATION = 3;

  export const INSTRUMENTAL_MODEL = "stable-audio-3";
  export const TIMEOUT = 60;
  export const clientId = Bun.randomUUIDv7();

  export function randomId() {
    return Bun.randomUUIDv7();
  }

  type AssetMeta = {
    id: string;
    job_id: string;
    created_at?: string;
    filename: string;
    filetype: "image" | "video" | "unknown";
    resolution?: string;
    prompt: string;
    model?: string;
    style?: string;
    fps?: number;
    duration?: number;
  };

  export async function save({
    id,
    job_id,
    created_at,
    filename,
    filetype,
    resolution,
    prompt,
    model,
    style,
    fps,
    duration,
  }: AssetMeta) {
    const contentDir = Bun.env.CONTENT_LIBRARY_DIR;
    Utils.assert(contentDir, "OUTPUT_DIR environment variable is not set");

    const assRes = await getAsset(id);
    Utils.assert(assRes, "Failed to retrieve generated image for video prompt");

    const { buffer, filename: fileName } = assRes;
    const base64 = Buffer.from(buffer).toString("base64");
    const image = await LLM.client.files.prepareImageBase64(fileName, base64);

    const res = await LLM.message("Generate a description for this image.", [
      image,
    ]);

    Utils.assert(res?.content, "Failed to generate image description");
    const description = res.content;

    const [titleRes, tagsRes] = await Promise.all([
      LLM.message(
        `Generate a 5-10 word long title for the given image description: ${description}`,
      ),
      LLM.structured(
        `Generate 3-5 metatags based on this image description: ${description}`,
        z.array(z.string()).min(1).max(5),
      ),
    ]);

    const title = titleRes?.content;
    const tags = tagsRes?.parsed;

    const metaJson = {
      job_id,
      created_at,
      filename,
      filetype,
      resolution,
      title,
      description,
      tags,
      prompt,
      model,
      style,
      fps,
      duration,
    };

    await Bun.write(
      `${contentDir}/${filetype}/.${filename.split(".")[0]}.metadata.json`,
      JSON.stringify(metaJson),
    );

    try {
      await Chroma.saveEmbedding({
        id: filename.split(".")[0],
        title: title ?? "",
        description: description ?? "",
        tags: tags ?? [],
        prompt,
        filename,
        filetype,
        resolution,
        style,
      });
    } catch (e) {
      Logger.error("Chroma embedding failed — metadata saved without vector", {
        filename,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  export async function getAsset(promptId: string) {
    const res = await comfyClient.getImageOutput(promptId);
    if (res === null) {
      Logger.info("Failed to fetch image location for video prompt");
      return null;
    }

    const { filename, subfolder, kind } = res;
    const img = await comfyClient.getAsset(filename, subfolder, kind);
    const buffer = await img.arrayBuffer();

    return { buffer, filename };
  }

  export async function getMediaDurationFromPath(filePath: string) {
    const ffprobeProcess = spawn([
      "ffprobe",
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_format",
      filePath,
    ]);

    const decoder = new TextDecoder();
    let output = "";
    for await (const chunk of ffprobeProcess.stdout) {
      if (typeof chunk === "string") {
        output += chunk;
      } else {
        output += decoder.decode(chunk);
      }
    }

    const status = await ffprobeProcess.exited;

    if (status !== 0) {
      throw new Error("Failed to execute 'ffprobe'");
    }

    try {
      const json = JSON.parse(output);
      const duration = Number(json.format.duration);

      if (!Number.isFinite(duration) || duration <= 0) {
        throw new Error("Invalid media duration");
      }

      return duration;
    } catch (error) {
      Logger.error("Failed to parse audio metadata", { error });
      throw new Error("Failed to parse audio metadata");
    }
  }

  export async function getAudioDuration(blob: Blob) {
    const tempFile = `/tmp/audio-${Date.now()}.mp3`;
    await Bun.write(tempFile, await blob.arrayBuffer());

    try {
      const duration = await getMediaDurationFromPath(tempFile);
      return Math.max(1, Math.ceil(duration));
    } finally {
      await Bun.file(tempFile).delete();
    }
  }
}
