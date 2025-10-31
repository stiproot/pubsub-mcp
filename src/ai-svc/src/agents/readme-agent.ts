import { Effect, Runtime } from "effect"
import { StateGraph, END, START, Annotation } from "@langchain/langgraph"
import { BaseMessage, HumanMessage, AIMessage } from "@langchain/core/messages"
import { ChatOpenAI } from "@langchain/openai"
import type { AgentConfig } from "../services/agent.service.js"
import type { McpBridgeService } from "../services/mcp-bridge.service.js"

/**
 * State annotation for README agent
 */
const ReadmeAgentStateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (current, newMsgs) => current.concat(newMsgs),
    default: () => []
  }),
  input: Annotation<unknown>({
    reducer: (_, newInput) => newInput,
    default: () => ({})
  }),
  output: Annotation<unknown>({
    reducer: (_, newOutput) => newOutput,
    default: () => null
  }),
  readmeContent: Annotation<string | null>({
    reducer: (_, newContent) => newContent,
    default: () => null
  }),
  validationResult: Annotation<unknown>({
    reducer: (_, newResult) => newResult,
    default: () => null
  })
})

/**
 * Creates a README agent that uses MCP tools for validation and analysis
 */
export function createReadmeAgent(
  config: AgentConfig,
  mcpBridgeRuntime: Runtime.Runtime<McpBridgeService>
) {
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

  /**
   * Extract README content from user input
   */
  async function extractReadmeNode(state: typeof ReadmeAgentStateAnnotation.State) {
    const userMessage = state.messages[state.messages.length - 1]
    const content = userMessage.content.toString()

    // Simple extraction - in production, you'd have more sophisticated parsing
    return {
      readmeContent: content
    }
  }

  /**
   * Validate README using MCP tool
   */
  async function validateReadmeNode(state: typeof ReadmeAgentStateAnnotation.State) {
    if (!state.readmeContent) {
      return {
        validationResult: { error: "No README content provided" }
      }
    }

    try {
      // Import McpBridgeService dynamically to call MCP tool
      const { McpBridgeService } = await import("../services/mcp-bridge.service.js")

      const validationResult = await Effect.runPromise(
        Effect.gen(function* () {
          const mcpBridge = yield* McpBridgeService
          return yield* mcpBridge.callTool("validate-readme", {
            content: state.readmeContent,
            strictMode: false
          })
        }).pipe(Effect.provide(mcpBridgeRuntime))
      )

      return {
        validationResult
      }
    } catch (error) {
      return {
        validationResult: {
          error: `Validation failed: ${error}`
        }
      }
    }
  }

  /**
   * Generate response using LLM with validation context
   */
  async function generateResponseNode(state: typeof ReadmeAgentStateAnnotation.State) {
    const userMessage = state.messages[state.messages.length - 1].content.toString()
    const validation = state.validationResult as any

    // Build context-aware prompt
    let prompt = `You are a README documentation expert. The user has provided the following request:\n\n${userMessage}\n\n`

    if (validation && !validation.error) {
      prompt += `I've analyzed the README and here are the validation results:\n`
      prompt += `- Valid: ${validation.valid || false}\n`
      prompt += `- Score: ${validation.score || 0}/100\n`

      if (validation.errors && validation.errors.length > 0) {
        prompt += `\nErrors found:\n`
        validation.errors.forEach((err: any) => {
          prompt += `  - ${err.section}: ${err.message} (${err.severity})\n`
        })
      }

      if (validation.warnings && validation.warnings.length > 0) {
        prompt += `\nWarnings:\n`
        validation.warnings.forEach((warn: any) => {
          prompt += `  - ${warn.section}: ${warn.message}\n`
        })
      }

      if (validation.missingSections && validation.missingSections.length > 0) {
        prompt += `\nMissing sections: ${validation.missingSections.join(", ")}\n`
      }

      prompt += `\nBased on this analysis, provide helpful feedback and suggestions for improvement.`
    } else if (validation && validation.error) {
      prompt += `Note: I encountered an issue validating the README: ${validation.error}\n\n`
      prompt += `Please provide general README improvement advice based on best practices.`
    }

    const response = await model.invoke([new HumanMessage(prompt)])

    return {
      messages: [response],
      output: response.content
    }
  }

  // Create the graph with MCP tool integration
  const workflow = new StateGraph(ReadmeAgentStateAnnotation)
    .addNode("extract", extractReadmeNode)
    .addNode("validate", validateReadmeNode)
    .addNode("respond", generateResponseNode)
    .addEdge(START, "extract")
    .addEdge("extract", "validate")
    .addEdge("validate", "respond")
    .addEdge("respond", END)

  return workflow.compile()
}
