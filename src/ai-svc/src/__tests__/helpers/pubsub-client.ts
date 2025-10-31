/**
 * Pub/Sub test helper for ai-svc integration tests
 * Provides utilities to interact with NATS JetStream topics and ai-svc HTTP endpoints
 */

import { connect, type NatsConnection, type JsMsg, AckPolicy, DeliverPolicy } from "nats"
import { v4 as uuidv4 } from "uuid"
import axios from "axios"
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

export interface AgentRequest {
  sessionId?: string
  agentId: string
  input: string
  metadata?: Record<string, unknown>
}

export interface AgentResponse {
  sessionId: string
  response: string
  metadata?: Record<string, unknown>
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

/**
 * Test client for ai-svc integration tests
 */
export class AiSvcTestClient {
  private nc: NatsConnection | null = null

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
   * Publish an agent request via Dapr pub/sub
   */
  async publishAgentRequest(
    agentId: string,
    message: string,
    sessionId: string = uuidv4()
  ): Promise<string> {
    if (!this.nc) throw new Error("Not connected to NATS")

    const js = this.nc.jetstream()

    const cloudEvent: CloudEvent<AgentRequest> = {
      specversion: "1.0",
      type: "agent.request",
      source: "test-client",
      id: uuidv4(),
      data: {
        sessionId: sessionId,
        agentId: agentId,
        input: message,
        metadata: {
          test: true,
        },
      },
    }

    await js.publish(
      TEST_CONFIG.agentTopic,
      JSON.stringify(cloudEvent)
    )

    return sessionId
  }

  /**
   * Call ai-svc HTTP endpoint directly
   */
  async callAiSvcHttp(endpoint: string, data?: unknown): Promise<any> {
    const url = `http://${TEST_CONFIG.aiSvcHost}:${TEST_CONFIG.aiSvcPort}${endpoint}`
    const response = await axios.post(url, data)
    return response.data
  }

  /**
   * Get agent list from ai-svc
   */
  async listAgents(): Promise<string[]> {
    const url = `http://${TEST_CONFIG.aiSvcHost}:${TEST_CONFIG.aiSvcPort}/agents`
    const response = await axios.get<{ agents: string[] }>(url)
    return response.data.agents
  }

  /**
   * Get chat history for a session
   */
  async getChatHistory(sessionId: string): Promise<any> {
    const url = `http://${TEST_CONFIG.aiSvcHost}:${TEST_CONFIG.aiSvcPort}/sessions/${sessionId}/history`
    try {
      const response = await axios.get(url)
      return response.data
    } catch (error: any) {
      if (error.response?.status === 404) {
        // Session not found - return null instead of throwing
        return null
      }
      throw error
    }
  }

  /**
   * Wait for MCP tool request to be published
   */
  async waitForToolRequest(
    predicate: (request: McpToolRequest) => boolean,
    timeout: number = TEST_CONFIG.defaultTimeout
  ): Promise<CloudEvent<McpToolRequest>> {
    if (!this.nc) throw new Error("Not connected to NATS")

    const js = this.nc.jetstream()
    const jsm = await this.nc.jetstreamManager()
    const consumerName = `test-consumer-${uuidv4()}`

    await jsm.consumers.add(TEST_CONFIG.pubsubName, {
      name: consumerName,
      ack_policy: AckPolicy.Explicit,
      filter_subjects: [TEST_CONFIG.toolRequestTopic],
      deliver_policy: DeliverPolicy.All,
    })

    const consumer = await js.consumers.get(TEST_CONFIG.pubsubName, consumerName)

    return new Promise<CloudEvent<McpToolRequest>>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Timeout waiting for tool request`))
      }, timeout)

      ;(async () => {
        const messages = await consumer.consume()
        for await (const msg of messages) {
          const event = JSON.parse(msg.string()) as CloudEvent<McpToolRequest>

          if (predicate(event.data)) {
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

  /**
   * Wait for any event on a topic
   */
  async waitForEvent<T = unknown>(
    topic: string,
    predicate: (event: CloudEvent<T>) => boolean,
    timeout: number = TEST_CONFIG.defaultTimeout
  ): Promise<CloudEvent<T>> {
    if (!this.nc) throw new Error("Not connected to NATS")

    const js = this.nc.jetstream()
    const jsm = await this.nc.jetstreamManager()
    const consumerName = `test-consumer-${uuidv4()}`

    await jsm.consumers.add(TEST_CONFIG.pubsubName, {
      name: consumerName,
      ack_policy: AckPolicy.Explicit,
      filter_subjects: [topic],
      deliver_policy: DeliverPolicy.All,
    })

    const consumer = await js.consumers.get(TEST_CONFIG.pubsubName, consumerName)

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

  /**
   * Monitor events on a topic for a duration
   */
  async monitorEvents<T = unknown>(
    topic: string,
    duration: number = 5000
  ): Promise<CloudEvent<T>[]> {
    if (!this.nc) throw new Error("Not connected to NATS")

    const js = this.nc.jetstream()
    const jsm = await this.nc.jetstreamManager()
    const events: CloudEvent<T>[] = []
    const consumerName = `test-monitor-${uuidv4()}`

    await jsm.consumers.add(TEST_CONFIG.pubsubName, {
      name: consumerName,
      ack_policy: AckPolicy.Explicit,
      filter_subjects: [topic],
      deliver_policy: DeliverPolicy.All,
    })

    const consumer = await js.consumers.get(TEST_CONFIG.pubsubName, consumerName)

    return new Promise<CloudEvent<T>[]>((resolve) => {
      const timeoutId = setTimeout(() => {
        resolve(events)
      }, duration)

      ;(async () => {
        const messages = await consumer.consume()
        for await (const msg of messages) {
          const event = JSON.parse(msg.string()) as CloudEvent<T>
          events.push(event)
          msg.ack()
        }
      })().catch(() => {
        clearTimeout(timeoutId)
        resolve(events)
      })
    })
  }
}

/**
 * Helper function to create a test client
 */
export async function createTestClient(): Promise<AiSvcTestClient> {
  const client = new AiSvcTestClient()
  await client.connect()
  return client
}
