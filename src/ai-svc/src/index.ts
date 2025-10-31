import { Effect, Layer, Runtime } from "effect"
import { Schema } from "@effect/schema"
import express, { Request, Response } from "express"
import { createServer } from "http"
import { v4 as uuidv4 } from "uuid"

// Import services
import {
  ConfigService,
  ConfigServiceLive,
  DaprService,
  DaprServiceLive,
  AgentService,
  AgentServiceLive,
  MessageHandlerService,
  MessageHandlerServiceLive,
  SamplingService,
  SamplingServiceLive,
  McpBridgeService,
  McpBridgeServiceLive,
  type AgentConfig
} from "./services/index.js"

// Import schemas
import { CloudEventSchema, type SamplingRequest } from "./schemas.js"

// Import agents
import { createReadmeAgent } from "./agents/readme-agent.js"

/**
 * Main Application Layer
 * Build dependency graph with proper layer composition
 *
 * Dependency hierarchy:
 * - Base: ConfigService
 * - Level 1: DaprService (depends on ConfigService)
 * - Level 2: AgentService, SamplingService, McpBridgeService (depend on DaprService)
 * - Level 3: MessageHandlerService (depends on AgentService)
 */

// Level 1: DaprService depends on ConfigService
const DaprWithDeps = DaprServiceLive.pipe(Layer.provide(ConfigServiceLive))

// Level 2: AgentService depends on DaprService
const AgentWithDeps = AgentServiceLive.pipe(
  Layer.provide(Layer.merge(ConfigServiceLive, DaprWithDeps))
)

// Level 2: SamplingService depends on ConfigService
const SamplingWithDeps = SamplingServiceLive.pipe(
  Layer.provide(ConfigServiceLive)
)

// Level 2: McpBridgeService depends on DaprService and ConfigService
const McpBridgeWithDeps = McpBridgeServiceLive.pipe(
  Layer.provide(Layer.merge(ConfigServiceLive, DaprWithDeps))
)

// Level 3: MessageHandlerService depends on AgentService
const MessageHandlerWithDeps = MessageHandlerServiceLive.pipe(
  Layer.provide(
    Layer.mergeAll(ConfigServiceLive, DaprWithDeps, AgentWithDeps)
  )
)

// Final application layer
const AppLive = Layer.mergeAll(
  ConfigServiceLive,
  DaprWithDeps,
  AgentWithDeps,
  MessageHandlerWithDeps,
  SamplingWithDeps,
  McpBridgeWithDeps
)

/**
 * HTTP Server Setup
 */
const createHttpServer = Effect.gen(function* () {
  const config = yield* ConfigService
  const port = yield* config.getServerPort
  const host = yield* config.getServerHost

  const app = express()

  // Configure body parser to handle both JSON and CloudEvents format
  app.use(express.json({
    type: ["application/json", "application/cloudevents+json"]
  }))

  yield* Effect.logInfo("Setting up HTTP server for ai-svc...")

  return { app, port, host }
})

/**
 * Setup REST API endpoints
 */
