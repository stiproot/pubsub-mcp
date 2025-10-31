import express, { type Request, type Response } from "express"
import { createServer } from "http"
import { Effect, Layer, Runtime } from "effect"
import { Schema } from "@effect/schema"
import { v4 as uuidv4 } from "uuid"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import {
  ConfigService,
  ConfigServiceLive,
  DaprService,
  DaprServiceLive,
  ReadmeValidatorService,
  ReadmeValidatorServiceLive,
  ReadmeGeneratorService,
  ReadmeGeneratorServiceLive,
  LlmClientService,
  LlmClientServiceLive
} from "./services/index.js"
import { createReadmeStandardsMcp } from "./mcps/readme-standards-mcp.js"
import {
  CloudEventSchema,
  type SamplingResponse,
  type McpToolRequest,
  type McpToolResponse,
  type GenerateReadmeInput
} from "./schemas.js"

// All services needed by the application
type Services =
  | ConfigService
  | DaprService
  | ReadmeValidatorService
  | ReadmeGeneratorService
  | LlmClientService

/**
 * Compose all layers
 */
const DaprWithDeps = DaprServiceLive.pipe(Layer.provide(ConfigServiceLive))

const LlmClientWithDeps = LlmClientServiceLive.pipe(
  Layer.provide(Layer.merge(ConfigServiceLive, DaprWithDeps))
)

const AppLive = Layer.mergeAll(
  ConfigServiceLive,
  DaprWithDeps,
  ReadmeValidatorServiceLive,
  ReadmeGeneratorServiceLive,
  LlmClientWithDeps
)

/**
 * Route tool requests to appropriate service
 */
function routeToTool(
  toolName: string,
  args: Record<string, unknown>,
  runtime: Runtime.Runtime<Services>
) {
  return Effect.gen(function* () {
    const validator = yield* ReadmeValidatorService
    const generator = yield* ReadmeGeneratorService
    const llmClient = yield* LlmClientService

    switch (toolName) {
      case "validate-readme":
        return yield* validator.validate(
          args.content as string,
          args.strictMode as boolean
        )
      case "generate-readme":
        return yield* generator.generate(args as GenerateReadmeInput)
      case "suggest-improvements":
        const prompt = `Analyze the following README and suggest improvements:\n\n${args.content}`
        const response = yield* llmClient.sample(prompt, "azure/gpt-4.1", 0.7)
        return { suggestions: response }
      case "check-completeness":
        return yield* validator.checkCompleteness(args.content as string)
      default:
        return yield* Effect.fail(new Error(`Unknown tool: ${toolName}`))
    }
  })
}

/**
 * Main application
 */
