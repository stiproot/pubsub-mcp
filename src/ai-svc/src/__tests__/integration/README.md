# AI-SVC MCP Integration Tests

Full end-to-end integration tests for ai-svc and mcp-srvr MCP integration.

## Overview

These tests validate the complete integration between ai-svc and mcp-srvr:

- **README Agent E2E** (`readme-agent-e2e.test.ts`): Tests the full flow of README agent using MCP tools
- **Concurrent Agents** (`concurrent-agents.test.ts`): Tests system stability under concurrent load

## Prerequisites

### 1. Start Infrastructure

From the repository root:

```bash
docker-compose -f src/docker-compose.ai-mcp.yml up -d
```

This starts:
- NATS JetStream (port 4222)
- PostgreSQL (port 5432)
- Dapr Placement (port 50006)
- Dapr Scheduler (port 50007)

### 2. Initialize NATS Streams

From ai-svc directory:

```bash
cd src/ai-svc
npm run init-stream
```

This creates the required NATS JetStream streams:
- `ai-pubsub` stream with subjects: `ai-stream`, `ai-stream-responses`, `mcp-tool-requests`, `mcp-tool-responses`

### 3. Start ai-svc with Dapr

In one terminal:

```bash
cd src/ai-svc
npm run dev:dapr
```

This starts ai-svc on port 3004 with Dapr sidecar on port 3500.

### 4. Start mcp-srvr with Dapr

In another terminal:

```bash
cd src/mcp-srvr
npm run dev:dapr
```

This starts mcp-srvr on port 3005 with Dapr sidecar on port 3502.

### 5. Set Environment Variables

Ensure you have:

```bash
export OPENAI_API_KEY="your-api-key"
# or add to .env file in ai-svc directory
```

## Running Tests

### Run All Integration Tests

From ai-svc directory:

```bash
npm run test:integration
```

### Run Specific Test Suite

```bash
# README Agent E2E tests only
npx vitest run src/__tests__/integration/readme-agent-e2e.test.ts

# Concurrent agents tests only
npx vitest run src/__tests__/integration/concurrent-agents.test.ts
```

### Run in Watch Mode

```bash
npm run test:watch -- src/__tests__/integration
```

### Run with UI

```bash
npm run test:ui
```

## Test Suites

### README Agent E2E Tests

Tests the complete flow of README agent interactions:

1. **Validate README using MCP tools** - Verifies agent can call validate-readme tool
2. **Handle README improvement suggestions** - Tests suggest-improvements with LLM sampling
3. **Multiple sections validation** - Tests check-completeness tool
4. **Agent list HTTP endpoint** - Verifies agent registration

**Timeout:** 90 seconds per test

### Concurrent Agents Tests

Tests system behavior under concurrent load:

1. **Concurrent README agent requests** - 3 agents running simultaneously
2. **Concurrent MCP tool calls** - Different tools called at the same time
3. **Concurrent sampling requests** - Multiple LLM requests in parallel
4. **High concurrent load** - 5 agents with system stability checks

**Timeout:** 120-180 seconds per test

## Expected Output

Successful test run:

```
✓ src/__tests__/integration/readme-agent-e2e.test.ts (4)
  ✓ README Agent End-to-End (4)
    ✓ should validate README using MCP tools end-to-end
    ✓ should handle README improvement suggestions with LLM sampling
    ✓ should handle multiple README sections validation
    ✓ should retrieve agent list via HTTP

✓ src/__tests__/integration/concurrent-agents.test.ts (4)
  ✓ Concurrent Agents (4)
    ✓ should handle concurrent README agent requests
    ✓ should handle concurrent MCP tool calls from different agents
    ✓ should handle concurrent sampling requests
    ✓ should maintain stability under high concurrent load

Test Files  2 passed (2)
Tests  8 passed (8)
```

## Troubleshooting

### Tests timing out

**Cause:** Services not running or not responding

**Solution:**
1. Check both ai-svc and mcp-srvr are running with `ps aux | grep dapr`
2. Check logs for errors in service terminals
3. Verify NATS is accessible: `curl http://localhost:8222/healthz`
4. Restart services if needed

### "Connection refused" errors

**Cause:** Infrastructure not started

**Solution:**
1. Verify docker-compose is running: `docker-compose -f src/docker-compose.ai-mcp.yml ps`
2. Check all containers are healthy
3. Restart docker-compose if needed

### "Stream not found" errors

**Cause:** NATS streams not initialized

**Solution:**
1. Run `npm run init-stream` from ai-svc directory
2. Verify streams exist: `npm run check-stream`

### "Agent not found" errors

**Cause:** ai-svc not fully started

**Solution:**
1. Wait 5-10 seconds after starting ai-svc
2. Check ai-svc logs for "🎉 AI Service running" message
3. Verify agents registered with: `curl http://localhost:3004/agents`

### LLM sampling tests failing

**Cause:** OpenAI API key not set or invalid

**Solution:**
1. Set OPENAI_API_KEY environment variable
2. Or add to `.env` file in ai-svc directory
3. Restart ai-svc after setting

### Tool requests not detected

**Cause:** Agent may complete too quickly or use cached responses

**Solution:**
- This is expected behavior - tests will pass even if monitoring doesn't capture every event
- Check chat history to verify agent completed successfully

## Architecture

```
┌─────────────┐                    ┌──────────────┐
│  Test       │                    │  ai-svc      │
│  Client     │ ─── pub/sub ────→ │  (port 3004) │
│             │                    │              │
│  NATS       │                    │  Dapr 3500   │
│  Direct     │                    └──────────────┘
│  Access     │                           │
│             │                    mcp-tool-requests
│             │                           │
│             │                           ↓
│             │                    ┌──────────────┐
│             │ ←── monitoring ─── │  mcp-srvr    │
│             │                    │  (port 3005) │
│             │                    │              │
└─────────────┘                    │  Dapr 3502   │
                                   └──────────────┘
```

## Configuration

Test configuration is in `src/__tests__/helpers/test-config.ts`:

- **Timeouts:**
  - Default: 30s
  - Sampling: 60s
  - Agent: 90s

- **Ports:**
  - ai-svc: 3004
  - mcp-srvr: 3005
  - Dapr (ai-svc): 3500
  - Dapr (mcp-srvr): 3502
  - NATS: 4222

- **Topics:**
  - Tool requests: `mcp-tool-requests`
  - Tool responses: `mcp-tool-responses`
  - Sampling requests: `ai-stream`
  - Sampling responses: `ai-stream-responses`

## CI/CD Integration

To run in CI/CD:

```bash
# Start infrastructure
docker-compose -f src/docker-compose.ai-mcp.yml up -d

# Wait for services to be healthy
sleep 10

# Initialize streams
cd src/ai-svc && npm run init-stream

# Start services in background
npm run dev:dapr &
AI_PID=$!

cd ../mcp-srvr && npm run dev:dapr &
MCP_PID=$!

# Wait for services to initialize
sleep 15

# Run tests
cd ../ai-svc && npm run test:integration

# Cleanup
kill $AI_PID $MCP_PID
docker-compose -f src/docker-compose.ai-mcp.yml down
```

## Further Reading

- [MCP Integration Plan](../../MCP-INTEGRATION-PLAN.md)
- [ai-svc README](../../README.md)
- [mcp-srvr README](../../../mcp-srvr/README.md)
