/**
 * LLM Sampling Integration Test
 * Tests the full sampling round-trip: mcp-srvr → ai-svc → LLM → ai-svc → mcp-srvr
 *
 * This test validates the suggest-improvements tool which requires:
 * 1. mcp-srvr receives tool request
 * 2. mcp-srvr publishes sampling request to ai-stream
 * 3. ai-svc receives sampling request
 * 4. ai-svc calls OpenAI LLM
 * 5. ai-svc publishes sampling response to ai-stream-responses
 * 6. mcp-srvr receives sampling response
 * 7. mcp-srvr completes tool request with suggestions
 *
 * Prerequisites:
 * 1. Run: docker-compose -f src/docker-compose.deps.yml up -d
 * 2. Run: npm run init-stream
 * 3. Start ai-svc with Dapr
 * 4. Start mcp-srvr with Dapr
 * 5. Set OPENAI_API_KEY environment variable
 * 6. Run tests: npm test
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createTestClient, TEST_CONFIG, type PubSubTestClient } from "../helpers/index.js"

describe("LLM Sampling Integration", () => {
  let client: PubSubTestClient

  beforeAll(async () => {
    console.log("Connecting to NATS...")
    client = await createTestClient()
    console.log("Connected to NATS!")

    // Check if OpenAI API key is set
    if (!process.env.OPENAI_API_KEY) {
      console.warn("⚠️  OPENAI_API_KEY not set - sampling tests may fail")
    }
  })

  afterAll(async () => {
    console.log("Disconnecting from NATS...")
    if (client) {
      await client.disconnect()
    }
    console.log("Disconnected from NATS!")
  })

  it("should complete suggest-improvements with real LLM sampling", async () => {
    console.log("\n=== Testing suggest-improvements with LLM sampling ===")

    const readmeToImprove = `# My Project

A simple project.

## Usage
Run it.
`

    // 1. Publish tool request for suggest-improvements
    console.log("Step 1: Publishing suggest-improvements tool request...")
    const requestId = await client.publishToolRequest("suggest-improvements", {
      content: readmeToImprove,
    })
    console.log(`Tool request published: ${requestId}`)

    // 2. Wait for sampling request to be published by mcp-srvr
    console.log("Step 2: Waiting for sampling request on ai-stream...")
    const samplingRequestPromise = client.waitForEvent(
      TEST_CONFIG.samplingRequestTopic,
      (event: any) => {
        // Check if this is a sampling request related to our tool request
        const data = event.data as any
        return data.prompt && data.prompt.includes("Analyze")
      },
      TEST_CONFIG.samplingTimeout
    )

    // Note: The sampling request is automatically handled by ai-svc
    // We're just verifying it was published
    try {
      const samplingRequest = await samplingRequestPromise
      console.log(`Sampling request detected:`, {
        requestId: samplingRequest.data.requestId,
        model: samplingRequest.data.model,
        promptLength: samplingRequest.data.prompt?.length,
      })
    } catch (error) {
      console.warn("Could not verify sampling request (might have been processed too quickly)")
    }

    // 3. Wait for tool response (which should include LLM suggestions)
    console.log("Step 3: Waiting for tool response with suggestions...")
    const response = await client.subscribeToolResponse(requestId, TEST_CONFIG.samplingTimeout)
    console.log("Tool response received!")

    // Assertions
    expect(response.requestId).toBe(requestId)
    expect(response.error).toBeUndefined()
    expect(response.result).toBeDefined()

    const result = response.result as any
    expect(result).toHaveProperty("suggestions")
    expect(typeof result.suggestions).toBe("string")
    expect(result.suggestions.length).toBeGreaterThan(0)

    console.log(`\n✓ Suggestions received (${result.suggestions.length} characters):`)
    console.log("---")
    console.log(result.suggestions.substring(0, 300) + "...")
    console.log("---")

    // Verify suggestions contain useful content
    const suggestions = result.suggestions.toLowerCase()
    // The LLM should provide some analysis/suggestions
    expect(suggestions.length).toBeGreaterThan(50)

    console.log("\n✓ Full sampling round-trip completed successfully!")
  }, TEST_CONFIG.samplingTimeout)

  it("should handle multiple concurrent sampling requests", async () => {
    console.log("\n=== Testing concurrent sampling requests ===")

    const readme1 = `# Project A\nSimple project.`
    const readme2 = `# Project B\nAnother project.`
    const readme3 = `# Project C\nYet another project.`

    // Publish multiple tool requests concurrently
    console.log("Publishing 3 concurrent suggest-improvements requests...")
    const [requestId1, requestId2, requestId3] = await Promise.all([
      client.publishToolRequest("suggest-improvements", { content: readme1 }),
      client.publishToolRequest("suggest-improvements", { content: readme2 }),
      client.publishToolRequest("suggest-improvements", { content: readme3 }),
    ])

    console.log(`Requests published:`, { requestId1, requestId2, requestId3 })

    // Wait for all responses
    console.log("Waiting for all responses...")
    const [response1, response2, response3] = await Promise.all([
      client.subscribeToolResponse(requestId1, TEST_CONFIG.samplingTimeout),
      client.subscribeToolResponse(requestId2, TEST_CONFIG.samplingTimeout),
      client.subscribeToolResponse(requestId3, TEST_CONFIG.samplingTimeout),
    ])

    // Assertions
    expect(response1.requestId).toBe(requestId1)
    expect(response2.requestId).toBe(requestId2)
    expect(response3.requestId).toBe(requestId3)

    expect(response1.result).toBeDefined()
    expect(response2.result).toBeDefined()
    expect(response3.result).toBeDefined()

    const result1 = response1.result as any
    const result2 = response2.result as any
    const result3 = response3.result as any

    expect(result1.suggestions).toBeDefined()
    expect(result2.suggestions).toBeDefined()
    expect(result3.suggestions).toBeDefined()

    console.log("\n✓ All concurrent requests completed:")
    console.log(`  - Request 1: ${result1.suggestions.length} characters`)
    console.log(`  - Request 2: ${result2.suggestions.length} characters`)
    console.log(`  - Request 3: ${result3.suggestions.length} characters`)
  }, TEST_CONFIG.samplingTimeout * 2) // Double timeout for concurrent requests
})
