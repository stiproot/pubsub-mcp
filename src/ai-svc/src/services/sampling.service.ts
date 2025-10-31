import { Context, Effect, Layer } from "effect"
import { ChatOpenAI } from "@langchain/openai"
import { SamplingError } from "../errors.js"
import type { SamplingRequest, SamplingResponse } from "../schemas.js"
import { ConfigService } from "./config.service.js"

/**
 * SamplingService
 * Handles LLM sampling requests from mcp-srvr
 * Uses ChatOpenAI to generate responses
 */
export class SamplingService extends Context.Tag("SamplingService")<
  SamplingService,
  {
    readonly sample: (
      requestId: string,
      prompt: string,
      model?: string,
      temperature?: number,
      maxTokens?: number
    ) => Effect.Effect<SamplingResponse, SamplingError>
  }
>() {}

/**
 * Live implementation of SamplingService
 */
export const SamplingServiceLive = Layer.effect(
  SamplingService,
  Effect.gen(function* () {
    const config = yield* ConfigService
    const baseUrl = yield* config.getOpenAIBaseUrl

    yield* Effect.logInfo("SamplingService initialized", {
      baseUrl: baseUrl || "default"
    })

    return {
      sample: (
        requestId: string,
        prompt: string,
        model = "azure/gpt-4.1",
        temperature = 0.7,
        maxTokens = 2000
      ) =>
        Effect.gen(function* () {
          yield* Effect.logDebug("Processing sampling request", {
            requestId,
            model,
            temperature,
            maxTokens
          })

          const llmConfig: any = {
            modelName: model,
            temperature,
            maxTokens
          }

          if (baseUrl) {
            llmConfig.configuration = {
              baseURL: baseUrl
            }
          }

          const llm = new ChatOpenAI(llmConfig)

          const response = yield* Effect.tryPromise({
            try: async () => await llm.invoke(prompt),
            catch: (error) => new SamplingError({ requestId, cause: error })
          })

          yield* Effect.logInfo("Sampling request completed", {
            requestId,
            tokensUsed: response.usage_metadata?.total_tokens
          })

          return {
            requestId,
            content: response.content.toString(),
            model,
            tokensUsed: response.usage_metadata?.total_tokens
          }
        })
    }
  })
)

/**
 * Test implementation of SamplingService
 */
export const SamplingServiceTest = Layer.succeed(SamplingService, {
  sample: (
    requestId: string,
    prompt: string,
    model = "azure/gpt-4.1",
    temperature = 0.7,
    maxTokens = 2000
  ) =>
    Effect.gen(function* () {
      yield* Effect.logInfo("[Test] Processing sampling request", {
        requestId,
        prompt: prompt.substring(0, 50),
        model,
        temperature
      })
      yield* Effect.sleep(100) // Simulate delay
      return {
        requestId,
        content: `[Test] Generated response for: ${prompt.substring(0, 50)}...`,
        model,
        tokensUsed: 42
      }
    })
})
