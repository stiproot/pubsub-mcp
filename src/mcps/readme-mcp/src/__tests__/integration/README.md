# MCP Integration Tests

Integration tests for the MCP pub/sub integration between `ai-svc` and `readme-mcp`.

## Test Coverage

### MCP Tool Tests (`mcp-pubsub.test.ts`)

Tests all 4 MCP tools via pub/sub:

- ✅ `validate-readme` - Validates README content
- ✅ `generate-readme` - Generates README from metadata
- ✅ `check-completeness` - Checks README completeness
- ✅ Error handling - Invalid arguments
- ✅ Unknown tool handling

### Sampling Integration Tests (`sampling-integration.test.ts`)

Tests the full LLM sampling round-trip:

- ✅ `suggest-improvements` - Full sampling flow with real OpenAI LLM
- ✅ Concurrent sampling requests - Multiple parallel requests

## Architecture

```txt
┌─────────────────────────────────────────────────────────────┐
│                     Test Architecture                        │
└─────────────────────────────────────────────────────────────┘

Test Client (NATS)
     │
     ├─► mcp-tool-requests ──► readme-mcp ─┐
     │                                     │
     │   ┌─────────────────────────────────┘
     │   │
     │   └──► ai-stream (sampling) ──► ai-svc ──► OpenAI
     │                                     │
     │   ┌─────────────────────────────────┘
     │   │
     └─◄─┴─ mcp-tool-responses/ai-stream-responses
```

## Prerequisites

### 1. Start Dependencies

```bash
docker-compose -f src/docker-compose.deps.yml up -d
```

This starts:

- NATS JetStream (port 4222)
- Dapr placement (port 50006)
- Dapr scheduler (port 50007)
- PostgreSQL databases
- ClickHouse

### 2. Initialize NATS Stream

```bash
cd src/mcps/readme-mcp
npm run init-stream
```

Or from ai-svc:

```bash
cd src/ai-svc
npm run init-stream
```

This creates the `ai-pubsub` stream with subjects:

- `ai-stream`
- `ai-stream-responses`
- `mcp-tool-requests`
- `mcp-tool-responses`

### 3. Set OpenAI API Key

```bash
export OPENAI_API_KEY=your-api-key-here
```

Required for sampling integration tests.

### 4. Start Services

Terminal 1: ai-svc

```bash
cd src/ai-svc
dapr run \
  --app-id ai-svc \
  --app-port 8080 \
  --dapr-http-port 3500 \
  --components-path ../dapr/components.local \
  -- npm run dev
```

Terminal 2: readme-mcp

```bash
cd src/mcps/readme-mcp
dapr run \
  --app-id readme-mcp \
  --app-port 8082 \
  --dapr-http-port 3502 \
  --components-path ../dapr/components.local \
  -- npm run dev
```

## Running Tests

### All Integration Tests

```bash
cd src/mcps/readme-mcp
npm run test:integration
```

### Specific Test File

```bash
# MCP tool tests only
npm test src/__tests__/integration/mcp-pubsub.test.ts

# Sampling tests only
npm test src/__tests__/integration/sampling-integration.test.ts
```

### Watch Mode

```bash
npm run test:watch
```

## Test Configuration

Configuration is in `src/__tests__/helpers/test-config.ts`:

```typescript
{
  natsUrl: "nats://localhost:4222",
  daprHost: "localhost",
  daprHttpPort: 3500,
  pubsubName: "ai-pubsub",
  defaultTimeout: 30000,
  samplingTimeout: 60000
}
```

Override via environment variables:

- `NATS_URL`
- `DAPR_HOST`
- `DAPR_HTTP_PORT`

## Troubleshooting

### Tests Timeout

- Ensure both ai-svc and readme-mcp are running with Dapr
- Check services are subscribed to topics: `dapr list`
- Verify stream exists: `npm run check-stream`

### Sampling Tests Fail

- Ensure `OPENAI_API_KEY` is set
- Check ai-svc logs for LLM errors
- Increase timeout if needed

### Connection Errors

- Ensure NATS is running: `docker ps | grep nats`
- Test NATS connection: `nats --server localhost:4222 server check`
- Check stream: `nats stream info ai-pubsub`

## Test Helpers

### `PubSubTestClient`

Located in `src/__tests__/helpers/pubsub-client.ts`

Methods:

- `publishToolRequest(tool, args)` - Publish MCP tool request
- `subscribeToolResponse(requestId)` - Wait for tool response
- `publishSamplingRequest(prompt)` - Publish sampling request
- `subscribeSamplingResponse(requestId)` - Wait for sampling response
- `waitForEvent(topic, predicate)` - Wait for specific event

### Example Usage

```typescript
import { createTestClient } from "../helpers/index.js"

const client = await createTestClient()

// Publish tool request
const requestId = await client.publishToolRequest("validate-readme", {
  content: "# My README",
  strictMode: false
})

// Wait for response
const response = await client.subscribeToolResponse(requestId)
console.log(response.result)

await client.disconnect()
```

## Development

### Adding New Tests

1. Create test file in `src/__tests__/integration/`
2. Import helpers: `import { createTestClient, TEST_CONFIG } from "../helpers/index.js"`
3. Follow existing patterns for setup/teardown
4. Use descriptive test names and console.log for debugging

### Debugging

- Add `console.log` statements to track message flow
- Check Dapr logs: `dapr logs --app-id ai-svc`
- Monitor NATS: `nats sub ">" --server localhost:4222`
- Use vitest UI: `npm run test:ui`

## CI/CD

These tests are designed to run in CI with services running in containers. See `.github/workflows/` for CI configuration (if applicable).

For local development, follow the manual setup above for faster iteration.
