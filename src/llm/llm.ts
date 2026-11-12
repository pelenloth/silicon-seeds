import { FileHandle, LMStudioClient } from "@lmstudio/sdk";
import { Logger } from "../logger/logger";
import z from "zod/v3";
import { Utils } from "../utils/utils";

const llmClient = new LMStudioClient();
const LLM_MODEL = Bun.env.LLM_MODEL;
Utils.assert(LLM_MODEL, "LLM_MODEL variable missing");

const llmModel = await llmClient.llm.model(LLM_MODEL);

const EMBEDDING_MODEL = Bun.env.EMBEDDING_MODEL;
Utils.assert(EMBEDDING_MODEL, "EMBEDDING_MODEL variable missing");
const embeddingModel = await llmClient.embedding.model(EMBEDDING_MODEL);

export namespace LLM {
  export const client = llmClient;
  const MAX_TOKENS = 10_000;

  export async function message(msg: string, images?: FileHandle[]) {
    try {
      if (images) {
        return await llmModel.respond(
          { role: "user", content: msg, images },
          { maxTokens: MAX_TOKENS },
        );
      }

      return await llmModel.respond(
        { role: "user", content: msg },
        { maxTokens: MAX_TOKENS },
      );
    } catch (error) {
      Logger.error("Failed to receive message from LLM", error);
      return null;
    }
  }

  export async function image_prompt_list(msg: string, amount: number) {
    const mapSchema: Record<string, z.ZodString> = {};
    for (let i = 0; i < amount; i++) {
      if (!mapSchema[i]) mapSchema[i] = z.string();
    }

    try {
      // Why TypeScript :(
      const typedSchema = z.object(mapSchema);

      return await llmModel.respond(msg, {
        structured: typedSchema,
        maxTokens: MAX_TOKENS,
      });
    } catch (error) {
      Logger.error("Failed to receive message from LLM", error);
      return null;
    }
  }

  export async function structured<T extends z.ZodTypeAny>(
    msg: string,
    schema: T,
    opts?: { signal?: AbortSignal },
  ) {
    try {
      return (await llmModel.respond(msg, {
        structured: schema,
        maxTokens: MAX_TOKENS,
        ...(opts?.signal ? { signal: opts.signal } : {}),
      })) as unknown as { parsed: z.infer<T> } | null;
    } catch (error) {
      if (opts?.signal?.aborted) {
        return null;
      }
      Logger.error("Failed to receive structured message from LLM", error);
      return null;
    }
  }

  export async function generateEmbedding(text: string): Promise<number[]> {
    const result = await embeddingModel.embed(text);
    return result.embedding;
  }
}
