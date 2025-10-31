# mcp-srvr

Model Context Protocol (MCP) server for enforcing README standards and best practices across the pubsub-mcp project.

## Service Overview

**Service Type:** MCP Server / Microservice
**Port:** 3005 (internal), 8082 (external via Nginx)
**Technology Stack:** Node.js 24, TypeScript, Express, Effect-TS, Dapr
**Database:** None (stateless service with optional Dapr state store)

### Purpose

This service implements a Model Context Protocol server that provides AI agents with tools to validate, generate, and improve README documentation.
It acts as a specialized microservice that can be consumed by AI agents to ensure README files across the project meet organizational standards.

The service integrates with the ai-svc for LLM-powered suggestions using Dapr pub/sub messaging, enabling AI-assisted README improvements while maintaining separation of concerns.

### Responsibilities

- Validate README files against predefined standards and best practices
- Generate README files from project metadata and templates
- Provide AI-powered suggestions for README improvements via ai-svc integration
- Check README completeness against required and optional sections
- Expose MCP primitives (tools, resources, prompts) for AI agent consumption
- Manage async LLM sampling requests through Dapr pub/sub

## Architecture

### Dependencies

**Internal Services:**

- `ai-svc` - Provides LLM sampling for AI-powered README improvement suggestions

**External Services:**

- `Dapr` - Service mesh for pub/sub messaging and optional state management
- `@modelcontextprotocol/sdk` - MCP protocol implementation

**Message Queues/Events:**

- Subscribes to: `ai-stream-responses` (sampling responses from ai-svc)
- Publishes: `ai-stream` (sampling requests to ai-svc)

### Data Flow

```txt
[MCP Client/AI Agent] → (HTTP/JSON-RPC) → [mcp-srvr]
                                              ↓
                                    [Effect-TS Services]
                                              ↓
                            ┌─────────────────┴─────────────────┐
                            ↓                                   ↓
                    [Validation/Generation]         [Dapr Pub/Sub]
                                                             ↓
                                                        [ai-svc]
                                                   (LLM Sampling)
```

## Getting Started

### Prerequisites

```bash
Node.js >= 24.0.0
npm >= 10.0.0
Dapr CLI (for local development with pub/sub)
```

### Local Development Setup

1. Navigate to the service directory

    ```bash
    cd src/mcp-srvr
    ```

2. Install dependencies

    ```bash
    npm install
    ```

3. Set up environment variables

    ```bash
    cp .env.example .env
    # Edit .env with service-specific configuration
    ```

4. Start the service (without Dapr)

    ```bash
    npm run dev
    ```

5. Start the service (with Dapr for full pub/sub integration)

    ```bash
    npm run dapr:run
    ```

The service will be available at:

- MCP endpoint: `http://localhost:8082/mcp/readme-standards`
- Health check: `http://localhost:8082/health`

## Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Internal service port | 3005 | No |
| `HOST` | Service bind address | 0.0.0.0 | No |
| `DAPR_HOST` | Dapr sidecar host | localhost | No |
| `DAPR_HTTP_PORT` | Dapr HTTP port | 3500 | No |
| `DAPR_APP_ID` | Dapr application ID | mcp-srvr | No |
| `PUBSUB_NAME` | Dapr pubsub component name | ai-pubsub | Yes |
| `TOPIC_NAME` | Dapr pubsub topic for ai-svc | ai-stream | Yes |
| `README_TEMPLATE_URL` | URL to README template | - | No |
| `SAMPLING_TIMEOUT_MS` | LLM sampling timeout | 30000 | No |

### Service Configuration

- `.env` - Environment variable configuration
- `tsconfig.json` - TypeScript compiler configuration
- `ecosystem.config.cjs` - PM2 process management configuration
- `nginx.conf` / `default.conf` - Nginx reverse proxy configuration

## API Documentation

### Endpoints

#### Health Check

```txt
GET /health
```

Returns service health status.

**Response:**

```json
{
  "status": "healthy",
  "service": "mcp-srvr",
  "timestamp": "2025-01-29T12:00:00.000Z"
}
```

#### MCP Server Endpoint

```txt
ALL /mcp/readme-standards
```

Model Context Protocol server endpoint using Streamable HTTP transport.

**Protocol:** JSON-RPC 2.0 over HTTP
**Transport:** Streamable HTTP (supports streaming responses)

**Client Connection Example:**

```typescript
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"

const transport = new StreamableHTTPClientTransport(
  new URL("http://localhost:8082/mcp/readme-standards")
)
await client.connect(transport)
```

