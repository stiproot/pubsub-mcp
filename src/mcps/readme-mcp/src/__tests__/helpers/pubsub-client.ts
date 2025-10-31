/**
 * Pub/Sub test helper for integration tests
 * Provides utilities to publish and subscribe to NATS JetStream topics
 */

import { connect, type NatsConnection, type JsMsg } from "nats"
import { v4 as uuidv4 } from "uuid"
import { TEST_CONFIG } from "./test-config.js"

export interface CloudEvent<T = unknown> {
  specversion: string
  type: string
  source: string
  id: string
  time?: string
  datacontenttype?: string
  data: T
}

export interface McpToolRequest {
  requestId: string
  tool: string
  arguments: Record<string, unknown>
}

export interface McpToolResponse {
  requestId: string
  result?: unknown
  error?: string
}

export interface SamplingRequest {
  requestId: string
  prompt: string
  model?: string
  temperature?: number
  maxTokens?: number
  metadata?: Record<string, unknown>
}

export interface SamplingResponse {
  requestId: string
  content: string
  model: string
  tokensUsed?: number
  error?: string
}

/**
 * Pub/Sub test client
 */
export class PubSubTestClient {
  private nc: NatsConnection | null = null
  private subscriptions: Map<string, Promise<JsMsg>> = new Map()

  /**
   * Connect to NATS
   */
  async connect(): Promise<void> {
    this.nc = await connect({
      servers: TEST_CONFIG.natsUrl,
      maxReconnectAttempts: 10,
      reconnectTimeWait: 1000,
    })
  }

  /**
   * Disconnect from NATS
   */
  async disconnect(): Promise<void> {
    if (this.nc) {
      await this.nc.drain()
      await this.nc.close()
      this.nc = null
    }
  }

  /**
   * Publish a tool request to readme-mcp
   */
  async publishToolRequest(
    tool: string,
    args: Record<string, unknown>
  ): Promise<string> {
    if (!this.nc) throw new Error("Not connected to NATS")

    const requestId = uuidv4()
    const js = this.nc.jetstream()

    const cloudEvent: CloudEvent<McpToolRequest> = {
      specversion: "1.0",
      type: "mcp.tool.request",
      source: "test-client",
      id: uuidv4(),
      data: {
        requestId,
        tool,
        arguments: args,
      },
    }

    await js.publish(
      TEST_CONFIG.toolRequestTopic,
      JSON.stringify(cloudEvent)
    )

    return requestId
  }

  /**
   * Subscribe to tool responses
   */
  async subscribeToolResponse(requestId: string, timeout: number = TEST_CONFIG.defaultTimeout): Promise<McpToolResponse> {
    if (!this.nc) throw new Error("Not connected to NATS")

    const js = this.nc.jetstream()
    const consumerName = `test-consumer-${requestId}`

    // Create ephemeral consumer
    const consumer = await js.consumers.get(TEST_CONFIG.pubsubName, consumerName).catch(async () => {
      return await js.consumers.add(TEST_CONFIG.pubsubName, {
        durable_name: undefined,
        ack_policy: "explicit",
        filter_subjects: [TEST_CONFIG.toolResponseTopic],
      })
    })

    return new Promise<McpToolResponse>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Timeout waiting for tool response: ${requestId}`))
      }, timeout)

      ;(async () => {
        const messages = await consumer.consume()
        for await (const msg of messages) {
          const cloudEvent = JSON.parse(msg.string()) as CloudEvent<McpToolResponse>

          if (cloudEvent.data.requestId === requestId) {
            msg.ack()
            clearTimeout(timeoutId)
            messages.stop()
            resolve(cloudEvent.data)
            return
          }

          msg.ack()
        }
      })().catch(reject)
    })
  }

  /**
   * Publish a sampling request to ai-svc
   */
  async publishSamplingRequest(
    prompt: string,
    model: string = "azure/gpt-4.1",
    temperature: number = 0.7
  ): Promise<string> {
    if (!this.nc) throw new Error("Not connected to NATS")

    const requestId = uuidv4()
    const js = this.nc.jetstream()

    const cloudEvent: CloudEvent<SamplingRequest> = {
      specversion: "1.0",
      type: "sampling.request",
      source: "test-client",
      id: uuidv4(),
      data: {
        requestId,
        prompt,
        model,
        temperature,
        maxTokens: 2000,
        metadata: {
          test: "true",
        },
      },
    }

    await js.publish(
      TEST_CONFIG.samplingRequestTopic,
      JSON.stringify(cloudEvent)
    )

    return requestId
  }

  /**
   * Subscribe to sampling responses
   */
  async subscribeSamplingResponse(requestId: string, timeout: number = TEST_CONFIG.samplingTimeout): Promise<SamplingResponse> {
    if (!this.nc) throw new Error("Not connected to NATS")

    const js = this.nc.jetstream()
    const consumerName = `test-consumer-${requestId}`

    // Create ephemeral consumer
    const consumer = await js.consumers.get(TEST_CONFIG.pubsubName, consumerName).catch(async () => {
      return await js.consumers.add(TEST_CONFIG.pubsubName, {
        durable_name: undefined,
        ack_policy: "explicit",
        filter_subjects: [TEST_CONFIG.samplingResponseTopic],
      })
    })

    return new Promise<SamplingResponse>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Timeout waiting for sampling response: ${requestId}`))
      }, timeout)

      ;(async () => {
        const messages = await consumer.consume()
        for await (const msg of messages) {
          const cloudEvent = JSON.parse(msg.string()) as CloudEvent<SamplingResponse>

          if (cloudEvent.data.requestId === requestId) {
            msg.ack()
            clearTimeout(timeoutId)
            messages.stop()
            resolve(cloudEvent.data)
            return
          }

          msg.ack()
        }
      })().catch(reject)
    })
  }

  /**
   * Wait for a specific event type on a topic
   */
  async waitForEvent<T = unknown>(
    topic: string,
    predicate: (event: CloudEvent<T>) => boolean,
    timeout: number = TEST_CONFIG.defaultTimeout
  ): Promise<CloudEvent<T>> {
    if (!this.nc) throw new Error("Not connected to NATS")

    const js = this.nc.jetstream()
    const consumerName = `test-consumer-${uuidv4()}`

    const consumer = await js.consumers.add(TEST_CONFIG.pubsubName, {
      durable_name: undefined,
      ack_policy: "explicit",
      filter_subjects: [topic],
    })

    return new Promise<CloudEvent<T>>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Timeout waiting for event on topic: ${topic}`))
      }, timeout)

      ;(async () => {
        const messages = await consumer.consume()
        for await (const msg of messages) {
          const event = JSON.parse(msg.string()) as CloudEvent<T>

          if (predicate(event)) {
            msg.ack()
            clearTimeout(timeoutId)
            messages.stop()
            resolve(event)
            return
          }

          msg.ack()
        }
      })().catch(reject)
    })
  }
}

/**
 * Helper function to create a test client
 */
export async function createTestClient(): Promise<PubSubTestClient> {
  const client = new PubSubTestClient()
  await client.connect()
  return client
}
