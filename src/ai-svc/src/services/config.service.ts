import { Effect, Layer, Context } from "effect"
import { ConfigError } from "../errors.js"

/**
 * ConfigService
 * Manages environment configuration for ai-svc
 * Following Effect-TS pattern: Service abstraction for configuration
 */
export class ConfigService extends Context.Tag("ConfigService")<
  ConfigService,
  {
    readonly getServerPort: Effect.Effect<number, ConfigError>
    readonly getServerHost: Effect.Effect<string, ConfigError>
    readonly getDaprHost: Effect.Effect<string, ConfigError>
    readonly getDaprPort: Effect.Effect<string, ConfigError>
    readonly getPubsubName: Effect.Effect<string, ConfigError>
    readonly getTopic: Effect.Effect<string, ConfigError>
    readonly getOpenAIApiKey: Effect.Effect<string, ConfigError>
    readonly getOpenAIBaseUrl: Effect.Effect<string | undefined, never>
    readonly getLogLevel: Effect.Effect<string, ConfigError>
  }
>() {}

/**
 * Helper to get and validate environment variable
 */
const getEnv = (key: string, defaultValue?: string): Effect.Effect<string, ConfigError> =>
  Effect.gen(function* () {
    const value = process.env[key]

    if (value !== undefined) {
      return value
    }

    if (defaultValue !== undefined) {
      return defaultValue
    }

    return yield* Effect.fail(
      new ConfigError({
        field: key,
        cause: `Environment variable ${key} is required but not set`
      })
    )
  })

/**
 * Helper to get and parse integer environment variable
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
          cause: `Environment variable ${key} is required but not set`
        })
      )
    }

    const parsed = parseInt(value, 10)
    if (isNaN(parsed)) {
      return yield* Effect.fail(
        new ConfigError({
          field: key,
          cause: `Environment variable ${key} must be a valid integer`
        })
      )
    }

    return parsed
  })

/**
 * Live implementation of ConfigService
 */
export const ConfigServiceLive = Layer.succeed(ConfigService, {
  getServerPort: getEnvInt("PORT", 3000),
  getServerHost: getEnv("HOST", "0.0.0.0"),
  getDaprHost: getEnv("DAPR_HOST", "localhost"),
  getDaprPort: getEnv("DAPR_HTTP_PORT", "3500"),
  getPubsubName: getEnv("PUBSUB_NAME", "ai-pubsub"),
  getTopic: getEnv("TOPIC", "ai-stream"),
  getOpenAIApiKey: getEnv("OPENAI_API_KEY"),
  getOpenAIBaseUrl: Effect.succeed(process.env.OPENAI_BASE_URL),
  getLogLevel: getEnv("LOG_LEVEL", "info")
})

/**
 * Test implementation of ConfigService
 */
export const ConfigServiceTest = Layer.succeed(ConfigService, {
  getServerPort: Effect.succeed(3000),
  getServerHost: Effect.succeed("localhost"),
  getDaprHost: Effect.succeed("localhost"),
  getDaprPort: Effect.succeed("3500"),
  getPubsubName: Effect.succeed("test-pubsub"),
  getTopic: Effect.succeed("test-stream"),
  getOpenAIApiKey: Effect.succeed("sk-test-key"),
  getOpenAIBaseUrl: Effect.succeed(undefined),
  getLogLevel: Effect.succeed("debug")
})
