import { Context, Effect, Layer, Ref, Deferred } from "effect"
import { v4 as uuidv4 } from "uuid"
import { DaprService } from "./dapr.service.js"
import { ConfigService } from "./config.service.js"
import { LlmClientError, TimeoutError, DaprError } from "../errors.js"
import type { SamplingRequest, SamplingResponse } from "../schemas.js"

/**
 * Pending request tracker
 */
interface PendingRequest {
  deferred: Deferred.Deferred<string, LlmClientError>
  timestamp: number
}

/**
 * LlmClientService interface
 */
export class LlmClientService extends Context.Tag("LlmClientService")<
  LlmClientService,
  {
    readonly sample: (
      prompt: string,
      model?: string,
      temperature?: number
    ) => Effect.Effect<string, LlmClientError | TimeoutError | DaprError>
    readonly handleResponse: (
      response: SamplingResponse
    ) => Effect.Effect<void, LlmClientError>
  }
>() {}

/**
 * Live implementation of LlmClientService
 */
export const LlmClientServiceLive = Layer.effect(
  LlmClientService,
  Effect.gen(function* () {
    const dapr = yield* DaprService
    const config = yield* ConfigService
    const pubsubName = yield* config.getPubsubName
    const topicName = yield* config.getTopicName
    const timeoutMs = yield* config.getSamplingTimeout

    // Store pending requests
    const pendingRequests = yield* Ref.make<Map<string, PendingRequest>>(new Map())

    yield* Effect.logInfo("LlmClientService initialized", {
      pubsubName,
      topicName,
      timeoutMs
    })

    return {
      sample: (prompt: string, model = "azure/gpt-4.1", temperature = 0.7) =>
        Effect.gen(function* () {
          const requestId = uuidv4()

          yield* Effect.logDebug("Creating sampling request", {
            requestId,
            model,
            temperature
          })

          // Create deferred for async response
          const deferred = yield* Deferred.make<string, LlmClientError>()

          // Register pending request
          yield* Ref.update(pendingRequests, map =>
            map.set(requestId, {
              deferred,
              timestamp: Date.now()
            })
          )

          // Build sampling request
          const samplingRequest: SamplingRequest = {
            requestId,
            prompt,
            model,
            temperature,
            maxTokens: 2000,
            metadata: {
              source: "readme-mcp",
              timestamp: new Date().toISOString()
            }
          }

          // Publish request to ai-svc
          yield* dapr.publishEvent(pubsubName, topicName, samplingRequest)

          yield* Effect.logInfo("Sampling request published", { requestId })

          // Race between response and timeout
          const result = yield* Effect.race(
            Deferred.await(deferred),
            Effect.gen(function* () {
              yield* Effect.sleep(timeoutMs)
              // Cleanup on timeout
              yield* Ref.update(pendingRequests, map => {
                map.delete(requestId)
                return map
              })
              return yield* Effect.fail(
                new TimeoutError({
                  operation: "sample",
                  timeoutMs,
                  message: `Sampling request ${requestId} timed out after ${timeoutMs}ms`
                })
              )
            })
          )

          // Cleanup successful request
          yield* Ref.update(pendingRequests, map => {
            map.delete(requestId)
            return map
          })

          return result
        }),

      handleResponse: (response: SamplingResponse) =>
        Effect.gen(function* () {
          yield* Effect.logDebug("Received sampling response", {
            requestId: response.requestId
          })

          const pending = yield* Ref.get(pendingRequests)
          const request = pending.get(response.requestId)

          if (!request) {
            yield* Effect.logWarning("Received response for unknown request", {
              requestId: response.requestId
            })
            return
          }

          if (response.error) {
            yield* Effect.logError("Sampling request failed", {
              requestId: response.requestId,
              error: response.error
            })
            yield* Deferred.fail(
              request.deferred,
              new LlmClientError({
                operation: "sample",
                message: response.error
              })
            )
          } else {
            yield* Effect.logInfo("Sampling request succeeded", {
              requestId: response.requestId,
              tokensUsed: response.tokensUsed
            })
            yield* Deferred.succeed(request.deferred, response.content)
          }
        })
    }
  })
)

/**
 * Test implementation of LlmClientService
 */
export const LlmClientServiceTest = Layer.succeed(LlmClientService, {
  sample: (prompt: string, model = "azure/gpt-4.1", temperature = 0.7) =>
    Effect.gen(function* () {
      yield* Effect.logInfo("[TEST] Sampling request", { prompt, model, temperature })
      yield* Effect.sleep(100) // Simulate delay
      return `[TEST] Generated response for: ${prompt.substring(0, 50)}...`
    }),

  handleResponse: (response: SamplingResponse) =>
    Effect.gen(function* () {
      yield* Effect.logInfo("[TEST] Handling response", { requestId: response.requestId })
    })
})
