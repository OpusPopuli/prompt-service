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

- Node.js 20+
- pnpm
- PostgreSQL 16+ (or use Docker)

### With Docker (recommended)

```bash
docker compose up -d
```

This starts PostgreSQL on port 5433 and the service on port 3100. The service automatically runs migrations on startup.

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
curl http://localhost:3100/health

# Fetch a prompt (requires API key)
curl -X POST http://localhost:3100/prompts/document-analysis \
  -H "Authorization: Bearer dev-key-1" \
  -H "Content-Type: application/json" \
  -d '{"documentType": "petition", "text": "We the people request..."}'
```

## API Endpoints

All prompt endpoints require a Bearer token (`Authorization: Bearer <API_KEY>`).

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | No | Service health check |
| `POST` | `/prompts/structural-analysis` | Yes | Web scraping extraction prompt |
| `POST` | `/prompts/document-analysis` | Yes | Document analysis prompt |
| `POST` | `/prompts/rag` | Yes | RAG answer generation prompt |
| `POST` | `/prompts/verify` | Yes | Verify a prompt hash is authentic |

Interactive API docs are available at `http://localhost:3100/api` (Swagger UI).

See [docs/api-reference.md](docs/api-reference.md) for full request/response schemas.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `API_KEYS` | Yes | — | Comma-separated list of valid API keys |
| `PORT` | No | `3100` | Server port |

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

## Project Structure

```
prompt-service/
├── prisma/
│   ├── schema.prisma          # Database schema
│   └── seed.ts                # Seeds all 13 prompt templates
├── src/
│   ├── auth/
│   │   └── api-key.guard.ts   # Bearer token validation
│   ├── common/
│   │   ├── prisma.module.ts   # Global Prisma provider
│   │   └── prisma.service.ts  # Prisma client lifecycle
│   ├── health/
│   │   └── health.controller.ts  # GET /health
│   ├── prompts/
│   │   ├── dto/               # Request validation DTOs
│   │   ├── prompts.controller.ts  # Route handlers
│   │   ├── prompts.module.ts
│   │   └── prompts.service.ts # Template lookup, interpolation, hashing
│   ├── app.module.ts          # Root module
│   └── main.ts                # Bootstrap + Swagger setup
├── docker-compose.yml         # Local dev stack
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