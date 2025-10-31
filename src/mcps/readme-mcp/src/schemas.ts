import { Schema } from "@effect/schema"

/**
 * CloudEvents schema for Dapr pub/sub
 */
export const CloudEventSchema = Schema.Struct({
  specversion: Schema.String,
  type: Schema.String,
  source: Schema.String,
  id: Schema.String,
  time: Schema.optional(Schema.String),
  datacontenttype: Schema.optional(Schema.String),
  data: Schema.Unknown,
  topic: Schema.optional(Schema.String),
  pubsubname: Schema.optional(Schema.String),
  traceid: Schema.optional(Schema.String),
  traceparent: Schema.optional(Schema.String),
  tracestate: Schema.optional(Schema.String)
})

export type CloudEvent = Schema.Schema.Type<typeof CloudEventSchema>

/**
 * Sampling request sent to ai-svc
 */
export const SamplingRequestSchema = Schema.Struct({
  requestId: Schema.String,
  prompt: Schema.String,
  model: Schema.optional(Schema.String),
  temperature: Schema.optional(Schema.Number),
  maxTokens: Schema.optional(Schema.Number),
  metadata: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown }))
})

export type SamplingRequest = Schema.Schema.Type<typeof SamplingRequestSchema>

/**
 * Sampling response from ai-svc
 */
export const SamplingResponseSchema = Schema.Struct({
  requestId: Schema.String,
  content: Schema.String,
  model: Schema.String,
  tokensUsed: Schema.optional(Schema.Number),
  finishReason: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String)
})

export type SamplingResponse = Schema.Schema.Type<typeof SamplingResponseSchema>

/**
 * README validation result
 */
export const ValidationResultSchema = Schema.Struct({
  valid: Schema.Boolean,
  score: Schema.Number,
  errors: Schema.Array(Schema.Struct({
    section: Schema.String,
    message: Schema.String,
    severity: Schema.Literal("error", "warning", "info")
  })),
  warnings: Schema.Array(Schema.Struct({
    section: Schema.String,
    message: Schema.String
  })),
  missingSections: Schema.Array(Schema.String),
  presentSections: Schema.Array(Schema.String)
})

export type ValidationResult = Schema.Schema.Type<typeof ValidationResultSchema>

/**
 * README generation input
 */
export const GenerateReadmeInputSchema = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
  features: Schema.optional(Schema.Array(Schema.String)),
  installation: Schema.optional(Schema.String),
  usage: Schema.optional(Schema.String),
  configuration: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
  contributing: Schema.optional(Schema.String),
  license: Schema.optional(Schema.String),
  authors: Schema.optional(Schema.Array(Schema.String)),
  dependencies: Schema.optional(Schema.Array(Schema.String))
})

export type GenerateReadmeInput = Schema.Schema.Type<typeof GenerateReadmeInputSchema>

/**
 * README improvement suggestion
 */
export const ImprovementSuggestionSchema = Schema.Struct({
  section: Schema.String,
  suggestion: Schema.String,
  priority: Schema.Literal("high", "medium", "low"),
  reasoning: Schema.String
})

export type ImprovementSuggestion = Schema.Schema.Type<typeof ImprovementSuggestionSchema>

/**
 * Completeness check result
 */
export const CompletenessCheckSchema = Schema.Struct({
  overallScore: Schema.Number,
  requiredSections: Schema.Struct({
    present: Schema.Array(Schema.String),
    missing: Schema.Array(Schema.String)
  }),
  optionalSections: Schema.Struct({
    present: Schema.Array(Schema.String),
    missing: Schema.Array(Schema.String)
  }),
  recommendations: Schema.Array(Schema.String)
})

export type CompletenessCheck = Schema.Schema.Type<typeof CompletenessCheckSchema>

/**
 * README template structure
 */
export const ReadmeTemplateSchema = Schema.Struct({
  sections: Schema.Array(Schema.Struct({
    name: Schema.String,
    required: Schema.Boolean,
    description: Schema.String,
    placeholder: Schema.optional(Schema.String)
  }))
})

export type ReadmeTemplate = Schema.Schema.Type<typeof ReadmeTemplateSchema>

/**
 * MCP Tool Request from ai-svc
 */
export const McpToolRequestSchema = Schema.Struct({
  requestId: Schema.String,
  tool: Schema.String,
  arguments: Schema.Record({ key: Schema.String, value: Schema.Unknown })
})

export type McpToolRequest = Schema.Schema.Type<typeof McpToolRequestSchema>

/**
 * MCP Tool Response to ai-svc
 */
export const McpToolResponseSchema = Schema.Struct({
  requestId: Schema.String,
  result: Schema.optional(Schema.Unknown),
  error: Schema.optional(Schema.String)
})

export type McpToolResponse = Schema.Schema.Type<typeof McpToolResponseSchema>
