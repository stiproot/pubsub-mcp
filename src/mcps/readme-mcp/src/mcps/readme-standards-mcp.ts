import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { Effect, Runtime } from "effect"
import type { ReadmeValidatorService } from "../services/readme-validator.service.js"
import type { ReadmeGeneratorService } from "../services/readme-generator.service.js"
import type { LlmClientService } from "../services/llm-client.service.js"

/**
 * Tool input types
 */
type ValidateReadmeInput = {
  content: string
  strictMode?: boolean
}

type GenerateReadmeInput = {
  name: string
  description: string
  features?: string[]
  installation?: string
  usage?: string
  configuration?: Record<string, string>
  contributing?: string
  license?: string
  authors?: string[]
  dependencies?: string[]
}

type SuggestImprovementsInput = {
  content: string
}

type CheckCompletenessInput = {
  content: string
}

type AnalyzeReadmeArgs = {
  readme_content: string
}

type ImproveSectionArgs = {
  section_name: string
  current_content: string
}

/**
 * Create README Standards MCP Server
 */
export const createReadmeStandardsMcp = (
  runtime: Runtime.Runtime<
    ReadmeValidatorService | ReadmeGeneratorService | LlmClientService
  >
) => {
  const server = new McpServer(
    {
      name: "readme-standards",
      description: "MCP server for enforcing README standards and best practices",
      version: "1.0.0"
    },
    {
      capabilities: {
        tools: {},
        resources: {
          subscribe: true,
          listChanged: true
        },
        prompts: {},
        logging: {},
        sampling: {} // Server can request LLM sampling from clients
      }
    }
  )

  // ===== MCP TOOLS (Server Primitives) =====

  /**
   * Tool 1: validate-readme
   * Validates README content against standards
   */
  server.registerTool(
    "validate-readme",
    {
      title: "Validate README",
      description: "Validate README content against standards and best practices",
      inputSchema: {
        content: z.string().describe("The README content to validate"),
        strictMode: z.boolean().optional().describe("Enable strict validation mode")
      },
      outputSchema: {
        valid: z.boolean(),
        score: z.number(),
        errors: z.array(z.object({
          section: z.string(),
          message: z.string(),
          severity: z.enum(["error", "warning", "info"])
        })),
        warnings: z.array(z.object({
          section: z.string(),
          message: z.string()
        })),
        missingSections: z.array(z.string()),
        presentSections: z.array(z.string())
      }
    },
    async ({ content, strictMode = false }: ValidateReadmeInput) => {
      const { ReadmeValidatorService } = await import("../services/index.js")

      const program = Effect.gen(function* () {
        const validator = yield* ReadmeValidatorService
        return yield* validator.validate(content, strictMode)
      })

      const result = await Runtime.runPromise(runtime)(program)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        structuredContent: result
      }
    }
  )

  /**
   * Tool 2: generate-readme
   * Generate README from template and metadata
   */
  server.registerTool(
    "generate-readme",
    {
      title: "Generate README",
      description: "Generate a complete README from project metadata",
      inputSchema: {
        name: z.string().describe("Project name"),
        description: z.string().describe("Project description"),
        features: z.array(z.string()).optional().describe("List of features"),
        installation: z.string().optional().describe("Installation instructions"),
        usage: z.string().optional().describe("Usage examples"),
        configuration: z.record(z.string()).optional().describe("Configuration variables"),
        contributing: z.string().optional().describe("Contributing guidelines"),
        license: z.string().optional().describe("License information"),
        authors: z.array(z.string()).optional().describe("List of authors"),
        dependencies: z.array(z.string()).optional().describe("Key dependencies")
      },
      outputSchema: {
        readme: z.string().describe("Generated README content")
      }
    },
    async (input: GenerateReadmeInput) => {
      const { ReadmeGeneratorService } = await import("../services/index.js")

      const program = Effect.gen(function* () {
        const generator = yield* ReadmeGeneratorService
        return yield* generator.generate(input)
      })

      const readme = await Runtime.runPromise(runtime)(program)
      return {
        content: [{ type: 'text' as const, text: readme }],
        structuredContent: { readme }
      }
    }
  )

  /**
   * Tool 3: suggest-improvements
   * Use LLM sampling to suggest README improvements
   */
  server.registerTool(
    "suggest-improvements",
    {
      title: "Suggest Improvements",
      description: "Get AI-powered suggestions for improving your README",
      inputSchema: {
        content: z.string().describe("Current README content")
      },
      outputSchema: {
        suggestions: z.array(z.object({
          section: z.string(),
          suggestion: z.string(),
          priority: z.enum(["high", "medium", "low"]),
          reasoning: z.string()
        }))
      }
    },
    async ({ content }: SuggestImprovementsInput) => {
      const { LlmClientService } = await import("../services/index.js")

      const prompt = `Analyze the following README and suggest 3-5 improvements. Focus on completeness, clarity, and best practices.

README Content:
\`\`\`markdown
${content}
\`\`\`

Please provide suggestions in JSON format:
{
  "suggestions": [
    {
      "section": "section name",
      "suggestion": "specific improvement",
      "priority": "high|medium|low",
      "reasoning": "why this matters"
    }
  ]
}`

      const program = Effect.gen(function* () {
        const llmClient = yield* LlmClientService
        const response = yield* llmClient.sample(prompt, "azure/gpt-4.1", 0.7)

        // Try to parse JSON response
        try {
          const parsed = JSON.parse(response)
          return parsed.suggestions || []
        } catch {
          // If not valid JSON, return a single suggestion
          return [{
            section: "General",
            suggestion: response.substring(0, 500),
            priority: "medium" as const,
            reasoning: "AI-generated suggestion"
          }]
        }
      })

      const suggestions = await Runtime.runPromise(runtime)(program)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ suggestions }) }],
        structuredContent: { suggestions }
      }
    }
  )

  /**
   * Tool 4: check-completeness
   * Check README completeness against standards
   */
  server.registerTool(
    "check-completeness",
    {
      title: "Check Completeness",
      description: "Check which required and optional sections are present",
      inputSchema: {
        content: z.string().describe("README content to check")
      },
      outputSchema: {
        overallScore: z.number(),
        requiredSections: z.object({
          present: z.array(z.string()),
          missing: z.array(z.string())
        }),
        optionalSections: z.object({
          present: z.array(z.string()),
          missing: z.array(z.string())
        }),
        recommendations: z.array(z.string())
      }
    },
    async ({ content }: CheckCompletenessInput) => {
      const { ReadmeValidatorService } = await import("../services/index.js")

      const program = Effect.gen(function* () {
        const validator = yield* ReadmeValidatorService
        return yield* validator.checkCompleteness(content)
      })

      const result = await Runtime.runPromise(runtime)(program)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        structuredContent: result
      }
    }
  )

  // Note: Resources and Prompts are commented out due to MCP SDK version compatibility
  // These can be enabled once the SDK API is confirmed

  // TODO: Implement MCP Resources when SDK signatures are confirmed
  // - readme://template
  // - readme://rules

  // TODO: Implement MCP Prompts when SDK signatures are confirmed
  // - analyze-readme
  // - improve-section

  return server
}