#### Dapr Subscription Configuration

```txt
GET /dapr/subscribe
```

Returns Dapr pub/sub subscription configuration.

**Response:**

```json
[
  {
    "pubsubname": "ai-pubsub",
    "topic": "ai-stream-responses",
    "route": "/mcp-events"
  }
]
```

#### Dapr Event Handler

```txt
POST /mcp-events
```

Handles CloudEvents from Dapr pub/sub (sampling responses from ai-svc).

**Headers:**

- `Content-Type: application/cloudevents+json`

**Request Body (CloudEvent):**

```json
{
  "specversion": "1.0",
  "type": "mcp.sampling.response",
  "source": "ai-svc",
  "id": "unique-event-id",
  "data": {
    "requestId": "correlation-id",
    "content": "LLM generated response",
    "model": "azure/gpt-4.1",
    "tokensUsed": 150
  }
}
```

### MCP Tools

The MCP server exposes 4 tools for AI agents:

#### validate-readme

Validates README content against standards.

**Input:**

```json
{
  "content": "# My Project\n\nDescription...",
  "strictMode": false
}
```

**Output:**

```json
{
  "valid": true,
  "score": 85,
  "errors": [],
  "warnings": [{"section": "Features", "message": "Consider adding features"}],
  "missingSections": ["## Contributing"],
  "presentSections": ["# ", "## Description", "## Installation"]
}
```

#### generate-readme

Generates README from project metadata.

**Input:**

```json
{
  "name": "my-project",
  "description": "A great project",
  "features": ["Feature 1", "Feature 2"],
  "installation": "npm install",
  "usage": "npm start"
}
```

**Output:**

```json
{
  "readme": "# my-project\n\nA great project\n\n## Features..."
}
```

#### suggest-improvements

Gets AI-powered suggestions (uses ai-svc sampling).

**Input:**

```json
{
  "content": "# Project\n\nBasic description."
}
```

**Output:**

```json
{
  "suggestions": [
    {
      "section": "Installation",
      "suggestion": "Add installation instructions",
      "priority": "high",
      "reasoning": "Users need to know how to install"
    }
  ]
}
```

#### check-completeness

Checks required and optional section presence.

**Input:**

```json
{
  "content": "# My Project\n\n## Description\n\n## Installation"
}
```

**Output:**

```json
{
  "overallScore": 70,
  "requiredSections": {
    "present": ["# ", "## Description", "## Installation"],
    "missing": ["## Usage"]
  },
  "optionalSections": {
    "present": [],
    "missing": ["## Features", "## Contributing", "## License"]
  },
  "recommendations": ["Add missing required sections: ## Usage"]
}
```

### Events

#### Published Events

**`ai-stream` (sampling request)**

Published when `suggest-improvements` tool needs LLM assistance.

```json
{
  "requestId": "uuid",
  "prompt": "Analyze the following README...",
  "model": "azure/gpt-4.1",
  "temperature": 0.7,
  "maxTokens": 2000,
  "metadata": {
    "source": "mcp-srvr",
    "timestamp": "2025-01-29T12:00:00.000Z"
  }
}
```

#### Subscribed Events

**`ai-stream-responses` (sampling response)**

Receives LLM sampling responses from ai-svc with correlation to pending requests.

## Database Schema

This service is stateless and does not use a persistent database. Optional state management through Dapr state store for tracking pending sampling requests:

### State Store Keys

- `sampling-request-{requestId}` - Tracks pending LLM sampling requests (TTL: 30 seconds)

## Running Tests

```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch

# Run test UI
npm run test:ui
```

### Test Configuration

Tests use `@effect/vitest` for Effect-TS integration and support mocking of all services via test layers.

## Performance Considerations

### Scaling

- **Horizontal Scaling:** Service is stateless and can be scaled horizontally
- **Resource Requirements:** Minimum 256MB RAM, 0.2 CPU cores
- **Concurrent Requests:** Handles multiple MCP client connections simultaneously
- **Sampling Requests:** Uses Dapr pub/sub for async LLM requests (no blocking)

### Timeout Strategy

- **LLM Sampling Timeout:** 30 seconds (configurable via `SAMPLING_TIMEOUT_MS`)
- **HTTP Request Timeout:** 60 seconds (standard requests), 3600 seconds (MCP streaming)

### Rate Limiting

Rate limiting handled at infrastructure level (Nginx/API Gateway).

## Monitoring & Logging

### Metrics

Service uses Effect-TS logging. Metrics can be exposed via Prometheus integration:

