# PubSub MCP

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Exploring pub/sub messaging as a communication strategy for Model Context Protocol (MCP) servers and AI agents.

## Table of Contents

- [About](#about)
- [Architecture](#architecture)
- [Key Features](#key-features)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Documentation](#documentation)
- [Development](#development)
- [Testing](#testing)
- [License](#license)

## About

This project explores using pub/sub messaging (via NATS JetStream and Dapr) as the communication layer between MCP servers and AI services.
Traditional MCP implementations use stdio or HTTP transports for direct client-server communication.
This project investigates whether pub/sub patterns can enable more flexible, scalable, and decoupled AI agent architectures.

**Key Questions Being Explored:**

- Can MCP tool calls be effectively routed through pub/sub messaging?
- How does async pub/sub impact LLM sampling request/response flows?
- What are the benefits and tradeoffs of decoupling MCP clients from servers via message queues?
- Can pub/sub enable multi-agent collaboration patterns with shared MCP tools?

## Architecture

The repository demonstrates a pub/sub-based MCP architecture with two main services:

```txt
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│              │         │              │         │              │
│   AI-SVC     │◄────────┤ NATS/JetStream├────────►│ readme-mcp   │
│              │         │   + Dapr     │         │  (MCP Server)│
│   LLM        │         │              │         │              │
│   Sampling   │         │  Pub/Sub     │         │  MCP Tools   │
│              │         │              │         │              │
└──────────────┘         └──────────────┘         └──────────────┘
      │                                                   │
      │                                                   │
      └─────── Tool Calls ──────────►                   │
                                                          │
      ◄─────── Tool Responses ─────────────────────────────┘
```

**Communication Patterns:**

- **Tool Requests:** `mcp-tool-requests` → readme-mcp processes → `mcp-tool-responses`
- **LLM Sampling:** readme-mcp → `ai-stream` → ai-svc (OpenAI) → `ai-stream-responses`

**Infrastructure:**

- **NATS JetStream:** Message broker for pub/sub
- **Dapr:** Service mesh for standardized pub/sub, state management
- **PostgreSQL:** State storage for Dapr
- **Docker Compose:** Local development environment

## Key Features

- **Async MCP Tool Execution:** MCP tool calls routed through pub/sub topics instead of direct HTTP/stdio
- **Decoupled Services:** AI agents and MCP servers communicate via message queues, not direct connections
- **LLM Sampling Integration:** MCP servers can request LLM sampling via pub/sub without tight coupling to AI service
- **Effect-TS Implementation:** Demonstrates functional programming patterns with Effect-TS for type-safe, composable services
- **CloudEvents Standard:** All pub/sub messages follow CloudEvents specification
- **Example MCP Server:** readme-mcp demonstrates README validation, generation, and AI-powered suggestions

## Getting Started

### Prerequisites

```bash
# Required software
Node.js >= 22.0.0
npm >= 9.0.0
Docker & Docker Compose
Dapr CLI

# Install Dapr CLI (macOS)
brew install dapr/tap/dapr-cli
dapr init
```

### Quick Start

The fastest way to get started is to follow the detailed quick start guide:

**See [ai-mcp-quickstart.md](ai-mcp-quickstart.md) for step-by-step setup instructions.**

Quick overview:

```bash
# 1. Start infrastructure (NATS, Dapr, PostgreSQL)
docker-compose -f docker-compose.ai-mcp.yml up -d

# 2. Initialize NATS stream
cd src/ai-svc
npm run init-stream

# 3. Start ai-svc with Dapr (Terminal 1)
cd src/ai-svc
npm install && npm run build
dapr run --app-id ai-svc --app-port 3004 --dapr-http-port 3500 \
  --components-path ../dapr/components.local -- npm run dev

# 4. Start readme-mcp with Dapr (Terminal 2)
cd src/mcps/readme-mcp
npm install && npm run build
dapr run --app-id readme-mcp --app-port 3005 --dapr-http-port 3502 \
  --components-path ../dapr/components.local -- npm run dev

# 5. Run integration tests (Terminal 3)
cd src/mcps/readme-mcp
export OPENAI_API_KEY=your-key-here
npm test src/__tests__/integration/
```

## Project Structure

```txt
pubsub-mcp/
├── src/
│   ├── ai-svc/                 # AI service for LLM sampling
│   │   ├── src/
│   │   ├── README.md           # Detailed ai-svc documentation
│   │   └── package.json
│   ├── mcps/
│   │   └── readme-mcp/         # MCP server for README tools
│   │       ├── src/
│   │       ├── README.md       # Detailed readme-mcp documentation
│   │       └── package.json
│   └── dapr/
│       └── components.local/   # Dapr component configurations
├── docs/
│   ├── guides/
│   │   └── effect-ts.standards.md  # Effect-TS coding standards
│   └── templates/
│       └── __README.md         # README template
├── ai-mcp-quickstart.md        # Quick start guide
├── docker-compose.ai-mcp.yml   # Local development infrastructure
└── README.md                   # This file
```

## Documentation

Detailed documentation is organized by service and topic:

### Service Documentation

- **[ai-svc README](src/ai-svc/README.md)** - AI service architecture, configuration, and deployment
- **[readme-mcp README](src/mcps/readme-mcp/README.md)** - MCP server implementation, API reference, and tool documentation

### Guides

- **[Quick Start Guide](ai-mcp-quickstart.md)** - Step-by-step setup and testing instructions
- **[Effect-TS Standards](docs/guides/effect-ts.standards.md)** - Coding standards for Effect-TS implementations

### Architecture Documentation

For detailed architecture information, see:

- MCP integration flow: [ai-mcp-quickstart.md#architecture-overview](ai-mcp-quickstart.md#architecture-overview)
- Data flow diagrams: [src/mcps/readme-mcp/README.md#architecture](src/mcps/readme-mcp/README.md#architecture)

## Development

### Code Organization

This is a monorepo-style project with independent services:

- **ai-svc:** Standalone Node.js service for LLM sampling
- **readme-mcp:** Standalone MCP server for README operations
- **dapr/components.local:** Shared Dapr component configurations

Each service has its own:

- `package.json` and dependencies
- `tsconfig.json` for TypeScript compilation
- `README.md` with service-specific documentation
- Test suite and test configuration

### Development Workflow

```bash
# Install dependencies for a service
cd src/ai-svc  # or src/mcps/readme-mcp
npm install

# Build
npm run build

# Run tests
npm test

# Run with Dapr
npm run dapr:run
```

### Adding New MCP Servers

To add a new MCP server to explore additional pub/sub patterns:

1. Create new directory under `src/mcps/your-mcp-server/`
2. Implement MCP server using `@modelcontextprotocol/sdk`
3. Integrate with Dapr pub/sub for tool requests/responses
4. Add Dapr component configuration in `src/dapr/components.local/`
5. Update docker-compose if additional infrastructure needed
6. Document in service-specific README

See [readme-mcp](src/mcps/readme-mcp) as a reference implementation.

## Testing

### Unit Tests

Each service has its own test suite:

```bash
# Test ai-svc
cd src/ai-svc
npm test

# Test readme-mcp
cd src/mcps/readme-mcp
npm test
```

### Integration Tests

Integration tests verify pub/sub communication between services:

```bash
# Ensure services are running first (see Quick Start)
cd src/mcps/readme-mcp
export OPENAI_API_KEY=your-key-here
npm test src/__tests__/integration/
```

**Integration test coverage:**

- MCP tool calls via pub/sub (validate-readme, generate-readme, check-completeness)
- LLM sampling request/response flow (suggest-improvements)
- Concurrent request handling
- Error handling and timeouts

For detailed test documentation, see [ai-mcp-quickstart.md#test-coverage](ai-mcp-quickstart.md#test-coverage).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contact

Project Link: [https://github.com/username/pubsub-mcp](https://github.com/username/pubsub-mcp)

## Acknowledgments

- [Model Context Protocol](https://modelcontextprotocol.io) - MCP specification and SDK
- [Effect-TS](https://effect.website) - Functional programming framework
- [Dapr](https://dapr.io) - Distributed application runtime
- [NATS](https://nats.io) - Cloud-native messaging system
