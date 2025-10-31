import { Data } from "effect"

/**
 * Error thrown when configuration is invalid or missing
 */
export class ConfigError extends Data.TaggedError("ConfigError")<{
  readonly field: string
  readonly cause?: unknown
}> {}

/**
 * Error thrown when an agent is not found
 */
export class AgentNotFoundError extends Data.TaggedError("AgentNotFoundError")<{
  readonly agentId: string
}> {}

/**
 * Error thrown when agent initialization fails
 */
export class AgentInitializationError extends Data.TaggedError("AgentInitializationError")<{
  readonly agentId: string
  readonly cause: unknown
}> {}

/**
 * Error thrown when agent invocation fails
 */
export class AgentInvocationError extends Data.TaggedError("AgentInvocationError")<{
  readonly agentId: string
  readonly cause: unknown
}> {}

/**
 * Error thrown when CloudEvent validation fails
 */
export class CloudEventValidationError extends Data.TaggedError("CloudEventValidationError")<{
  readonly cause: unknown
}> {}

/**
 * Error thrown when Dapr subscription fails
 */
export class DaprSubscriptionError extends Data.TaggedError("DaprSubscriptionError")<{
  readonly cause: unknown
}> {}

/**
 * Error thrown when message processing fails
 */
export class MessageProcessingError extends Data.TaggedError("MessageProcessingError")<{
  readonly messageId?: string
  readonly cause: unknown
}> {}

/**
 * Error thrown when LLM sampling fails
 */
export class SamplingError extends Data.TaggedError("SamplingError")<{
  readonly requestId: string
  readonly cause: unknown
}> {}
