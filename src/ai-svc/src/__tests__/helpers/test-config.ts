/**
 * Test configuration for ai-svc integration tests
 */

export const TEST_CONFIG = {
  // ai-svc configuration
  aiSvcHost: process.env.AI_SVC_HOST || "localhost",
  aiSvcPort: parseInt(process.env.AI_SVC_PORT || "3004", 10),

  // mcp-srvr configuration (for validation)
  mcpSrvrHost: process.env.MCP_SRVR_HOST || "localhost",
  mcpSrvrPort: parseInt(process.env.MCP_SRVR_PORT || "3005", 10),

  // NATS configuration
  natsUrl: process.env.NATS_URL || "nats://localhost:4222",

  // Dapr configuration
  daprHost: process.env.DAPR_HOST || "localhost",
  daprHttpPort: parseInt(process.env.DAPR_HTTP_PORT || "3500", 10),

  // Pub/sub configuration
  pubsubName: "ai-pubsub",
  toolRequestTopic: "mcp-tool-requests",
  toolResponseTopic: "mcp-tool-responses",
  samplingRequestTopic: "ai-stream",
  samplingResponseTopic: "ai-stream-responses",
  agentTopic: "ai-stream",

  // Timeout configuration
  defaultTimeout: 30000, // 30 seconds for most operations
  samplingTimeout: 60000, // 60 seconds for LLM operations
  agentTimeout: 90000, // 90 seconds for full agent execution

  // Test data
  sampleReadme: `# Test Project

## Description
This is a test project for README validation.

## Installation
\`\`\`bash
npm install test-project
\`\`\`

## Usage
\`\`\`bash
npm start
\`\`\`

## Contributing
Pull requests are welcome.

## License
MIT
`,

  minimalReadme: `# Minimal Project

This project needs improvement.
`,
} as const
