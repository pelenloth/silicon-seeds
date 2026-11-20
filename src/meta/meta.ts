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
    filetype: "image" | "video" | "audio" | "unknown";
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

    let description: string;
    let title: string | undefined;
    let tags: string[] | undefined;

    const tmpVideo = `/tmp/meta_vid_${id}.mp4`;
    const tmpFrame = `/tmp/meta_frame_${id}.png`;
    try {
      if (filetype === "audio") {
        throw new Error("Vision captioning is not available for audio");
      }

      // Never hand raw .mp4 bytes to the vision model: caption frame 0.
      let visionBytes: ArrayBuffer | Uint8Array = buffer;
      let visionName = fileName;
      if (filetype === "video") {
        visionBytes = await extractFirstFrame(buffer, tmpVideo, tmpFrame);
        visionName = `${fileName.split(".")[0]}_frame0.png`;
      }

      const base64 = Buffer.from(visionBytes).toString("base64");
      const image = await LLM.client.files.prepareImageBase64(
        visionName,
        base64,
      );

      const res = await LLM.message("Generate a description for this image.", [
        image,
      ]);

      Utils.assert(res?.content, "Failed to generate image description");
      description = res.content;

      const [titleRes, tagsRes] = await Promise.all([
        LLM.message(
          `Generate a 5-10 word long title for the given image description: ${description}`,
        ),
        LLM.structured(
          `Generate 3-5 metatags based on this image description: ${description}`,
          z.array(z.string()).min(1).max(5),
        ),
      ]);

      title = titleRes?.content;
      tags = tagsRes?.parsed;
    } catch (e) {
      Logger.warn("Vision captioning failed — using prompt-based metadata", {
        filename,
        error: e instanceof Error ? e.message : String(e),
      });
      description = prompt;
      title =
        prompt.slice(0, 60) ||
        (filetype === "video" ? "Generated Video" : "Generated Media");
      tags = [model || filetype];
    } finally {
      await Promise.all(
        [tmpVideo, tmpFrame].map((p) =>
          Bun.file(p)
            .delete()
            .catch(() => undefined),
        ),
      );
    }

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

  async function extractFirstFrame(
    videoBytes: ArrayBuffer,
    tmpVideo: string,
    tmpFrame: string,
  ): Promise<ArrayBuffer> {
    await Bun.write(tmpVideo, videoBytes);
    const proc = spawn({
      cmd: [
        "ffmpeg",
        "-y",
        "-nostdin",
        "-i",
        tmpVideo,
        "-frames:v",
        "1",
        "-update",
        "1",
        tmpFrame,
      ],
      stdio: ["ignore", "ignore", "ignore"],
    });
    const status = await proc.exited;
    if (status !== 0) {
      throw new Error(`ffmpeg frame extraction failed (exit ${status})`);
    }
    return await Bun.file(tmpFrame).arrayBuffer();
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