const setupRestEndpoints = (
  app: express.Application,
  runtime: Runtime.Runtime<
    AgentService |
    MessageHandlerService |
    DaprService |
    SamplingService |
    McpBridgeService |
    ConfigService
  >,
  pubsubName: string,
  topic: string
) =>
  Effect.gen(function* () {
    yield* Effect.logInfo("Setting up REST API endpoints...")

    // Health check
    app.get("/health", (req: Request, res: Response) => {
      res.json({ status: "healthy", service: "ai-svc" })
    })

    // List agents
    app.get("/agents", (req: Request, res: Response) => {
      const program = Effect.gen(function* () {
        const agentService = yield* AgentService
        const agents = yield* agentService.listAgents

        res.json({
          agents,
          count: agents.length
        })
      }).pipe(
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            yield* Effect.logError(`Error listing agents: ${error}`)
            res.status(500).json({
              error: "Failed to list agents",
              message: String(error)
            })
          })
        )
      )

      Runtime.runPromise(runtime)(program)
    })

    // Get chat history
    app.get("/sessions/:sessionId/history", (req: Request, res: Response) => {
      const { sessionId } = req.params

      const program = Effect.gen(function* () {
        const daprService = yield* DaprService
        const history = yield* daprService.getChatHistory(sessionId)

        if (!history) {
          return res.status(404).json({
            error: "Session not found",
            sessionId
          })
        }

        res.json(history)
      }).pipe(
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            yield* Effect.logError(`Error getting history: ${error}`)
            res.status(500).json({
              error: "Failed to get chat history",
              message: String(error)
            })
          })
        )
      )

      Runtime.runPromise(runtime as any)(program)
    })

    // Dapr pub/sub endpoint for AI events
    app.post("/ai-events", (req: Request, res: Response) => {
      const program = Effect.gen(function* () {
        yield* Effect.logInfo("Received AI event from Dapr pub/sub")
        yield* Effect.logDebug(`Request body: ${JSON.stringify(req.body)}`)

        const messageHandler = yield* MessageHandlerService
        const samplingService = yield* SamplingService
        const dapr = yield* DaprService
        const config = yield* ConfigService
        const pubsubName = yield* config.getPubsubName

        // CloudEvents format: actual data is in the body
        const eventData = req.body

        // Validate CloudEvent
        const decoded = yield* Schema.decodeUnknown(CloudEventSchema)(eventData)

        // Route based on event type
        if (decoded.type === "agent.request") {
          // Existing agent processing
          const result = yield* messageHandler.handleMessage(eventData)
          res.status(200).json({
            success: true,
            result
          })
        } else if (decoded.type === "sampling.request" || (decoded.data as any).requestId) {
          // NEW: Sampling request from readme-mcp
          yield* Effect.logInfo("Processing sampling request", {
            requestId: (decoded.data as any).requestId
          })

          const samplingReq = decoded.data as unknown as SamplingRequest
          const response = yield* samplingService.sample(
            samplingReq.requestId,
            samplingReq.prompt,
            samplingReq.model,
            samplingReq.temperature,
            samplingReq.maxTokens
          )

          // Publish response to ai-stream-responses
          const cloudEvent = {
            specversion: "1.0",
            type: "mcp.sampling.response",
            source: "ai-svc",
            id: uuidv4(),
            data: response
          }

          yield* dapr.publishEvent(pubsubName, "ai-stream-responses", cloudEvent)

          res.status(200).json({ success: true })
        } else {
          // Unknown event type
          yield* Effect.logWarning("Unknown event type", { type: decoded.type })
          res.status(400).json({
            error: "Unknown event type",
            type: decoded.type
          })
        }
      }).pipe(
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            yield* Effect.logError(`Error processing AI event: ${JSON.stringify(error, null, 2)}`)
            yield* Effect.logError(`Error type: ${error?._tag || typeof error}`)
            res.status(500).json({
              error: "Failed to process AI event",
              message: String(error)
            })
          })
        )
      )

      Runtime.runPromise(runtime)(program)
    })

    // MCP tool response endpoint
    app.post("/mcp-tool-events", (req: Request, res: Response) => {
      const program = Effect.gen(function* () {
        yield* Effect.logInfo("Received MCP tool response from Dapr pub/sub")
        yield* Effect.logDebug(`Request body: ${JSON.stringify(req.body)}`)

        const mcpBridge = yield* McpBridgeService

        const eventData = req.body
        const decoded = yield* Schema.decodeUnknown(CloudEventSchema)(eventData)

        if (decoded.type === "mcp.tool.response") {
          yield* mcpBridge.handleResponse(decoded.data as any)
        }

        res.status(200).json({ success: true })
      }).pipe(
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            yield* Effect.logError(`Error processing MCP tool response: ${JSON.stringify(error, null, 2)}`)
            res.status(500).json({
              error: "Failed to process MCP tool response",
              message: String(error)
            })
          })
        )
      )

      Runtime.runPromise(runtime)(program)
    })

    // Dapr subscription endpoint
    app.get("/dapr/subscribe", (req: Request, res: Response) => {
      res.json([
        {
          pubsubname: pubsubName,
          topic: topic,
          route: "/ai-events"
        },
        {
          pubsubname: pubsubName,
          topic: "mcp-tool-responses",
          route: "/mcp-tool-events"
        }
      ])
    })

    yield* Effect.logInfo("REST API endpoints configured")
  })

