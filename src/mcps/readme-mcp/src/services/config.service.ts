import { Context, Effect, Layer } from "effect"
import { ConfigError } from "../errors.js"

/**
 * Helper to get environment variable with validation
 */
const getEnv = (key: string, defaultValue?: string): Effect.Effect<string, ConfigError> =>
  Effect.gen(function* () {
    const value = process.env[key] ?? defaultValue
    if (!value) {
      return yield* Effect.fail(
        new ConfigError({
          field: key,
          message: `Environment variable ${key} is required but not set`
        })
      )
    }
    return value
  })

/**
 * Helper to get integer environment variable with validation
 */
const getEnvInt = (key: string, defaultValue?: number): Effect.Effect<number, ConfigError> =>
  Effect.gen(function* () {
    const value = process.env[key]
    if (!value) {
      if (defaultValue !== undefined) {
        return defaultValue
      }
      return yield* Effect.fail(
        new ConfigError({
          field: key,
          message: `Environment variable ${key} is required but not set`
        })
      )
    }
    const parsed = parseInt(value, 10)
    if (isNaN(parsed)) {
      return yield* Effect.fail(
        new ConfigError({
          field: key,
          message: `Environment variable ${key} must be a valid integer, got: ${value}`
        })
      )
    }
    return parsed
  })

/**
 * Configuration service interface
 */
export class ConfigService extends Context.Tag("ConfigService")<
  ConfigService,
  {
    readonly getServerPort: Effect.Effect<number, ConfigError>
    readonly getServerHost: Effect.Effect<string, ConfigError>
    readonly getDaprHost: Effect.Effect<string, ConfigError>
    readonly getDaprPort: Effect.Effect<number, ConfigError>
    readonly getDaprAppId: Effect.Effect<string, ConfigError>
    readonly getPubsubName: Effect.Effect<string, ConfigError>
    readonly getTopicName: Effect.Effect<string, ConfigError>
    readonly getTemplateUrl: Effect.Effect<string, ConfigError>
    readonly getSamplingTimeout: Effect.Effect<number, ConfigError>
  }
>() {}

/**
 * Live implementation of ConfigService
 */
export const ConfigServiceLive = Layer.succeed(ConfigService, {
  getServerPort: getEnvInt("PORT", 3005),
  getServerHost: getEnv("HOST", "0.0.0.0"),
  getDaprHost: getEnv("DAPR_HOST", "localhost"),
  getDaprPort: getEnvInt("DAPR_HTTP_PORT", 3500),
  getDaprAppId: getEnv("DAPR_APP_ID", "mcp-srvr"),
  getPubsubName: getEnv("PUBSUB_NAME", "ai-pubsub"),
  getTopicName: getEnv("TOPIC_NAME", "ai-stream"),
  getTemplateUrl: getEnv(
    "README_TEMPLATE_URL",
    "https://raw.githubusercontent.com/your-org/pubsub-mcp/main/.docs/ai/templates/README.md"
  ),
  getSamplingTimeout: getEnvInt("SAMPLING_TIMEOUT_MS", 30000)
})

/**
 * Test implementation of ConfigService
 */
export const ConfigServiceTest = Layer.succeed(ConfigService, {
  getServerPort: Effect.succeed(3005),
  getServerHost: Effect.succeed("localhost"),
  getDaprHost: Effect.succeed("localhost"),
  getDaprPort: Effect.succeed(3500),
  getDaprAppId: Effect.succeed("mcp-srvr-test"),
  getPubsubName: Effect.succeed("test-pubsub"),
  getTopicName: Effect.succeed("test-stream"),
  getTemplateUrl: Effect.succeed("https://example.com/template.md"),
  getSamplingTimeout: Effect.succeed(5000)
})
