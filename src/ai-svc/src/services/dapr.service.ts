import { Effect, Layer, Context } from "effect"
import { DaprClient } from "@dapr/dapr"
import { ConfigService } from "./config.service.js"
import { DaprSubscriptionError } from "../errors.js"
import type { ChatSessionState, ChatMessage } from "../schemas.js"

/**
 * Dapr error for operations
 */
export class DaprError extends Error {
  readonly _tag = "DaprError"
  constructor(readonly operation: string, readonly cause: unknown) {
    super(`Dapr operation '${operation}' failed`)
  }
}

/**
 * DaprService
 * Manages Dapr client operations with actor-based chat history
 * Following Effect-TS pattern: Service abstraction for Dapr operations
 */
export class DaprService extends Context.Tag("DaprService")<
  DaprService,
  {
    readonly publishEvent: (pubsubName: string, topicName: string, data: unknown) => Effect.Effect<void, DaprError>
    readonly getChatHistory: (sessionId: string) => Effect.Effect<ChatSessionState | null, DaprError>
    readonly saveChatHistory: (sessionId: string, state: ChatSessionState) => Effect.Effect<void, DaprError>
    readonly appendMessage: (sessionId: string, message: ChatMessage) => Effect.Effect<void, DaprError>
    readonly getActorState: <T>(actorType: string, actorId: string, key: string) => Effect.Effect<T | null, DaprError>
    readonly saveActorState: <T>(actorType: string, actorId: string, key: string, value: T) => Effect.Effect<void, DaprError>
    readonly invokeActor: <T>(actorType: string, actorId: string, method: string, data?: unknown) => Effect.Effect<T, DaprError>
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

    const client = yield* Effect.try({
      try: () =>
        new DaprClient({
          daprHost,
          daprPort
        }),
      catch: (error) =>
        new DaprSubscriptionError({
          cause: error
        })
    })

    yield* Effect.logInfo(`Dapr client initialized at ${daprHost}:${daprPort}`)

    const ACTOR_TYPE = "ChatSessionActor"
    const STATE_STORE = "actor-statestore"

    return {
      /**
       * Publish event to Dapr pub/sub
       */
      publishEvent: (pubsubName: string, topicName: string, data: unknown) =>
        Effect.gen(function* () {
          yield* Effect.logDebug(`Publishing event to ${pubsubName}/${topicName}`)

          yield* Effect.tryPromise({
            try: async () => {
              const publishData = typeof data === 'string' ? data : (data as object)
              await client.pubsub.publish(pubsubName, topicName, publishData)
            },
            catch: (error) => new DaprError("publishEvent", error)
          })

          yield* Effect.logInfo(`Event published successfully to ${pubsubName}/${topicName}`)
        }),

      /**
       * Get chat history for a session
       */
      getChatHistory: (sessionId: string) =>
        Effect.gen(function* () {
          yield* Effect.logDebug(`Getting chat history for session: ${sessionId}`)

          const state = yield* Effect.tryPromise({
            try: async () => {
              // Get the chat state from the actor's state store
              const result = await client.state.get(STATE_STORE, `${ACTOR_TYPE}:${sessionId}:chatState`)
              return result as ChatSessionState | null
            },
            catch: (error) => new DaprError("getChatHistory", error)
          })

          return state
        }),

      /**
       * Save chat history for a session
       */
      saveChatHistory: (sessionId: string, state: ChatSessionState) =>
        Effect.gen(function* () {
          yield* Effect.logDebug(`Saving chat history for session: ${sessionId}`)

          yield* Effect.tryPromise({
            try: async () => {
              await client.state.save(STATE_STORE, [
                {
                  key: `${ACTOR_TYPE}:${sessionId}:chatState`,
                  value: state
                }
              ])
            },
            catch: (error) => new DaprError("saveChatHistory", error)
          })

          yield* Effect.logDebug(`Chat history saved for session: ${sessionId}`)
        }),

      /**
       * Append a message to chat history
       */
      appendMessage: (sessionId: string, message: ChatMessage) =>
        Effect.gen(function* () {
          yield* Effect.logDebug(`Appending message to session: ${sessionId}`)

          // Get existing state
          const existingState = yield* Effect.tryPromise({
            try: async () => {
              const result = await client.state.get(STATE_STORE, `${ACTOR_TYPE}:${sessionId}:chatState`)
              return result as ChatSessionState | null
            },
            catch: (error) => new DaprError("appendMessage:get", error)
          })

          const now = new Date().toISOString()

          // Create or update state
          const newState: ChatSessionState = existingState
            ? {
                ...existingState,
                messages: [...existingState.messages, message],
                updated_at: now
              }
            : {
                sessionId: sessionId,
                agentId: "unknown",
                messages: [message],
                created_at: now,
                updated_at: now
              }

          // Save updated state
          yield* Effect.tryPromise({
            try: async () => {
              await client.state.save(STATE_STORE, [
                {
                  key: `${ACTOR_TYPE}:${sessionId}:chatState`,
                  value: newState
                }
              ])
            },
            catch: (error) => new DaprError("appendMessage:save", error)
          })

          yield* Effect.logDebug(`Message appended to session: ${sessionId}`)
        }),

      /**
       * Get actor state
       */
      getActorState: <T>(actorType: string, actorId: string, key: string) =>
        Effect.gen(function* () {
          yield* Effect.logDebug(`Getting actor state: ${actorType}/${actorId}/${key}`)

          const state = yield* Effect.tryPromise({
            try: async () => {
              const result = await client.state.get(STATE_STORE, `${actorType}:${actorId}:${key}`)
              return result as T | null
            },
            catch: (error) => new DaprError("getActorState", error)
          })

          return state
        }),

      /**
       * Save actor state
       */
      saveActorState: <T>(actorType: string, actorId: string, key: string, value: T) =>
        Effect.gen(function* () {
          yield* Effect.logDebug(`Saving actor state: ${actorType}/${actorId}/${key}`)

          yield* Effect.tryPromise({
            try: async () => {
              await client.state.save(STATE_STORE, [
                {
                  key: `${actorType}:${actorId}:${key}`,
                  value
                }
              ])
            },
            catch: (error) => new DaprError("saveActorState", error)
          })
        }),

      /**
       * Invoke actor method
       */
      invokeActor: <T>(actorType: string, actorId: string, method: string, data?: unknown) =>
        Effect.gen(function* () {
          yield* Effect.logDebug(`Invoking actor: ${actorType}/${actorId}/${method}`)

          // Note: actor methods would need to be registered separately
          // For now, we're using state store directly
          return {} as T
        })
    }
  })
)