const main = Effect.gen(function* () {
  yield* Effect.logInfo("🚀 Starting MCP Server Service")

  // Get configuration
  const config = yield* ConfigService
  const port = yield* config.getServerPort
  const host = yield* config.getServerHost
  const pubsubName = yield* config.getPubsubName
  const topicName = yield* config.getTopicName

  // Create Express app
  const app = express()
  app.use(
    express.json({
      type: ["application/json", "application/cloudevents+json"]
    })
  )

  // Create HTTP server
  const httpServer = createServer(app)

  // Create runtime for handlers
  const runtime = yield* Effect.runtime<Services>()

  // Create MCP server instance
  const mcpServer = createReadmeStandardsMcp(runtime)

  yield* Effect.logInfo("MCP server created with all primitives")

  // ===== HTTP ENDPOINTS =====

  /**
   * Health check endpoint
   */
  app.get("/health", (req: Request, res: Response) => {
    res.json({
      status: "healthy",
      service: "mcp-srvr",
      timestamp: new Date().toISOString()
    })
  })

  /**
   * MCP HTTP Transport Endpoint (Primary)
   */
  app.all("/mcp/readme-standards", async (req: Request, res: Response) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => Math.random().toString(36).substring(7)
    })

    await transport.handleRequest(req as any, res as any, mcpServer)
  })

  /**
   * Dapr subscription endpoint
   */
  app.get("/dapr/subscribe", (req: Request, res: Response) => {
    res.json([
      {
        pubsubname: pubsubName,
        topic: `${topicName}-responses`, // Listen for responses from ai-svc
        route: "/mcp-events"
      },
      {
        pubsubname: pubsubName,
        topic: "mcp-tool-requests", // Listen for tool requests from ai-svc
        route: "/mcp-tool-events"
      }
    ])
  })

  /**
   * Dapr pub/sub event handler for sampling responses
   */
  app.post("/mcp-events", (req: Request, res: Response) => {
    const program = Effect.gen(function* () {
      yield* Effect.logDebug("Received MCP event", { body: req.body })

      // Validate CloudEvent
      const eventData = yield* Schema.decodeUnknown(CloudEventSchema)(req.body)

      yield* Effect.logInfo("Processing sampling response", {
        id: eventData.id,
        type: eventData.type
      })

      // Handle sampling response
      if (eventData.type === "mcp.sampling.response") {
        const llmClient = yield* LlmClientService
        yield* llmClient.handleResponse(eventData.data as SamplingResponse)
      }

      res.status(200).json({ success: true })
    }).pipe(
      Effect.catchAll((error) =>
        Effect.gen(function* () {
          yield* Effect.logError(`Failed to process event: ${error}`)
          res.status(500).json({
            error: "Event processing failed",
            message: String(error)
          })
        })
      )
    )

    Runtime.runPromise(runtime)(program)
  })

  /**
   * Dapr pub/sub event handler for MCP tool requests
   */
  app.post("/mcp-tool-events", (req: Request, res: Response) => {
    const program = Effect.gen(function* () {
      yield* Effect.logInfo("Received MCP tool request")

      // Validate CloudEvent
      const eventData = yield* Schema.decodeUnknown(CloudEventSchema)(req.body)

      if (eventData.type === "mcp.tool.request") {
        const toolRequest = eventData.data as McpToolRequest

        yield* Effect.logInfo("Processing tool request", {
          requestId: toolRequest.requestId,
          tool: toolRequest.tool
        })

        // Route to appropriate MCP tool
        const result = yield* routeToTool(toolRequest.tool, toolRequest.arguments, runtime)

        // Publish response
        const config = yield* ConfigService
        const dapr = yield* DaprService
        const pubsubName = yield* config.getPubsubName

        const response: McpToolResponse = {
          requestId: toolRequest.requestId,
          result: result
        }

        const cloudEvent = {
          specversion: "1.0",
          type: "mcp.tool.response",
          source: "mcp-srvr",
          id: uuidv4(),
          data: response
        }

        yield* dapr.publishEvent(pubsubName, "mcp-tool-responses", cloudEvent)

        res.status(200).json({ success: true })
      }
    }).pipe(
      Effect.catchAll((error) =>
        Effect.gen(function* () {
          yield* Effect.logError(`Tool request failed: ${error}`)
          res.status(500).json({ error: String(error) })
        })
      )
    )

    Runtime.runPromise(runtime)(program)
  })

  yield* Effect.logInfo("Express routes configured")

  // Start HTTP server
  yield* Effect.async<void>((resume) => {
    httpServer.listen(port, host, () => {
      console.log(`
╔════════════════════════════════════════╗
║  MCP Server Service Started            ║
╠════════════════════════════════════════╣
║  Port: ${port.toString().padEnd(31)} ║
║  Host: ${host.padEnd(31)} ║
║  MCP Endpoint: /mcp/readme-standards   ║
║  Health: /health                       ║
╚════════════════════════════════════════╝
      `)
      resume(Effect.void)
    })
  })

  // Graceful shutdown
  const shutdown = Effect.gen(function* () {
    yield* Effect.logInfo("Shutting down gracefully...")
    yield* Effect.async<void>((resume) => {
      httpServer.close(() => {
        resume(Effect.void)
      })
    })
    yield* Effect.logInfo("Server stopped")
    process.exit(0)
  })

  process.on("SIGTERM", () => {
    Runtime.runPromise(runtime)(shutdown)
  })

  process.on("SIGINT", () => {
    Runtime.runPromise(runtime)(shutdown)
  })

  // Keep running
  yield* Effect.never
})

// Create program with dependencies
const program = main.pipe(Effect.provide(AppLive))

// Run the program
Effect.runPromise(program).catch((error) => {
  console.error("❌ Failed to start MCP Server Service:", error)
  process.exit(1)
})
