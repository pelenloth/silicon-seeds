import { Event, JobMode } from "../events/events";
import { LLM } from "../llm/llm";
import { Presets, StylePresets } from "../styles/presets";
import { StylePrompt } from "../styles/system";
import { ImageGenerator } from "../image/image-generator";
import { Logger } from "../logger/logger";
import { Utils } from "../utils/utils";
import { DB } from "../db/db";
import z from "zod/v3";
import { FileHandle } from "@lmstudio/sdk";

export namespace PromptGenerator {
  const JobNameSchema = z.object({
    words: z.array(z.string().trim().min(2).max(20)).min(3).max(4),
  });

  export async function job_name(originalPrompt?: string | null) {
    if (Bun.env.NODE_ENV === "test") {
      return `Job ${Date.now()}`;
    }
    const promptContext = originalPrompt?.trim().slice(0, 600);

    for (let attempt = 0; attempt < 5; attempt++) {
      const variationHint = Bun.randomUUIDv7().slice(-6);
      const res = await LLM.structured(
        `Generate a fun, memorable title for a generative media job.

Requirements:
- return exactly 3 or 4 words
- each word must be vivid and concise
- use title-friendly words only
- no punctuation
- no numbers
- no generic filler words like "the", "and", "for", "with"
- the full title should feel playful, creative, and slightly poetic

${
  promptContext
    ? `Creative context from the user's initial prompt:
${promptContext}

Reflect the subject or mood of that prompt in the title without copying long phrases.

`
    : ""
}Variation hint for this attempt: ${variationHint}

Return structured data only.
`,
        JobNameSchema,
      );

      const candidate = res?.parsed?.words.join(" ");

      if (!candidate) {
        Logger.warn("Failed to generate job name, retrying", { attempt });
        continue;
      }

      if (!(await DB.Jobs.findByName(candidate))) {
        return candidate;
      }

      Logger.warn("Generated duplicate job name, retrying", {
        candidate,
        attempt,
      });
    }

    return `Job ${Date.now()}`;
  }

  async function styled_image_prompt(message: string, preset?: string) {
    // Handle "none" as explicit no-style
    if (!preset || preset === Presets.NONE || preset === "none") {
      const { instructions, lora } = StylePresets.presets[Presets.NONE]({
        title: message,
      });
      const resNone = await LLM.message(
        `Create excellent image prompt(s) based on these instructions:

${instructions}

Make sure to only include the actual image prompt in your response and nothing more!
`,
      );
      if (
        resNone === null ||
        !resNone.content ||
        resNone.content.trim() === ""
      ) {
        Logger.warn("Failed to generate image prompt - skipping");
        return null;
      }
      return { prompt: resNone.content.trim(), lora };
    }

    // Try hardcoded presets first
    if (preset && (preset as Presets) in StylePresets.presets) {
      const styleFn = StylePresets.presets[preset as Presets];
      const { instructions, lora } = styleFn({ title: message });
      const res = await LLM.message(
        `Create excellent image prompt(s) based on these instructions:

${instructions}

Make sure to only include the actual image prompt in your response and nothing more!
`,
      );
      if (res === null || !res.content || res.content.trim() === "") {
        Logger.warn("Failed to generate image prompt - skipping");
        return null;
      }
      return { prompt: res.content.trim(), lora };
    }

    // Dynamic DB preset fallback
    const row = preset ? await DB.StylePresets.findByName(preset) : null;
    if (row) {
      const styles: string[] = JSON.parse(row.styles_json) as string[];
      const style = {
        primary: row.primary_style,
        secondary: row.secondary_trigger ?? undefined,
        styles,
        texture: row.texture ?? "",
      };
      const instructions = StylePrompt.system({ style, title: message });
      const res = await LLM.message(
        `Create excellent image prompt(s) based on these instructions:

${instructions}

Make sure to only include the actual image prompt in your response and nothing more!
`,
      );
      if (res === null || !res.content || res.content.trim() === "") {
        Logger.warn("Failed to generate image prompt - skipping");
        return null;
      }
      // DB presets don't carry single lora; loras are handled via explicit selection
      return { prompt: res.content.trim(), lora: undefined };
    }

    // Fallback to system
    const { instructions: fallbackInstructions, lora: fallbackLora } =
      StylePresets.presets[Presets.SYSTEM]({ title: message });
    const fallbackRes = await LLM.message(
      `Create excellent image prompt(s) based on these instructions:

${fallbackInstructions}

Make sure to only include the actual image prompt in your response and nothing more!
`,
    );
    if (
      fallbackRes === null ||
      !fallbackRes.content ||
      fallbackRes.content.trim() === ""
    ) {
      Logger.warn("Failed to generate image prompt - skipping");
      return null;
    }
    return { prompt: fallbackRes.content.trim(), lora: fallbackLora };
  }

