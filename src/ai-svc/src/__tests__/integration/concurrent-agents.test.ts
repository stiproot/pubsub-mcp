/**
 * Concurrent Agents Integration Test
 *
 * Tests multiple agents calling MCP tools simultaneously to ensure:
 * 1. Request/response correlation works correctly
 * 2. No message cross-contamination between sessions
 * 3. MCP bridge handles concurrent tool calls properly
 * 4. System remains stable under concurrent load
 *
 * Prerequisites:
 * 1. docker-compose -f src/docker-compose.ai-mcp.yml up -d
 * 2. npm run init-stream (from ai-svc)
 * 3. cd src/ai-svc && npm run dev:dapr (in one terminal)
 * 4. cd src/mcp-srvr && npm run dev:dapr (in another terminal)
 * 5. npm test (from ai-svc)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createTestClient, TEST_CONFIG, type AiSvcTestClient } from "../helpers/index.js"

describe("Concurrent Agents", () => {
  let client: AiSvcTestClient

  beforeAll(async () => {
    console.log("\n=== Setting up Concurrent Agents Tests ===")
    console.log("Connecting to NATS...")
    client = await createTestClient()
    console.log("Connected to NATS!")

    // Verify services are running
    const agents = await client.listAgents()
    console.log(`Available agents: ${agents.join(", ")}`)
    expect(agents.length).toBeGreaterThan(0)
  })

  afterAll(async () => {
    console.log("\n=== Cleaning up ===")
    if (client) {
      await client.disconnect()
    }
    console.log("Disconnected from NATS!")
  })

  it("should handle concurrent README agent requests", async () => {
    console.log("\n=== Test: Concurrent README Agents ===")

    const numAgents = 3
    const sessionIds: string[] = []
    const messages = [
      TEST_CONFIG.sampleReadme,
      TEST_CONFIG.minimalReadme,
      "# Another Project\n\n## Features\n- Feature 1\n- Feature 2",
    ]

    console.log(`Launching ${numAgents} concurrent agent requests...`)

    // Publish all requests concurrently
    const publishPromises = messages.map((message, index) => {
      const sessionId = `concurrent-session-${Date.now()}-${index}`
      sessionIds.push(sessionId)
      console.log(`  [${index + 1}] Session: ${sessionId}`)
      return client.publishAgentRequest("readme-agent", message, sessionId)
    })

    await Promise.all(publishPromises)
    console.log("✓ All requests published")

    // Monitor for tool requests
    console.log("\nMonitoring MCP tool activity...")
    const toolEvents = await client.monitorEvents(
      TEST_CONFIG.toolRequestTopic,
      10000 // Monitor for 10 seconds
    )

    console.log(`✓ Detected ${toolEvents.length} tool requests`)
    toolEvents.forEach((event, index) => {
      const data = event.data as any
      console.log(`  [${index + 1}] Tool: ${data.tool}, Request ID: ${data.requestId}`)
    })

    // Wait for agents to complete
    console.log("\nWaiting for agents to complete...")
    await new Promise((resolve) => setTimeout(resolve, 15000))

    // Check all chat histories
    console.log("\nRetrieving chat histories...")
    const historyPromises = sessionIds.map((sessionId) =>
      client.getChatHistory(sessionId).catch(() => null)
    )

    const histories = await Promise.all(historyPromises)
    const successfulHistories = histories.filter((h) => h !== null)

    console.log(`✓ Retrieved ${successfulHistories.length}/${numAgents} chat histories`)

    // Assertions
    expect(successfulHistories.length).toBeGreaterThan(0)

    // Verify no cross-contamination
    successfulHistories.forEach((history, index) => {
      expect(history.sessionId).toBe(sessionIds[index])
      console.log(`  [${index + 1}] Session ${history.sessionId}: ${history.messages?.length || 0} messages`)
    })

    console.log("\n✓ All concurrent agents completed independently!")
  }, TEST_CONFIG.agentTimeout * 2)

  it("should handle concurrent MCP tool calls from different agents", async () => {
    console.log("\n=== Test: Concurrent MCP Tool Calls ===")

    const tools = ["validate-readme", "check-completeness", "generate-readme"]
    const sessionIds = tools.map((tool, index) => `tool-session-${Date.now()}-${index}`)

    console.log(`Testing ${tools.length} different MCP tools concurrently...`)

    // Create different requests that will trigger different tools
    const requests = [
      {
        sessionId: sessionIds[0],
        message: `Validate this README:\n\n${TEST_CONFIG.sampleReadme}`,
        expectedTool: "validate-readme",
      },
      {
        sessionId: sessionIds[1],
        message: `Check completeness of this README:\n\n${TEST_CONFIG.minimalReadme}`,
        expectedTool: "check-completeness",
      },
      {
        sessionId: sessionIds[2],
        message: "Generate a README for a project called 'Test Project' with features A and B",
        expectedTool: "generate-readme",
      },
    ]

    // Publish all requests
    console.log("Publishing agent requests...")
    await Promise.all(
      requests.map((req) =>
        client.publishAgentRequest("readme-agent", req.message, req.sessionId)
      )
    )

    console.log("✓ All requests published")

    // Monitor tool requests
    console.log("\nMonitoring MCP tool requests...")
    const toolEvents = await client.monitorEvents(
      TEST_CONFIG.toolRequestTopic,
      15000 // Monitor for 15 seconds
    )

    console.log(`✓ Detected ${toolEvents.length} tool requests:`)

    const detectedTools = new Set<string>()
    toolEvents.forEach((event) => {
      const data = event.data as any
      detectedTools.add(data.tool)
      console.log(`  - Tool: ${data.tool}`)
    })

    // Assertions
    expect(toolEvents.length).toBeGreaterThan(0)
    console.log(`\n✓ Unique tools called: ${Array.from(detectedTools).join(", ")}`)

    // Wait for completion
    await new Promise((resolve) => setTimeout(resolve, 10000))

    // Verify histories are independent
    const histories = await Promise.all(
      sessionIds.map((sessionId) => client.getChatHistory(sessionId).catch(() => null))
    )

    const successfulHistories = histories.filter((h) => h !== null)
    console.log(`\n✓ Retrieved ${successfulHistories.length}/${requests.length} independent histories`)

    expect(successfulHistories.length).toBeGreaterThan(0)

    console.log("\n✓ Concurrent tool calls completed successfully!")
  }, TEST_CONFIG.agentTimeout * 2)

  it("should handle concurrent sampling requests", async () => {
    console.log("\n=== Test: Concurrent Sampling Requests ===")

    const numRequests = 3
    const sessionIds = Array.from(
      { length: numRequests },
      (_, i) => `sampling-session-${Date.now()}-${i}`
    )

    console.log(`Publishing ${numRequests} requests that trigger sampling...`)

    // Requests that will likely trigger suggest-improvements
    const requests = sessionIds.map((sessionId, index) => ({
      sessionId,
      message: `Suggest improvements for this README:\n\n# Project ${index + 1}\n\nBasic description.`,
    }))

    // Publish all requests
    await Promise.all(
      requests.map((req) =>
        client.publishAgentRequest("readme-agent", req.message, req.sessionId)
      )
    )

    console.log("✓ All requests published")

    // Monitor sampling requests
    console.log("\nMonitoring sampling activity...")
    const samplingEvents = await client.monitorEvents(
      TEST_CONFIG.samplingRequestTopic,
      20000 // Monitor for 20 seconds
    )

    const samplingRequests = samplingEvents.filter((e) => e.type === "sampling.request")
    console.log(`✓ Detected ${samplingRequests.length} sampling requests`)

    if (samplingRequests.length > 0) {
      samplingRequests.forEach((event, index) => {
        const data = event.data as any
        console.log(`  [${index + 1}] Request ID: ${data.requestId?.substring(0, 8)}...`)
      })
    }

    // Wait for completion
    await new Promise((resolve) => setTimeout(resolve, 15000))

    // Check histories
    const histories = await Promise.all(
      sessionIds.map((sessionId) => client.getChatHistory(sessionId).catch(() => null))
    )

    const successfulHistories = histories.filter((h) => h !== null)
    console.log(`\n✓ Retrieved ${successfulHistories.length}/${numRequests} histories`)

    // Assertions
    expect(successfulHistories.length).toBeGreaterThan(0)

    console.log("\n✓ Concurrent sampling handled successfully!")
  }, TEST_CONFIG.samplingTimeout * 2)

  it("should maintain stability under high concurrent load", async () => {
    console.log("\n=== Test: High Concurrent Load ===")

    const numAgents = 5
    console.log(`Launching ${numAgents} concurrent agents...`)

    const sessionIds = Array.from(
      { length: numAgents },
      (_, i) => `load-session-${Date.now()}-${i}`
    )

    // Mix of different request types
    const messages = [
      TEST_CONFIG.sampleReadme,
      TEST_CONFIG.minimalReadme,
      "# Project A\n\nDescription A",
      "# Project B\n\nDescription B",
      "# Project C\n\nDescription C",
    ]

    // Publish all at once
    console.log("Publishing all requests simultaneously...")
    const startTime = Date.now()

    await Promise.all(
      sessionIds.map((sessionId, index) =>
        client.publishAgentRequest("readme-agent", messages[index], sessionId)
      )
    )

    const publishTime = Date.now() - startTime
    console.log(`✓ Published ${numAgents} requests in ${publishTime}ms`)

    // Monitor system activity
    console.log("\nMonitoring system activity...")
    const monitorPromises = [
      client.monitorEvents(TEST_CONFIG.toolRequestTopic, 15000),
      client.monitorEvents(TEST_CONFIG.toolResponseTopic, 15000),
      client.monitorEvents(TEST_CONFIG.samplingRequestTopic, 15000),
    ]

    const [toolRequests, toolResponses, samplingRequests] = await Promise.all(
      monitorPromises
    )

    console.log("\nSystem Activity Summary:")
    console.log(`  - MCP Tool Requests: ${toolRequests.length}`)
    console.log(`  - MCP Tool Responses: ${toolResponses.length}`)
    console.log(`  - Sampling Requests: ${samplingRequests.filter((e) => e.type === "sampling.request").length}`)

    // Wait for all to complete
    await new Promise((resolve) => setTimeout(resolve, 20000))

    // Check histories
    const histories = await Promise.all(
      sessionIds.map((sessionId) => client.getChatHistory(sessionId).catch(() => null))
    )

    const successfulHistories = histories.filter((h) => h !== null)
    const successRate = (successfulHistories.length / numAgents) * 100

    console.log(`\n✓ Success Rate: ${successRate.toFixed(1)}% (${successfulHistories.length}/${numAgents})`)

    // Assertions
    expect(successfulHistories.length).toBeGreaterThan(0)
    expect(successRate).toBeGreaterThan(50) // At least 50% success rate

    console.log("\n✓ System remained stable under concurrent load!")
  }, TEST_CONFIG.agentTimeout * 3)
})
