/**
 * MCP Pub/Sub Integration Tests
 * Tests the full pub/sub integration between ai-svc and mcp-srvr
 *
 * Prerequisites:
 * 1. Run: docker-compose -f src/docker-compose.deps.yml up -d
 * 2. Run: npm run init-stream (from either ai-svc or mcp-srvr)
 * 3. Start ai-svc: cd src/ai-svc && dapr run --app-id ai-svc --app-port 8080 --dapr-http-port 3500 --components-path ../dapr/components.local -- npm run dev
 * 4. Start mcp-srvr: cd src/mcp-srvr && dapr run --app-id mcp-srvr --app-port 8082 --dapr-http-port 3502 --components-path ../dapr/components.local -- npm run dev
 * 5. Run tests: npm test
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createTestClient, TEST_CONFIG, type PubSubTestClient } from "../helpers/index.js"

describe("MCP Tools via Pub/Sub", () => {
  let client: PubSubTestClient

  beforeAll(async () => {
    console.log("Connecting to NATS...")
    client = await createTestClient()
    console.log("Connected to NATS!")
  })

  afterAll(async () => {
    console.log("Disconnecting from NATS...")
    if (client) {
      await client.disconnect()
    }
    console.log("Disconnected from NATS!")
  })

  it("should validate README via pub/sub", async () => {
    console.log("\n=== Testing validate-readme tool ===")

    // Publish tool request
    const requestId = await client.publishToolRequest("validate-readme", {
      content: TEST_CONFIG.sampleReadme,
      strictMode: false,
    })
    console.log(`Published tool request: ${requestId}`)

    // Wait for response
    console.log("Waiting for tool response...")
    const response = await client.subscribeToolResponse(requestId)
    console.log("Received tool response:", JSON.stringify(response, null, 2))

    // Assertions
    expect(response.requestId).toBe(requestId)
    expect(response.error).toBeUndefined()
    expect(response.result).toBeDefined()

    const result = response.result as any
    expect(result).toHaveProperty("valid")
    expect(result).toHaveProperty("score")
    expect(typeof result.valid).toBe("boolean")
    expect(typeof result.score).toBe("number")

    console.log(`✓ README validation: valid=${result.valid}, score=${result.score}`)
  }, TEST_CONFIG.defaultTimeout)

  it("should generate README via pub/sub", async () => {
    console.log("\n=== Testing generate-readme tool ===")

    // Publish tool request
    const requestId = await client.publishToolRequest("generate-readme", {
      name: "Test Project",
      description: "A test project for README generation",
      features: ["Feature 1", "Feature 2"],
      installation: "npm install test-project",
      usage: "npm start",
      license: "MIT",
    })
    console.log(`Published tool request: ${requestId}`)

    // Wait for response
    console.log("Waiting for tool response...")
    const response = await client.subscribeToolResponse(requestId)
    console.log("Received tool response (truncated):", JSON.stringify(response, null, 2).substring(0, 200) + "...")

    // Assertions
    expect(response.requestId).toBe(requestId)
    expect(response.error).toBeUndefined()
    expect(response.result).toBeDefined()

    const result = response.result as any
    expect(typeof result.content).toBe("string")
    expect(result.content).toContain("# Test Project")
    expect(result.content).toContain("A test project for README generation")

    console.log(`✓ README generated: ${result.content.length} characters`)
  }, TEST_CONFIG.defaultTimeout)

  it("should check completeness via pub/sub", async () => {
    console.log("\n=== Testing check-completeness tool ===")

    // Publish tool request with minimal README
    const minimalReadme = `# Minimal Project\nThis is minimal.`
    const requestId = await client.publishToolRequest("check-completeness", {
      content: minimalReadme,
    })
    console.log(`Published tool request: ${requestId}`)

    // Wait for response
    console.log("Waiting for tool response...")
    const response = await client.subscribeToolResponse(requestId)
    console.log("Received tool response:", JSON.stringify(response, null, 2))

    // Assertions
    expect(response.requestId).toBe(requestId)
    expect(response.error).toBeUndefined()
    expect(response.result).toBeDefined()

    const result = response.result as any
    expect(result).toHaveProperty("overallScore")
    expect(result).toHaveProperty("requiredSections")
    expect(typeof result.overallScore).toBe("number")
    expect(result.requiredSections).toHaveProperty("missing")
    expect(Array.isArray(result.requiredSections.missing)).toBe(true)

    console.log(`✓ Completeness check: score=${result.overallScore}, missing sections=${result.requiredSections.missing.length}`)
  }, TEST_CONFIG.defaultTimeout)

  it("should handle tool errors gracefully", async () => {
    console.log("\n=== Testing error handling ===")

    // Publish tool request with invalid arguments
    const requestId = await client.publishToolRequest("validate-readme", {
      // Missing required 'content' field
      strictMode: false,
    })
    console.log(`Published tool request with invalid args: ${requestId}`)

    // Wait for response
    console.log("Waiting for error response...")
    const response = await client.subscribeToolResponse(requestId)
    console.log("Received error response:", JSON.stringify(response, null, 2))

    // Assertions - should get an error or handle gracefully
    expect(response.requestId).toBe(requestId)
    // The response might have an error field or the result might indicate failure
    if (response.error) {
      expect(typeof response.error).toBe("string")
      console.log(`✓ Error handled: ${response.error}`)
    } else {
      // Or the service might return a result indicating validation failure
      console.log(`✓ Request handled with result:`, response.result)
    }
  }, TEST_CONFIG.defaultTimeout)

  it("should handle unknown tool requests", async () => {
    console.log("\n=== Testing unknown tool ===")

    // Publish request for non-existent tool
    const requestId = await client.publishToolRequest("nonexistent-tool", {
      foo: "bar",
    })
    console.log(`Published unknown tool request: ${requestId}`)

    // Wait for response
    console.log("Waiting for error response...")
    const response = await client.subscribeToolResponse(requestId)
    console.log("Received response:", JSON.stringify(response, null, 2))

    // Assertions
    expect(response.requestId).toBe(requestId)
    expect(response.error).toBeDefined()
    expect(response.error).toContain("Unknown tool")

    console.log(`✓ Unknown tool error: ${response.error}`)
  }, TEST_CONFIG.defaultTimeout)
})
