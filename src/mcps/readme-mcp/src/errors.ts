import { Data } from "effect"

/**
 * Configuration-related errors
 */
export class ConfigError extends Data.TaggedError("ConfigError")<{
  readonly field: string
  readonly message: string
  readonly cause?: unknown
}> {}

/**
 * Dapr client errors
 */
export class DaprError extends Data.TaggedError("DaprError")<{
  readonly operation: string
  readonly message: string
  readonly cause?: unknown
}> {}

/**
 * MCP server errors
 */
export class McpServerError extends Data.TaggedError("McpServerError")<{
  readonly operation: string
  readonly message: string
  readonly cause?: unknown
}> {}

/**
 * README validation errors
 */
export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly field: string
  readonly message: string
  readonly details?: Record<string, unknown>
}> {}

/**
 * README generation errors
 */
export class GenerationError extends Data.TaggedError("GenerationError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

/**
 * LLM client errors
 */
export class LlmClientError extends Data.TaggedError("LlmClientError")<{
  readonly operation: string
  readonly message: string
  readonly cause?: unknown
}> {}

/**
 * File system errors
 */
export class FileSystemError extends Data.TaggedError("FileSystemError")<{
  readonly path: string
  readonly operation: string
  readonly message: string
  readonly cause?: unknown
}> {}

/**
 * Timeout errors
 */
export class TimeoutError extends Data.TaggedError("TimeoutError")<{
  readonly operation: string
  readonly timeoutMs: number
  readonly message: string
}> {}

/**
 * Network errors
 */
export class NetworkError extends Data.TaggedError("NetworkError")<{
  readonly operation: string
  readonly message: string
  readonly statusCode?: number
  readonly cause?: unknown
}> {}
