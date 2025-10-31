/**
 * Test configuration for MCP integration tests
 * These tests validate the pub/sub integration between ai-svc and readme-mcp
 */

export const TEST_CONFIG = {
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

  // Timeout configuration
  defaultTimeout: 30000, // 30 seconds for most operations
  samplingTimeout: 60000, // 60 seconds for LLM operations

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
`
} as const
