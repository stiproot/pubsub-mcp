import { Effect, Layer, Context } from "effect"
import { Schema } from "@effect/schema"
import { CloudEventSchema, AgentRequestDataSchema, type AgentResponse } from "../schemas.js"
import { CloudEventValidationError, MessageProcessingError } from "../errors.js"
import { AgentService } from "./agent.service.js"

/**
 * MessageHandlerService
 * Processes CloudEvents and invokes agents
 * Following Effect-TS pattern: Service abstraction for message handling
 */
export class MessageHandlerService extends Context.Tag("MessageHandlerService")<
  MessageHandlerService,
  {
    readonly validateCloudEvent: (data: unknown) => Effect.Effect<Schema.Schema.Type<typeof CloudEventSchema>, CloudEventValidationError>
    readonly processMessage: (data: unknown) => Effect.Effect<AgentResponse, CloudEventValidationError | MessageProcessingError>
    readonly handleMessage: (data: unknown) => Effect.Effect<AgentResponse, CloudEventValidationError | MessageProcessingError>
  }
>() {}

/**
 * Live implementation of MessageHandlerService
 */
export const MessageHandlerServiceLive = Layer.effect(
  MessageHandlerService,
  Effect.gen(function* () {
    const agentService = yield* AgentService

    return {
      validateCloudEvent: (data: unknown) =>
        Schema.decodeUnknown(CloudEventSchema)(data).pipe(
          Effect.mapError((error) => new CloudEventValidationError({ cause: error }))
        ),

      processMessage: (data: unknown) =>
        Effect.gen(function* () {
          yield* Effect.logInfo("Processing message")

          // Validate CloudEvent
          const decoded = yield* Schema.decodeUnknown(CloudEventSchema)(data).pipe(
            Effect.mapError((error) => new CloudEventValidationError({ cause: error }))
          )

          // Validate agent request data
          const agentData = yield* Schema.decodeUnknown(AgentRequestDataSchema)(decoded.data).pipe(
            Effect.mapError((error) => new CloudEventValidationError({ cause: error }))
          )

          yield* Effect.logInfo(`CloudEvent validated`, {
            id: decoded.id,
            type: decoded.type,
            agentId: agentData.agentId
          })

          // Extract agentId and input from CloudEvent data
          const { agentId, input, sessionId } = agentData

          yield* Effect.logInfo(`Invoking agent`, {
            agentId,
            sessionId,
            has_metadata: !!agentData.metadata
          })

          // Invoke the agent
          const response = yield* agentService.invokeAgent(
            agentId,
            input,
            sessionId
          ).pipe(
            Effect.mapError((error) =>
              new MessageProcessingError({
                messageId: decoded.id,
                cause: error
              })
            )
          )

          yield* Effect.logInfo(`Message processed successfully`, {
            agentId,
            sessionId,
            message_id: decoded.id
          })

          return response
        }),

      handleMessage: (data: unknown) =>
        Effect.gen(function* () {
          yield* Effect.logInfo("Processing message")

          const decoded = yield* Schema.decodeUnknown(CloudEventSchema)(data).pipe(
            Effect.mapError((error) => new CloudEventValidationError({ cause: error }))
          )

          // Validate agent request data
          const agentData = yield* Schema.decodeUnknown(AgentRequestDataSchema)(decoded.data).pipe(
            Effect.mapError((error) => new CloudEventValidationError({ cause: error }))
          )

          yield* Effect.logInfo(`CloudEvent validated`, {
            id: decoded.id,
            type: decoded.type,
            agentId: agentData.agentId
          })

          const { agentId, input, sessionId } = agentData

          yield* Effect.logInfo(`Invoking agent`, {
            agentId,
            sessionId
          })

          const response = yield* agentService.invokeAgent(
            agentId,
            input,
            sessionId
          ).pipe(
            Effect.mapError((error) =>
              new MessageProcessingError({
                messageId: decoded.id,
                cause: error
              })
            )
          )

          yield* Effect.logInfo(`Message processed successfully`, {
            agentId,
            sessionId,
            message_id: decoded.id
          })

          return response
        }).pipe(
          Effect.catchAll((error) =>
            Effect.gen(function* () {
              yield* Effect.logError("Message processing failed", {
                error: error._tag,
                cause: error
              })

              // Re-throw the error so Dapr knows it failed
              return yield* Effect.fail(error)
            })
          )
        )
    }
  })
)
