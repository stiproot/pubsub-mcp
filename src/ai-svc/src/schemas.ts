import { Schema } from "@effect/schema"

/**
 * CloudEvent schema following CloudEvents specification
 * Generic schema that accepts any data payload - matches mcp-srvr
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
 * Agent request data schema
 * Contains the agentId and input data for agent invocation
 */
export const AgentRequestDataSchema = Schema.Struct({
  agentId: Schema.String,
  input: Schema.Unknown,
  sessionId: Schema.optional(Schema.String),
  metadata: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown }))
})

export type AgentRequestData = Schema.Schema.Type<typeof AgentRequestDataSchema>

/**
 * Agent response schema
 */
export const AgentResponseSchema = Schema.Struct({
  agentId: Schema.String,
  sessionId: Schema.optional(Schema.String),
  output: Schema.Unknown,
  metadata: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown }))
})

export type AgentResponse = Schema.Schema.Type<typeof AgentResponseSchema>

/**
 * Chat message schema for storing in actor state
 */
export const ChatMessageSchema = Schema.Struct({
  role: Schema.Literal("user", "assistant", "system"),
  content: Schema.String,
  timestamp: Schema.String,
  metadata: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown }))
})

export type ChatMessage = Schema.Schema.Type<typeof ChatMessageSchema>

/**
 * Chat session state schema
 */
export const ChatSessionStateSchema = Schema.Struct({
  sessionId: Schema.String,
  agentId: Schema.String,
  messages: Schema.Array(ChatMessageSchema),
  created_at: Schema.String,
  updated_at: Schema.String,
  metadata: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown }))
})

export type ChatSessionState = Schema.Schema.Type<typeof ChatSessionStateSchema>

/**
 * Sampling request schema
 * Used for LLM sampling requests from mcp-srvr
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
 * Sampling response schema
 * Used for LLM sampling responses to mcp-srvr
 */
export const SamplingResponseSchema = Schema.Struct({
  requestId: Schema.String,
  content: Schema.String,
  model: Schema.String,
  tokensUsed: Schema.optional(Schema.Number),
  error: Schema.optional(Schema.String)
})

export type SamplingResponse = Schema.Schema.Type<typeof SamplingResponseSchema>