/**
 * Register default agents
 */
const registerDefaultAgents = Effect.gen(function* () {
  const agentService = yield* AgentService
  const config = yield* ConfigService
  const baseUrl = yield* config.getOpenAIBaseUrl

  yield* Effect.logInfo("Registering default agents", {
    baseUrl: baseUrl || "default"
  })

  // Register standard agents
  const defaultAgents: AgentConfig[] = [
    {
      id: "default",
      name: "Default Agent",
      description: "A general purpose AI agent",
      model: "azure/gpt-4.1",
      temperature: 0.7,
      baseUrl
    },
    {
      id: "assistant",
      name: "Assistant Agent",
      description: "A helpful AI assistant",
      model: "azure/gpt-4.1",
      temperature: 0.5,
      baseUrl
    }
  ]

  yield* Effect.all(
    defaultAgents.map((agent) => agentService.registerAgent(agent)),
    { concurrency: "unbounded" }
  )

  // Register README agent with MCP tool integration
  const mcpBridgeRuntime = yield* Effect.runtime<McpBridgeService>()
  const readmeAgentConfig: AgentConfig = {
    id: "readme-agent",
    name: "README Agent",
    description: "AI agent that validates and improves README files using MCP tools",
    model: "azure/gpt-4.1",
    temperature: 0.7,
    baseUrl
  }

  const readmeAgent = createReadmeAgent(readmeAgentConfig, mcpBridgeRuntime)
  yield* agentService.registerCustomAgent("readme-agent", readmeAgent)

  const registeredAgents = yield* agentService.listAgents
  yield* Effect.logInfo(`Registered ${registeredAgents.length} agents`, {
    agents: registeredAgents
  })
})

/**
 * Main application program
 */
const main = Effect.gen(function* () {
  yield* Effect.logInfo("=".repeat(60))
  yield* Effect.logInfo("🚀 Starting AI Service (ai-svc)")
  yield* Effect.logInfo("=".repeat(60))

  // Get configuration
  const config = yield* ConfigService
  const port = yield* config.getServerPort
  const host = yield* config.getServerHost
  const pubsubName = yield* config.getPubsubName
  const topic = yield* config.getTopic

  // Register default agents
  yield* registerDefaultAgents

  // Create HTTP server
  const { app } = yield* createHttpServer
  const server = createServer(app)

  // Create runtime for HTTP handlers
  const runtime = yield* Effect.runtime<
    AgentService |
    MessageHandlerService |
    DaprService |
    SamplingService |
    McpBridgeService |
    ConfigService
  >()

  // Setup REST API endpoints
  yield* setupRestEndpoints(app, runtime, pubsubName, topic)

  // Start server
  yield* Effect.async<void, never>((resume) => {
    server.listen(port, host, () => {
      Effect.runPromise(
        Effect.gen(function* () {
          yield* Effect.logInfo("=".repeat(60))
          yield* Effect.logInfo("🎉 AI Service running (Agent Processing Layer)")
          yield* Effect.logInfo(`📡 HTTP Server: http://${host}:${port}`)
          yield* Effect.logInfo(`📬 Pub/Sub: ${pubsubName}`)
          yield* Effect.logInfo(`📨 Topic: ${topic}`)
          yield* Effect.logInfo("=".repeat(60))
        })
      )
      resume(Effect.void)
    })
  })

  // Setup graceful shutdown
  const shutdown = Effect.gen(function* () {
    yield* Effect.logInfo("🛑 Shutting down gracefully...")

    yield* Effect.async<void>((resume) => {
      server.close(() => {
        Effect.runPromise(Effect.logInfo("✅ HTTP server closed"))
        resume(Effect.void)
      })
    })

    yield* Effect.logInfo("👋 Shutdown complete")
  })

  process.on("SIGTERM", () => Runtime.runPromise(runtime)(shutdown as any))
  process.on("SIGINT", () => Runtime.runPromise(runtime)(shutdown as any))

  // Keep process running
  yield* Effect.never
})

// Create runtime and run application
const program = main.pipe(Effect.provide(AppLive)) as Effect.Effect<void, unknown, never>

Effect.runPromise(program).catch((error) => {
  console.error("❌ Failed to start AI Service:", error)
  process.exit(1)
})
