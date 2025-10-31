import { Context, Effect, Layer } from "effect"
import { DaprClient } from "@dapr/dapr"
import { ConfigService } from "./config.service.js"
import { DaprError } from "../errors.js"

/**
 * DaprService interface
 */
export class DaprService extends Context.Tag("DaprService")<
  DaprService,
  {
    readonly publishEvent: (
      pubsubName: string,
      topicName: string,
      data: unknown
    ) => Effect.Effect<void, DaprError>
    readonly getState: (
      storeName: string,
      key: string
    ) => Effect.Effect<unknown | undefined, DaprError>
    readonly setState: (
      storeName: string,
      key: string,
      value: unknown
    ) => Effect.Effect<void, DaprError>
    readonly deleteState: (
      storeName: string,
      key: string
    ) => Effect.Effect<void, DaprError>
  }
>() {}

/**
 * Live implementation of DaprService
 */
export const DaprServiceLive = Layer.effect(
  DaprService,
  Effect.gen(function* () {
    const config = yield* ConfigService
    const daprHost = yield* config.getDaprHost
    const daprPort = yield* config.getDaprPort

    const client = new DaprClient({ daprHost, daprPort: daprPort.toString() })

    yield* Effect.logInfo(`Dapr client initialized`, { daprHost, daprPort })

    return {
      publishEvent: (pubsubName: string, topicName: string, data: unknown) =>
        Effect.gen(function* () {
          yield* Effect.logDebug(`Publishing event to ${pubsubName}/${topicName}`)
          yield* Effect.tryPromise({
            try: async () => {
              const publishData = typeof data === 'string' ? data : (data as object)
              await client.pubsub.publish(pubsubName, topicName, publishData)
            },
            catch: (error) =>
              new DaprError({
                operation: "publishEvent",
                message: `Failed to publish event to ${pubsubName}/${topicName}`,
                cause: error
              })
          })
          yield* Effect.logInfo(`Event published successfully`, { pubsubName, topicName })
        }),

      getState: (storeName: string, key: string) =>
        Effect.gen(function* () {
          yield* Effect.logDebug(`Getting state`, { storeName, key })
          const result = yield* Effect.tryPromise({
            try: async () => {
              const value = await client.state.get(storeName, key)
              return value as unknown
            },
            catch: (error) =>
              new DaprError({
                operation: "getState",
                message: `Failed to get state from ${storeName}/${key}`,
                cause: error
              })
          })
          return result
        }),

      setState: (storeName: string, key: string, value: unknown) =>
        Effect.gen(function* () {
          yield* Effect.logDebug(`Setting state`, { storeName, key })
          yield* Effect.tryPromise({
            try: async () => await client.state.save(storeName, [{ key, value }]),
            catch: (error) =>
              new DaprError({
                operation: "setState",
                message: `Failed to set state in ${storeName}/${key}`,
                cause: error
              })
          })
          yield* Effect.logInfo(`State saved successfully`, { storeName, key })
        }),

      deleteState: (storeName: string, key: string) =>
        Effect.gen(function* () {
          yield* Effect.logDebug(`Deleting state`, { storeName, key })
          yield* Effect.tryPromise({
            try: async () => await client.state.delete(storeName, key),
            catch: (error) =>
              new DaprError({
                operation: "deleteState",
                message: `Failed to delete state from ${storeName}/${key}`,
                cause: error
              })
          })
          yield* Effect.logInfo(`State deleted successfully`, { storeName, key })
        })
    }
  })
)

/**
 * Test implementation of DaprService with in-memory state
 */
export const DaprServiceTest = Layer.succeed(DaprService, {
  publishEvent: (pubsubName: string, topicName: string, data: unknown) =>
    Effect.gen(function* () {
      yield* Effect.logInfo(`[TEST] Publishing event`, { pubsubName, topicName, data })
    }),

  getState: (storeName: string, key: string) =>
    Effect.gen(function* () {
      yield* Effect.logInfo(`[TEST] Getting state`, { storeName, key })
      return undefined
    }),

  setState: (storeName: string, key: string, value: unknown) =>
    Effect.gen(function* () {
      yield* Effect.logInfo(`[TEST] Setting state`, { storeName, key, value })
    }),

  deleteState: (storeName: string, key: string) =>
    Effect.gen(function* () {
      yield* Effect.logInfo(`[TEST] Deleting state`, { storeName, key })
    })
})
