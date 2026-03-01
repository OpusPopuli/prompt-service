# Opus Populi Prompt Service

Private AI Prompt Service for the Opus Populi civic technology platform. This service owns all AI prompt templates and serves them via authenticated API to federated nodes.

**This is a private repository.** Prompt templates are proprietary intellectual property — the quality and neutrality guarantees that make the federated network trustworthy. See [SECURITY.md](SECURITY.md) for the trust model.

## Why a Separate Service?

Opus Populi is open source. The analysis pipeline, scraping framework, and frontend are all publicly auditable. But prompt templates are private because:

- **Consistency**: Every federated node gets identical prompts, ensuring uniform analysis quality
- **Integrity**: Nodes cannot modify prompts to bias analysis results
- **Quality**: Prompts can be improved continuously without disrupting the network
- **Anti-gaming**: Studying prompt internals would allow adversaries to craft documents that exploit analysis patterns

The open-source `prompt-client` package in the main repo already supports remote mode — when `PROMPT_SERVICE_URL` is configured, it delegates to this service instead of reading templates from its local database.

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm
- PostgreSQL 17+ (or use Docker)

### With Docker (recommended)

```bash
docker compose up -d
```

This starts PostgreSQL on port 5433 and the service on port 3200. The service automatically runs migrations on startup.

Seed the templates:

```bash
# Copy env for local CLI tools
cp .env.example .env

# Generate Prisma client locally (needed for seed script)
pnpm install
pnpm db:generate

# Seed all 13 prompt templates
pnpm db:seed
```

### Without Docker

```bash
# Install dependencies
pnpm install

# Configure environment
cp .env.example .env
# Edit .env with your PostgreSQL connection string

# Generate Prisma client and run migrations
pnpm db:generate
pnpm db:migrate

# Seed prompt templates
pnpm db:seed

# Start in development mode
pnpm start:dev
```

### Verify it works

```bash
# Health check (no auth required)
curl http://localhost:3200/health

# Fetch a prompt (requires API key)
curl -X POST http://localhost:3200/prompts/document-analysis \
  -H "Authorization: Bearer dev-key-1" \
  -H "Content-Type: application/json" \
  -d '{"documentType": "petition", "text": "We the people request..."}'
```

## API Endpoints

### Prompt Serving (Node API Key)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Service health check (no auth) |
| `POST` | `/prompts/structural-analysis` | Web scraping extraction prompt |
| `POST` | `/prompts/document-analysis` | Document analysis prompt |
| `POST` | `/prompts/rag` | RAG answer generation prompt |
| `POST` | `/prompts/verify` | Verify a prompt hash is authentic |

### Admin: Template Management (Admin API Key)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/templates` | List templates (with optional filters) |
| `GET` | `/admin/templates/:id` | Get template with version history |
| `POST` | `/admin/templates` | Create new template |
| `PATCH` | `/admin/templates/:id` | Update template (auto-versions) |
| `DELETE` | `/admin/templates/:id` | Soft-delete template |
| `POST` | `/admin/templates/:id/rollback` | Rollback to previous version |

### Admin: A/B Experiments (Admin API Key)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/admin/experiments` | Create experiment (draft) |
| `GET` | `/admin/experiments` | List all experiments |
| `GET` | `/admin/experiments/:id` | Get experiment details |
| `POST` | `/admin/experiments/:id/activate` | Activate experiment |
| `POST` | `/admin/experiments/:id/stop` | Stop experiment |

### Admin: Node Registry (Admin API Key)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/admin/nodes` | Register a new node (generates API key) |
| `GET` | `/admin/nodes` | List nodes (filter by region, status) |
| `GET` | `/admin/nodes/health` | Node health dashboard |
| `GET` | `/admin/nodes/:id` | Get node details with audit log |
| `PATCH` | `/admin/nodes/:id` | Update node metadata |
| `POST` | `/admin/nodes/:id/certify` | Certify node (enable API key) |
| `POST` | `/admin/nodes/:id/decertify` | Decertify node (revoke access) |
| `POST` | `/admin/nodes/:id/recertify` | Renew certification |
| `POST` | `/admin/nodes/:id/rotate-key` | Rotate node API key |
| `DELETE` | `/admin/nodes/:id` | Delete node |