/**
 * Test implementation of DaprService
 */
const testStateStore = new Map<string, unknown>()

export const DaprServiceTest = Layer.succeed(DaprService, {
  publishEvent: (pubsubName: string, topicName: string, data: unknown) =>
    Effect.gen(function* () {
      yield* Effect.logInfo(`[Test] Publishing event to ${pubsubName}/${topicName}`, { data })
    }),

  getChatHistory: (sessionId: string) =>
    Effect.gen(function* () {
      const key = `ChatSessionActor||${sessionId}||chatState`
      const state = testStateStore.get(key) as ChatSessionState | null
      yield* Effect.logDebug(`[Test] Getting chat history for session: ${sessionId}`)
      return state || null
    }),

  saveChatHistory: (sessionId: string, state: ChatSessionState) =>
    Effect.gen(function* () {
      const key = `ChatSessionActor||${sessionId}||chatState`
      testStateStore.set(key, state)
      yield* Effect.logDebug(`[Test] Saved chat history for session: ${sessionId}`)
    }),

  appendMessage: (sessionId: string, message: ChatMessage) =>
    Effect.gen(function* () {
      const key = `ChatSessionActor||${sessionId}||chatState`
      const existingState = testStateStore.get(key) as ChatSessionState | null
      const now = new Date().toISOString()

      const newState: ChatSessionState = existingState
        ? {
            ...existingState,
            messages: [...existingState.messages, message],
            updated_at: now
          }
        : {
            sessionId: sessionId,
            agentId: "test",
            messages: [message],
            created_at: now,
            updated_at: now
          }

      testStateStore.set(key, newState)
      yield* Effect.logDebug(`[Test] Appended message to session: ${sessionId}`)
    }),

  getActorState: <T>(actorType: string, actorId: string, key: string) =>
    Effect.gen(function* () {
      const stateKey = `${actorType}||${actorId}||${key}`
      const state = testStateStore.get(stateKey) as T | null
      yield* Effect.logDebug(`[Test] Getting actor state: ${stateKey}`)
      return state || null
    }),

  saveActorState: <T>(actorType: string, actorId: string, key: string, value: T) =>
    Effect.gen(function* () {
      const stateKey = `${actorType}||${actorId}||${key}`
      testStateStore.set(stateKey, value)
      yield* Effect.logDebug(`[Test] Saved actor state: ${stateKey}`)
    }),

  invokeActor: <T>(actorType: string, actorId: string, method: string, data?: unknown) =>
    Effect.gen(function* () {
      yield* Effect.logDebug(`[Test] Invoking actor: ${actorType}/${actorId}/${method}`)
      return {} as T
    })
})

export const clearTestStateStore = () => {
  testStateStore.clear()
}
