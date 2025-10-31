import { Context, Effect, Layer, Ref, Deferred } from "effect"
import { v4 as uuidv4 } from "uuid"
import { DaprService, DaprError } from "./dapr.service.js"
import { ConfigService } from "./config.service.js"

/**
 * MCP Bridge errors
 */
export class McpToolError extends Error {
  readonly _tag = "McpToolError"
  constructor(readonly toolName: string, readonly cause: unknown) {
    super(`MCP tool '${toolName}' failed`)
  }
}

export class McpToolTimeoutError extends Error {
  readonly _tag = "McpToolTimeoutError"
  constructor(readonly toolName: string, readonly requestId: string, readonly timeoutMs: number) {
    super(`MCP tool '${toolName}' timed out after ${timeoutMs}ms`)
  }
}

/**
 * MCP Tool Request
 */
export interface McpToolRequest {
  requestId: string
  tool: string
  arguments: Record<string, unknown>
}

/**
 * MCP Tool Response
 */
export interface McpToolResponse {
  requestId: string
  result?: unknown
  error?: string
}

/**
 * Pending request tracker
 */
interface PendingRequest {
  deferred: Deferred.Deferred<unknown, McpToolError>
  timestamp: number
  toolName: string
}

/**
 * McpBridgeService
 * Handles MCP tool calls via Dapr pub/sub
 * Uses Effect.Deferred for async request/response correlation
 * Following the pattern from readme-mcp LlmClientService
 */
export class McpBridgeService extends Context.Tag("McpBridgeService")<
  McpBridgeService,
  {
    readonly callTool: (
      toolName: string,
      args: Record<string, unknown>
    ) => Effect.Effect<unknown, McpToolError | McpToolTimeoutError | DaprError>
    readonly handleResponse: (
      response: McpToolResponse
    ) => Effect.Effect<void, never>
  }
>() {}

/**
 * Live implementation of McpBridgeService
 */
export const McpBridgeServiceLive = Layer.effect(
  McpBridgeService,
  Effect.gen(function* () {
    const dapr = yield* DaprService
    const config = yield* ConfigService
    const pubsubName = yield* config.getPubsubName
    const toolRequestTopic = "mcp-tool-requests"
    const toolTimeout = 30000 // 30 seconds for tool calls

    // Store pending requests
    const pendingRequests = yield* Ref.make<Map<string, PendingRequest>>(new Map())

    yield* Effect.logInfo("McpBridgeService initialized", {
      pubsubName,
      toolRequestTopic,
      toolTimeout
    })

    return {
      callTool: (toolName: string, args: Record<string, unknown>) =>
        Effect.gen(function* () {
          const requestId = uuidv4()

          yield* Effect.logDebug("Creating MCP tool request", {
            requestId,
            toolName,
            args
          })

          // Create deferred for async response
          const deferred = yield* Deferred.make<unknown, McpToolError>()

          // Register pending request
          yield* Ref.update(pendingRequests, map =>
            map.set(requestId, {
              deferred,
              timestamp: Date.now(),
              toolName
            })
          )

          // Build tool request (CloudEvent format)
          const toolRequest = {
            specversion: "1.0",
            type: "mcp.tool.request",
            source: "ai-svc",
            id: uuidv4(),
            data: {
              requestId,
              tool: toolName,
              arguments: args
            }
          }

          // Publish request to readme-mcp
          yield* dapr.publishEvent(pubsubName, toolRequestTopic, toolRequest)

          yield* Effect.logInfo("MCP tool request published", { requestId, toolName })

          // Race between response and timeout
          const result = yield* Effect.race(
            Deferred.await(deferred),
            Effect.gen(function* () {
              yield* Effect.sleep(toolTimeout)
              // Cleanup on timeout
              yield* Ref.update(pendingRequests, map => {
                map.delete(requestId)
                return map
              })
              return yield* Effect.fail(
                new McpToolTimeoutError(toolName, requestId, toolTimeout)
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

      handleResponse: (response: McpToolResponse) =>
        Effect.gen(function* () {
          yield* Effect.logDebug("Received MCP tool response", {
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
            yield* Effect.logError("MCP tool request failed", {
              requestId: response.requestId,
              toolName: request.toolName,
              error: response.error
            })
            yield* Deferred.fail(
              request.deferred,
              new McpToolError(request.toolName, response.error)
            )
          } else {
            yield* Effect.logInfo("MCP tool request succeeded", {
              requestId: response.requestId,
              toolName: request.toolName
            })
            yield* Deferred.succeed(request.deferred, response.result)
          }
        })
    }
  })
)

/**
 * Test implementation of McpBridgeService
 */
export const McpBridgeServiceTest = Layer.succeed(McpBridgeService, {
  callTool: (toolName: string, args: Record<string, unknown>) =>
    Effect.gen(function* () {
      yield* Effect.logInfo(`[Test] Calling MCP tool: ${toolName}`, { args })
      yield* Effect.sleep(100) // Simulate delay
      return {
        success: true,
        toolName,
        args
      }
    }),

  handleResponse: (response: McpToolResponse) =>
    Effect.gen(function* () {
      yield* Effect.logInfo("[Test] Handling MCP tool response", {
        requestId: response.requestId
      })
    })
})
