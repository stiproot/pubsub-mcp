# AI-SVC & readme-mcp Quick Start Guide

This guide will help you quickly start and test the MCP integration between ai-svc and readme-mcp.

## Prerequisites

- Docker & Docker Compose
- Node.js >= 22.x
- Dapr CLI installed
- OpenAI API key (for sampling tests)

## Step 1: Start Dependencies

```bash
cd src
docker-compose -f docker-compose.ai-mcp.yml up -d
```

This starts:

- **NATS JetStream** (localhost:4222) - Pub/sub messaging
- **Dapr Placement** (localhost:50006) - Dapr actor placement
- **Dapr Scheduler** (localhost:50007) - Dapr workflows
- **PostgreSQL** (localhost:5435) - State storage

Verify services are running:

```bash
docker-compose -f docker-compose.ai-mcp.yml ps
```

## Step 2: Initialize NATS Stream

From either ai-svc or readme-mcp directory:

```bash
cd ai-svc
npm run init-stream
```

This creates the `ai-pubsub` stream with subjects:

- `ai-stream` - Agent requests and sampling requests
- `ai-stream-responses` - Sampling responses from ai-svc
- `mcp-tool-requests` - Tool calls from ai-svc to readme-mcp
- `mcp-tool-responses` - Tool responses from readme-mcp to ai-svc

Verify stream:

```bash
# Install nats CLI if not already installed
# brew install nats-io/nats-tools/nats

nats stream info ai-pubsub
```

## Step 3: Start AI-SVC with Dapr

Terminal 1:

```bash
cd ai-svc

# Build first
npm run build

# Start with Dapr
dapr run \
  --app-id ai-svc \
  --app-port 8080 \
  --dapr-http-port 3500 \
  --dapr-grpc-port 50001 \
  --components-path ../dapr/components.local \
  -- npm run dev
```

You should see:

- Dapr starting on HTTP port 3500
- ai-svc starting on port 3004
- Agent registration logs
- "README Agent" registered

## Step 4: Start readme-mcp with Dapr

Terminal 2:

```bash
cd readme-mcp

# Build first
npm run build

# Start with Dapr
dapr run \
  --app-id readme-mcp \
  --app-port 3005 \
  --dapr-http-port 3502 \
  --dapr-grpc-port 50002 \
  --components-path ../dapr/components.local \
  -- npm run dev
```

You should see:

- Dapr starting on HTTP port 3502
- readme-mcp starting on port 3005
- MCP server initialization logs

## Step 5: Run Integration Tests

Terminal 3:

```bash
cd readme-mcp

# Set OpenAI API key for sampling tests
export OPENAI_API_KEY=your-key-here

# Run all integration tests
npm test src/__tests__/integration/

# Or run specific test files
npm test src/__tests__/integration/mcp-pubsub.test.ts
npm test src/__tests__/integration/sampling-integration.test.ts
```

## Test Coverage

### MCP Tool Tests (mcp-pubsub.test.ts)

- ✅ validate-readme - Validates README content structure
- ✅ generate-readme - Generates README from metadata
- ✅ check-completeness - Checks README completeness score
- ✅ Error handling - Invalid arguments
- ✅ Unknown tool handling

### Sampling Integration Tests (sampling-integration.test.ts)

- ✅ suggest-improvements - Full LLM sampling round-trip
- ✅ Concurrent requests - Multiple parallel sampling requests

## Manual Testing

### Test MCP Tool via Pub/Sub

You can manually publish tool requests using the NATS CLI:

```bash
# Publish validate-readme request
nats pub mcp-tool-requests '{
  "specversion": "1.0",
  "type": "mcp.tool.request",
  "source": "manual-test",
  "id": "test-123",
  "data": {
    "requestId": "req-123",
    "tool": "validate-readme",
    "arguments": {
      "content": "# My README\n\nThis is a test.",
      "strictMode": false
    }
  }
}'

# Subscribe to responses
nats sub mcp-tool-responses
```

### Test README Agent

Send an agent request to ai-svc:

```bash
curl -X POST http://localhost:3500/v1.0/publish/ai-pubsub/ai-stream \
  -H "Content-Type: application/json" \
  -d '{
    "specversion": "1.0",
    "type": "agent.request",
    "source": "test",
    "id": "test-456",
    "data": {
      "agentId": "readme-agent",
      "input": "# Test Project\n\nAnalyze this README.",
      "sessionId": "test-session-1"
    }
  }'
```

## Troubleshooting

### Services not connecting

```bash
# Check Dapr sidecars are running
dapr list

# Should show:
# - ai-svc (HTTP: 3500, GRPC: 50001, App Port: 3004)
# - readme-mcp (HTTP: 3502, GRPC: 50002, App Port: 3005)
```

### NATS connection issues

```bash
# Check NATS is running
docker ps | grep nats

# Test NATS connection
nats --server localhost:4222 server check

# View stream
nats stream info ai-pubsub
```

### Tests timing out

- Ensure both services are running with Dapr
- Check service logs for errors
- Verify OPENAI_API_KEY is set for sampling tests
- Increase timeout in test-config.ts if needed

### Stream not found

```bash
# Re-initialize stream
cd ai-svc
npm run init-stream

# Or manually create
nats stream add ai-pubsub
```

## Cleanup

### Stop Services

```bash
# Stop ai-svc (Ctrl+C in terminal 1)
# Stop readme-mcp (Ctrl+C in terminal 2)

# Or stop all Dapr apps
dapr stop --app-id ai-svc
dapr stop --app-id readme-mcp
```

### Stop Dependencies

```bash
cd src
docker-compose -f docker-compose.ai-mcp.yml down

# Remove volumes too
docker-compose -f docker-compose.ai-mcp.yml down -v
```

## Architecture Overview

```txt
┌──────────────────────────────────────────────────────────┐
│                  MCP Integration Flow                     │
└──────────────────────────────────────────────────────────┘

Tool Call:
  ai-svc (McpBridge)
    → mcp-tool-requests (NATS)
    → readme-mcp (/mcp-tool-events)
    → readme-mcp processes tool
    → mcp-tool-responses (NATS)
    → ai-svc (McpBridge receives result)

Sampling:
  readme-mcp (LlmClient)
    → ai-stream (NATS)
    → ai-svc (/ai-events)
    → ai-svc calls OpenAI
    → ai-stream-responses (NATS)
    → readme-mcp (LlmClient receives result)
```

## Next Steps

- Review integration tests in `src/mcps/readme-mcp/src/__tests__/integration/`
- Check implementation plan: `src/ai-svc/MCP-INTEGRATION-PLAN.md`
- Explore README agent: `src/ai-svc/src/agents/readme-agent.ts`
- Add custom agents following the README agent pattern
- Create additional MCP tools in readme-mcp

## Environment Variables

### AI-SVC (.env)

```bash
PORT=3004
HOST=127.0.0.1
DAPR_HOST=localhost
DAPR_HTTP_PORT=3500
PUBSUB_NAME=ai-pubsub
TOPIC_NAME=ai-stream
OPENAI_API_KEY=your-key-here
# OPENAI_BASE_URL=https://api.openai.com/v1  # Optional: Custom OpenAI endpoint (for proxies, Azure, etc.)
```

### readme-mcp (.env)

```bash
PORT=3005
HOST=127.0.0.1
DAPR_HOST=localhost
DAPR_HTTP_PORT=3502
PUBSUB_NAME=ai-pubsub
TOPIC_NAME=ai-stream
NATS_URL=nats://localhost:4222
```
