import { FileHandle, LMStudioClient } from "@lmstudio/sdk";
import { Logger } from "../logger/logger";
import z from "zod/v3";
import { Utils } from "../utils/utils";

let llmClient: LMStudioClient | null = null;
let llmModelPromise: ReturnType<LMStudioClient["llm"]["model"]> | null = null;
let embeddingModelPromise: ReturnType<
  LMStudioClient["embedding"]["model"]
> | null = null;

function getClient(): LMStudioClient {
  if (!llmClient) {
    llmClient = new LMStudioClient();
  }
  return llmClient;
}

function getLlmModel() {
  if (!llmModelPromise) {
    const modelName = Bun.env.LLM_MODEL;
    Utils.assert(modelName, "LLM_MODEL variable missing");
    llmModelPromise = getClient().llm.model(modelName);
  }
  return llmModelPromise;
}

function getEmbeddingModel() {
  if (!embeddingModelPromise) {
    const modelName = Bun.env.EMBEDDING_MODEL;
    Utils.assert(modelName, "EMBEDDING_MODEL variable missing");
    embeddingModelPromise = getClient().embedding.model(modelName);
  }
  return embeddingModelPromise;
}

export namespace LLM {
  export const client = getClient();
  const MAX_TOKENS = 10_000;

  export async function message(msg: string, images?: FileHandle[]) {
    try {
      const llmModel = await getLlmModel();
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
      const llmModel = await getLlmModel();
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
      const llmModel = await getLlmModel();
      return (await llmModel.respond(msg, {
        structured: schema,
        maxTokens: MAX_TOKENS,
        ...(opts?.signal ? { signal: opts.signal } : {}),
      })) as unknown as { parsed: z.infer<T> } | null;
    } catch (error) {
      Logger.error("Failed to receive structured message from LLM", error);
      return null;
    }
  }

  export async function generateEmbedding(text: string): Promise<number[]> {
    const embeddingModel = await getEmbeddingModel();
    const result = await embeddingModel.embed(text);
    return result.embedding;
  }
}