  export async function txt_to_img_prompt(
    message: string,
    batchSize = 1,
    preset?: string,
  ) {
    const prompts = [];

    for (let i = 0; i < batchSize; i++) {
      const styled = await styled_image_prompt(message, preset);
      prompts.push(styled);
      if (!styled) {
        return null;
      }
    }

    return prompts;
  }

  export async function styled_img_to_event(
    jobId: string,
    mode: JobMode,
    message: string,
    preset?: string,
    index?: number,
    id?: string,
    loras?: { name: string; strength: number }[],
  ) {
    const styled = await styled_image_prompt(message, preset);
    if (!styled) {
      return null;
    }
    // If user provided loras, override preset lora; otherwise use preset's single lora converted to array
    const effectiveLoras =
      loras && loras.length
        ? loras
        : styled.lora
          ? [{ name: styled.lora as string, strength: 0.7 }]
          : undefined;

    return await ImageGenerator.schedule_image({
      id,
      jobId,
      mode,
      prompt: styled.prompt,
      lora: styled.lora,
      loras: effectiveLoras,
      index,
    } as any);
  }

  export async function img_to_vid_prompt(promptId: string, image: FileHandle) {
    const event = await DB.Events.findById(promptId);
    Utils.assert(
      event,
      "Unable to find associated event with image for image-to-video prompt.",
    );

    if (event.type !== Event.NewImagePrompt) return;

    const response = await LLM.message(
      `Generate a detailed video generation prompt for a 5 second long video based on the content of the image.
The video itself should be slow paced without any rapid movement as if time moves a bit slower.

The camera movement should be slow and steady and should not change meaning if the camera does a fade in it should
not do a fade out anymore, but just to continue with the fade in motion until the very end of the video.
The fade in motion is just an example. Depending on the image it makes sense to have no camera movement at all or
to use a different motion like:

fade in, fade out, pan left, pan right, tilt top, tilt bottom

It is very important that you describe the ending position of the video to prevent the video from looping.

Also consider the original prompt which was used to generate the image for richer context:

${event.prompt}

Make sure to only include the actual video generation prompt in your response and nothing more!
`,
      [image],
    );

    if (!response?.content) {
      Logger.warn("Failed to generate video prompt - skipping");
      return null;
    }

    return { prompt: response.content };
  }

  export function script_prompt(description: string) {
    return `Create a text script / essay based on the following description: ${description}

If the description does not provide details about the length of the essay make sure it is between
800 and 1300 words long depending on the subject.

Make sure to remove any markdown syntax so that the content is just plain text.

Your response should only include the actual essay including it's title and nothing more!
`;
  }

  export async function image_scene_prompts(
    text: string,
    amount: number,
    styleGuide?: string,
  ): Promise<string[] | null> {
    {
      let list_prompt = `Image Prompt Instructions:

- Generate a list of ${amount} stylistic, holistically coherent image prompts
- Ensure each prompt is not longer than ~25-50 words
- Content: The different prompts should be unique and have a great amount of variety
between them to ensure the final composition will consist of a wide range of
different scenes which all refer to the same story or script
- Style: The prompts should all follow the same style and vibe to ensure the final
composition looks coherent and like all scenes belong together, but they should not be
too similar to each other. The style should be cinematic, detailed, and visually rich.
- Your response should only include the list of image prompts - nothing more!
- There should be no duplicate prompts in the list make sure each prompt is unique!
- The resulting images should contain no text or words in them at all so do not
put any descriptions or instructions for visualizing words, slogans or texts
into the actual prompts. There should be no words, signs.
- Your response should only include the list of generated image prompts

Create a list of ${amount} image prompts in chronological
order which should describe this video script visually in it's totality from
start to finish:

${text}
`;

      if (styleGuide?.trim()) {
        list_prompt += `\n\nGlobal Style Guide (must apply to every scene, takes precedence for visual coherence):\n${styleGuide.trim().slice(0, 2000)}\nEnsure every generated scene prompt respects this guide while keeping scenes unique and chronological.`;
      }
      const res = await LLM.image_prompt_list(list_prompt, amount);
      if (!res?.parsed) return null;

      let scenes = Object.values(res.parsed);
      Logger.info("scenes: ", res.parsed);
      Logger.info("amount: ", amount);
      Logger.info("actual: ", scenes.length);

      if (!Array.isArray(scenes)) return null;
      Utils.assert(
        scenes.length >= amount,
        "LLM did not generate the desired amount of scene prompts.",
      );

      if (scenes.length > amount) {
        Logger.warn(
          "The model generated more prompts than requested, slicing the array!",
          {
            expected: amount,
            actual: scenes.length,
            scenes,
          },
        );

        scenes = scenes.slice(0, amount);
      }

      return scenes;
    }
  }
}
