import { Effect, Layer, Context, Ref } from "effect"
import { StateGraph, END, START, Annotation } from "@langchain/langgraph"
import { BaseMessage, HumanMessage, AIMessage } from "@langchain/core/messages"
import { ChatOpenAI } from "@langchain/openai"
import { AgentNotFoundError, AgentInitializationError, AgentInvocationError } from "../errors.js"
import type { AgentResponse, ChatMessage, ChatSessionState } from "../schemas.js"
import { DaprService } from "./dapr.service.js"

/**
 * Agent configuration
 */
export interface AgentConfig {
  id: string
  name: string
  description?: string
  model?: string
  temperature?: number
  baseUrl?: string
}

/**
 * State annotation for agent graph
 */
const AgentStateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (currentMessages, newMessages) => currentMessages.concat(newMessages),
    default: () => []
  }),
  input: Annotation<unknown>({
    reducer: (_, newInput) => newInput,
    default: () => ({})
  }),
  output: Annotation<unknown>({
    reducer: (_, newOutput) => newOutput,
    default: () => null
  })
})

/**
 * Compiled agent graph interface
 * Represents any compiled StateGraph that can be invoked
 */
interface CompiledAgentGraph {
  invoke(input: { messages: BaseMessage[]; input: unknown }): Promise<{
    messages?: BaseMessage[]
    output: unknown
    [key: string]: unknown
  }>
}

/**
 * Agent registry type
 */
type AgentRegistry = Map<string, CompiledAgentGraph>

/**
 * Creates a basic LangGraph agent
 */
function createAgentGraph(config: AgentConfig) {
  const llmConfig: any = {
    modelName: config.model || "azure/gpt-4.1",
    temperature: config.temperature || 0.7
  }

  if (config.baseUrl) {
    llmConfig.configuration = {
      baseURL: config.baseUrl
    }
  }

  const model = new ChatOpenAI(llmConfig)

  // Define the agent node
  async function agentNode(state: typeof AgentStateAnnotation.State) {
    const response = await model.invoke(state.messages)
    return {
      messages: [response],
      output: response.content
    }
  }

  // Create the graph
  const workflow = new StateGraph(AgentStateAnnotation)
    .addNode("agent", agentNode)
    .addEdge(START, "agent")
    .addEdge("agent", END)

  return workflow.compile()
}

/**
 * Converts ChatMessage to LangChain BaseMessage
 */
function chatMessageToBaseMessage(msg: ChatMessage): BaseMessage {
  switch (msg.role) {
    case "user":
      return new HumanMessage(msg.content)
    case "assistant":
      return new AIMessage(msg.content)
    default:
      return new HumanMessage(msg.content)
  }
}

/**
 * AgentService
 * Manages LangGraph agents in memory with chat history persistence
 * Following Effect-TS pattern: Service abstraction for agent management
 */
export class AgentService extends Context.Tag("AgentService")<
  AgentService,
  {
    readonly registerAgent: (config: AgentConfig) => Effect.Effect<void, AgentInitializationError>
    readonly registerCustomAgent: (agentId: string, graph: CompiledAgentGraph) => Effect.Effect<void, never>
    readonly getAgent: (agentId: string) => Effect.Effect<CompiledAgentGraph, AgentNotFoundError>
    readonly invokeAgent: (agentId: string, input: unknown, sessionId?: string) => Effect.Effect<AgentResponse, AgentNotFoundError | AgentInvocationError>
    readonly listAgents: Effect.Effect<string[]>
  }
>() {}

/**
 * Live implementation of AgentService
 */
