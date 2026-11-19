import { FileHandle, LMStudioClient } from "@lmstudio/sdk";
import { Logger } from "../logger/logger";
import z from "zod/v3";
import { Utils } from "../utils/utils";

let _llmClient: LMStudioClient | null = null;
let _llmModelPromise: Promise<
  Awaited<ReturnType<LMStudioClient["llm"]["model"]>>
> | null = null;
let _embeddingModelPromise: Promise<
  Awaited<ReturnType<LMStudioClient["embedding"]["model"]>>
> | null = null;

function getClient(): LMStudioClient {
  if (!_llmClient) {
    _llmClient = new LMStudioClient();
  }
  return _llmClient;
}

function getLlmModel() {
  if (!_llmModelPromise) {
    const modelName = Bun.env.LLM_MODEL;
    Utils.assert(modelName, "LLM_MODEL variable missing");
    _llmModelPromise = getClient().llm.model(modelName);
  }
  return _llmModelPromise;
}

function getEmbeddingModel() {
  if (!_embeddingModelPromise) {
    const modelName = Bun.env.EMBEDDING_MODEL;
    Utils.assert(modelName, "EMBEDDING_MODEL variable missing");
    _embeddingModelPromise = getClient().embedding.model(modelName);
  }
  return _embeddingModelPromise;
}

export namespace LLM {
  export declare const client: LMStudioClient;
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
      if (opts?.signal?.aborted) {
        return null;
      }
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

Object.defineProperty(LLM, "client", {
  get: getClient,
  enumerable: true,
});