- `mcp_tool_calls_total` - Total MCP tool invocations
- `mcp_tool_call_duration_seconds` - Tool call duration
- `sampling_requests_total` - LLM sampling requests
- `sampling_timeouts_total` - Sampling timeout count

### Logging

Structured Effect-TS logging to stdout:

```json
{
  "level": "info",
  "timestamp": "2025-01-29T12:00:00.000Z",
  "message": "MCP tool invoked",
  "tool": "validate-readme",
  "duration": 45
}
```

**Log Levels:**

- `logError` - Error conditions
- `logWarning` - Warning conditions
- `logInfo` - Informational messages
- `logDebug` - Debug messages (development only)

### Alerts

Key alerts to configure:

- High sampling timeout rate (>10% of requests)
- MCP tool failures (>5% error rate)
- Memory usage >80%
- Response time >2s (p95)

## Troubleshooting

### Common Issues

#### Service won't start

- Check environment variables are set correctly
- Verify port 3005/8082 not in use
- Check Node.js version >= 24.0.0

#### MCP client can't connect

- Verify MCP endpoint is accessible: `curl http://localhost:8082/health`
- Check Nginx is running (if using Docker/K8s)
- Verify firewall/network policies

#### Sampling requests timeout

- Check ai-svc is running and accessible
- Verify Dapr pub/sub is configured correctly
- Check `SAMPLING_TIMEOUT_MS` setting
- Review ai-svc logs for processing issues

#### High memory usage

- Check for memory leaks in Effect-TS services
- Review pending sampling request tracking
- Verify cleanup of completed requests

### Debug Mode

Enable debug logging:

```bash
LOG_LEVEL=debug npm run dev
```

## Development

### Code Structure

```txt
mcp-srvr/
├── src/
│   ├── services/          # Effect-TS services
│   │   ├── config.service.ts
│   │   ├── dapr.service.ts
│   │   ├── readme-validator.service.ts
│   │   ├── readme-generator.service.ts
│   │   ├── llm-client.service.ts
│   │   └── index.ts
│   ├── mcps/              # MCP server implementations
│   │   └── readme-standards-mcp.ts
│   ├── errors.ts          # Tagged error types
│   ├── schemas.ts         # @effect/schema definitions
│   └── index.ts           # Main entry point
├── k8s/                   # Kubernetes manifests
│   ├── base/
│   └── overlays/
├── dist/                  # Compiled output
├── Dockerfile
├── nginx.conf
├── default.conf
├── ecosystem.config.cjs   # PM2 config
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

### Adding New MCP Tools

1. Define tool input/output types in `mcps/readme-standards-mcp.ts`
2. Add new service in `src/services/` if needed (following Effect-TS patterns)
3. Register tool using `server.registerTool()`
4. Update README documentation
5. Add tests for new tool

### Effect-TS Standards

Follow Effect-TS coding standards documented in `.docs/guides/effect-ts.standards.md`:

- Use `Effect.gen` for business logic
- Define services with `Context.Tag`
- Implement services as `Layer`
- Use tagged errors with `Data.TaggedError`
- Validate with `@effect/schema`
- Avoid `any` types

## Deployment

### Build

```bash
# Build for production
npm run build

# Output directory: dist/
```

### Docker

```bash
# Build image
docker build -t mcp-srvr:latest .

# Run container
docker run -p 8082:8082 -p 3005:3005 --env-file .env mcp-srvr:latest
```

### Kubernetes

Service is deployed via Kubernetes manifests in `/k8s/`

```bash
# Deploy to cluster
kubectl apply -k k8s/overlays/local

# Check status
kubectl get pods -l app=mcp-srvr
kubectl logs -l app=mcp-srvr -f

# Port forward
kubectl port-forward svc/mcp-srvr 8082:8082
```

**Dapr Annotations:**

```yaml
dapr.io/enabled: "true"
dapr.io/app-id: "mcp-srvr"
dapr.io/app-port: "3005"
dapr.io/enable-api-logging: "true"
```

## Related Documentation

- [Effect-TS Standards](../../docs/guides/effect-ts.standards.md) - Effect-TS coding standards
- [ai-svc README](../ai-svc/README.md) - AI service integration

## Service-Specific Resources

- [MCP Protocol Documentation](https://modelcontextprotocol.io) - Official MCP documentation
- [Effect-TS Documentation](https://effect.website) - Effect-TS framework documentation
- [Dapr Documentation](https://docs.dapr.io) - Dapr service mesh documentation