export const AgentServiceLive = Layer.effect(
  AgentService,
  Effect.gen(function* () {
    const registry = yield* Ref.make<AgentRegistry>(new Map())
    const daprService = yield* DaprService

    return {
      registerAgent: (config: AgentConfig) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`Registering agent: ${config.id}`)

          const graph = yield* Effect.try({
            try: () => createAgentGraph(config),
            catch: (error) => new AgentInitializationError({
              agentId: config.id,
              cause: error
            })
          })

          yield* Ref.update(registry, (map) => {
            const newMap = new Map(map)
            newMap.set(config.id, graph)
            return newMap
          })

          yield* Effect.logInfo(`Agent registered successfully: ${config.id}`)
        }),

      registerCustomAgent: (agentId: string, graph: CompiledAgentGraph) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`Registering custom agent: ${agentId}`)

          yield* Ref.update(registry, (map) => {
            const newMap = new Map(map)
            newMap.set(agentId, graph)
            return newMap
          })

          yield* Effect.logInfo(`Custom agent registered successfully: ${agentId}`)
        }),

      getAgent: (agentId: string) =>
        Effect.gen(function* () {
          const map = yield* Ref.get(registry)
          const agent = map.get(agentId)

          if (!agent) {
            return yield* Effect.fail(new AgentNotFoundError({ agentId }))
          }

          return agent
        }),

      invokeAgent: (agentId: string, input: unknown, sessionId?: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`Invoking agent: ${agentId}`, { sessionId })

          // Get the agent
          const agent = yield* Effect.gen(function* () {
            const map = yield* Ref.get(registry)
            const foundAgent = map.get(agentId)

            if (!foundAgent) {
              return yield* Effect.fail(new AgentNotFoundError({ agentId }))
            }

            return foundAgent
          })

          // Load chat history if session exists
          let chatHistory: BaseMessage[] = []
          if (sessionId) {
            yield* Effect.logDebug(`Loading chat history for session: ${sessionId}`)

            const existingState = yield* daprService.getChatHistory(sessionId).pipe(
              Effect.catchAll(() => Effect.succeed(null))
            )

            if (existingState) {
              chatHistory = existingState.messages.map(chatMessageToBaseMessage)
              yield* Effect.logDebug(`Loaded ${chatHistory.length} messages from history`)
            }
          }

          // Create user message
          const userContent = typeof input === "string" ? input : JSON.stringify(input)
          const userMessage = new HumanMessage(userContent)
          const allMessages = [...chatHistory, userMessage]

          // Invoke the agent with full history
          const result = yield* Effect.tryPromise({
            try: async () => {
              return await agent.invoke({
                messages: allMessages,
                input
              })
            },
            catch: (error) => new AgentInvocationError({
              agentId,
              cause: error
            })
          })

          // Save conversation to chat history
          if (sessionId) {
            const now = new Date().toISOString()

            // Create chat messages
            const userChatMessage: ChatMessage = {
              role: "user",
              content: userContent,
              timestamp: now
            }

            const assistantChatMessage: ChatMessage = {
              role: "assistant",
              content: String(result.output || ""),
              timestamp: now
            }

            // Get existing state or create new
            const existingState = yield* daprService.getChatHistory(sessionId).pipe(
              Effect.catchAll(() => Effect.succeed(null))
            )

            const updatedState: ChatSessionState = existingState
              ? {
                  ...existingState,
                  agentId: agentId,
                  messages: [...existingState.messages, userChatMessage, assistantChatMessage],
                  updated_at: now
                }
              : {
                  sessionId: sessionId,
                  agentId: agentId,
                  messages: [userChatMessage, assistantChatMessage],
                  created_at: now,
                  updated_at: now
                }

            // Save updated chat history
            yield* daprService.saveChatHistory(sessionId, updatedState).pipe(
              Effect.catchAll((error) =>
                Effect.gen(function* () {
                  yield* Effect.logError(`Failed to save chat history: ${error}`)
                  // Don't fail the whole operation if history save fails
                })
              )
            )

            yield* Effect.logDebug(`Saved conversation to chat history`)
          }

          const response: AgentResponse = {
            agentId: agentId,
            sessionId: sessionId,
            output: result.output,
            metadata: {
              messages_count: String(result.messages?.length || 0),
              history_length: String(chatHistory.length)
            }
          }

          yield* Effect.logInfo(`Agent invocation completed: ${agentId}`)

          return response
        }),

      listAgents: Effect.gen(function* () {
        const map = yield* Ref.get(registry)
        return Array.from(map.keys())
      })
    }
  })
)