Interactive API docs are available at `http://localhost:3200/api` (Swagger UI).

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `API_KEYS` | Yes | — | Comma-separated `region:key` pairs (e.g., `ca:key-1,tx:key-2`) |
| `ADMIN_API_KEYS` | Yes | — | Comma-separated admin API keys |
| `PROMPT_TTL_SECONDS` | No | `3600` | Prompt expiry TTL in seconds (nodes must re-fetch after) |
| `PORT` | No | `3200` | Server port |

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm start:dev` | Start with hot reload |
| `pnpm start:prod` | Start production build |
| `pnpm build` | Compile TypeScript |
| `pnpm test` | Run unit tests |
| `pnpm test:cov` | Run tests with coverage |
| `pnpm lint` | Lint and auto-fix |
| `pnpm db:generate` | Generate Prisma client |
| `pnpm db:migrate` | Create and run migrations |
| `pnpm db:migrate:deploy` | Run pending migrations (production) |
| `pnpm db:seed` | Seed all 13 prompt templates |
| `pnpm db:studio` | Open Prisma Studio GUI |
| `pnpm integration:up` | Start integration test stack (Docker) |
| `pnpm integration:down` | Tear down integration test stack |
| `pnpm test:integration` | Run integration tests (requires stack running) |
| `pnpm test:integration:docker` | Run full integration test suite in Docker |

## Project Structure

```
prompt-service/
├── prisma/
│   ├── schema.prisma          # Database schema (templates, versions, experiments)
│   └── seed.ts                # Seeds all 13 prompt templates
├── src/
│   ├── auth/
│   │   ├── api-key.guard.ts   # Node API key validation (env + DB node keys)
│   │   └── admin-key.guard.ts # Admin API key validation
│   ├── common/
│   │   ├── prisma.module.ts   # Global Prisma provider
│   │   └── prisma.service.ts  # Prisma client lifecycle
│   ├── health/
│   │   └── health.controller.ts  # GET /health
│   ├── prompts/
│   │   ├── dto/               # Request validation DTOs
│   │   ├── prompts.controller.ts  # Route handlers
│   │   ├── prompts.module.ts
│   │   └── prompts.service.ts # Template lookup, A/B resolution, interpolation, hashing
│   ├── admin/
│   │   ├── dto/               # Admin request DTOs
│   │   ├── admin.controller.ts           # Template CRUD endpoints
│   │   ├── experiments-admin.controller.ts  # Experiment lifecycle endpoints
│   │   ├── node-registry.controller.ts   # Node registration & certification
│   │   ├── admin.service.ts   # Template & experiment business logic
│   │   ├── node-registry.service.ts      # Node lifecycle management
│   │   └── admin.module.ts
│   ├── experiments/
│   │   ├── experiments.service.ts   # A/B bucketing engine
│   │   └── experiments.module.ts    # Global experiment provider
│   ├── app.module.ts          # Root module
│   └── main.ts                # Bootstrap + Swagger setup
├── postman/                   # Postman collection & environment
├── test/integration/          # Docker-based integration tests
├── docker-compose.yml         # Local dev stack
├── docker-compose-integration.yml  # Integration test stack
├── Dockerfile                 # Production image
└── .github/workflows/ci.yml   # GitHub Actions CI
```

## Prompt Templates

The service ships with 13 seeded templates across 3 categories:

**Structural Analysis** (5 templates) — Used by the scraping pipeline to extract structured data from web pages:
- `structural-analysis` — Base extraction rules template
- `structural-schema-propositions` — Ballot measure schema
- `structural-schema-meetings` — Meeting/hearing schema
- `structural-schema-representatives` — Legislator schema
- `structural-schema-default` — Fallback for unknown types

**Document Analysis** (6 templates) — Used to analyze uploaded documents:
- `document-analysis-base-instructions` — Shared JSON-only instructions
- `document-analysis-generic` — Generic document analysis
- `document-analysis-petition` — Petition analysis (nonpartisan)
- `document-analysis-proposition` — Ballot proposition analysis
- `document-analysis-contract` — Contract analysis
- `document-analysis-form` — Form analysis

**RAG** (1 template) — Used for knowledge retrieval Q&A:
- `rag` — Context-grounded answer generation

## Postman Collection

A complete Postman collection is available in [`postman/`](postman/) with 26 requests covering all endpoints:

1. Import `postman/prompt-service.postman_collection.json` into Postman
2. Import `postman/prompt-service.postman_environment.json` as an environment
3. Select the "Prompt Service - Local" environment
4. Run the Health Check request to verify connectivity

The collection includes test scripts that validate responses and auto-capture IDs for request chaining.

## Integration with Opus Populi

The open-source `prompt-client` package connects to this service when `PROMPT_SERVICE_URL` is set:

```
┌─────────────────────────────────────────────────────┐
│  Opus Populi Node (open source)                     │
│                                                     │
│  ┌──────────────┐    ┌──────────────────────────┐   │
│  │ Scraping     │───▸│ prompt-client             │   │
│  │ Pipeline     │    │                           │   │
│  ├──────────────┤    │ PROMPT_SERVICE_URL set?   │   │
│  │ Documents    │───▸│  ├─ Yes → remote API call─┼───┼──▸ This Service
│  │ Service      │    │  └─ No  → local DB read   │   │
│  ├──────────────┤    │                           │   │
│  │ Knowledge    │───▸│ Fallback chain:           │   │
│  │ Service      │    │  remote → DB → hardcoded  │   │
│  └──────────────┘    └──────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

## License

UNLICENSED — Private and proprietary. Not for distribution.