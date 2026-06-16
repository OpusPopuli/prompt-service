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

# Seed all 21 prompt templates
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
curl http://localhost:3210/health

# Fetch a prompt with a Bearer token (region/env-var key)
curl -X POST http://localhost:3210/prompts/document-analysis \
  -H "Authorization: Bearer dev-key-1" \
  -H "Content-Type: application/json" \
  -d '{"documentType": "petition", "text": "We the people request..."}'

# Fetch a prompt with HMAC signing (registered node)
BODY='{"documentType":"petition","text":"We the people request..."}'
TS=$(date +%s)
BODY_HASH=$(echo -n "$BODY" | openssl dgst -sha256 -hex | awk '{print $2}')
SIG=$(printf '%s\nPOST\n/prompts/document-analysis\n%s' "$TS" "$BODY_HASH" \
  | openssl dgst -sha256 -hmac "$NODE_API_KEY" -binary | base64)
curl -s -X POST http://localhost:3210/prompts/document-analysis \
  -H "Content-Type: application/json" \
  -H "X-HMAC-Timestamp: $TS" \
  -H "X-HMAC-Key-Id: $NODE_ID" \
  -H "X-HMAC-Signature: $SIG" \
  -d "$BODY"
# NODE_API_KEY=<node-api-key> NODE_ID=<node-uuid>
```

## API Endpoints

### Prompt Serving (Node API Key or HMAC)

Prompt endpoints support **Bearer token** auth (region/env var keys) and **HMAC request signing** (registered nodes). HMAC is recommended for federated nodes — the API key never leaves the node, and requests include replay protection and tamper detection. See [API Reference](docs/api-reference.md#hmac-request-signing-recommended-for-nodes) for details.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Service health check (no auth) |
| `POST` | `/prompts/structural-analysis` | Web scraping extraction prompt |
| `POST` | `/prompts/document-analysis` | Document analysis prompt |
| `POST` | `/prompts/rag` | RAG answer generation prompt |
| `POST` | `/prompts/civics-extraction` | Civics-process data extraction prompt |
| `POST` | `/prompts/bill-extraction` | Legislative bill extraction prompt |
| `POST` | `/prompts/bill-votes-extraction` | Bill roll-call vote extraction prompt |
| `POST` | `/prompts/verify` | Verify a prompt hash is authentic |
| `GET`  | `/prompts/:name/hash` | Get hash of a named template (cache invalidation) |

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
| `pnpm db:seed` | Seed all 21 prompt templates |
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
│   └── seed.ts                # Seeds all 21 prompt templates
├── src/
│   ├── auth/
│   │   ├── api-key.guard.ts   # Node auth: Bearer tokens + HMAC request signing
│   │   └── admin-key.guard.ts # Admin API key validation
│   ├── common/
│   │   ├── crypto.utils.ts    # Constant-time comparison, string helpers
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
├── docker-compose.yml         # Local dev stack (builds from source)
├── docker-compose-integration.yml  # Integration test stack
├── docker-compose-prod.yml    # Production overlay (pulls ghcr.io/opuspopuli/prompt-service)
├── Dockerfile                 # Production image (built by .github/workflows/release.yml)
└── .github/workflows/
    ├── ci.yml                 # PR lint + test
    ├── release.yml            # Build + cosign sign + SBOM + push to ghcr.io on push to main
    └── validate-main-pr.yml   # Pre-merge gate for main
```

## Deployment

Production images publish to `ghcr.io/opuspopuli/prompt-service` on push to `main` (cosign-signed with Sigstore keyless, SBOM attested). On the Mac Studio:

```bash
docker compose -f docker-compose-prod.yml pull
docker compose -f docker-compose-prod.yml up -d
```

Pin a specific build for rollback:
```bash
TAG=sha-abc1234 docker compose -f docker-compose-prod.yml up -d
```

For local dev with hot reload, use `docker-compose.yml` (builds from source) or `pnpm start:dev` (no Docker).

## Prompt Templates

The service ships with 21 seeded templates across 5 categories:

**Structural Analysis** (7 templates) — Used by the scraping pipeline to extract structured data from web pages:
- `structural-analysis` — Base extraction rules template
- `structural-schema-propositions` — Ballot measure schema
- `structural-schema-meetings` — Meeting/hearing schema
- `structural-schema-representatives` — Legislator schema
- `structural-schema-campaign_finance` — Campaign finance contribution schema
- `structural-schema-lobbying` — Lobbying filing schema
- `structural-schema-default` — Fallback for unknown types

**Document Analysis** (10 templates) — Used to analyze uploaded documents:
- `document-analysis-base-instructions` — Shared civic platform context and JSON-only output instructions
- `document-analysis-generic` — Generic document analysis
- `document-analysis-petition` — Petition analysis (nonpartisan)
- `document-analysis-proposition` — Ballot proposition quick-metadata extraction
- `document-analysis-proposition-analysis` — Full detail-page analysis with citations and section anchors
- `document-analysis-representative-bio` — Legislator biography generation with claim attribution
- `document-analysis-representative-committees-summary` — Committee assignment summary
- `document-analysis-legislative-committee-description` — Committee function description
- `document-analysis-contract` — Contract analysis
- `document-analysis-form` — Form analysis

**RAG** (1 template) — Used for knowledge retrieval Q&A:
- `rag` — Context-grounded answer generation

**Civics Extraction** (1 template) — Used to extract structured civic-process data:
- `civics-extraction` — Extracts `CivicsBlock` (chambers, measure types, lifecycle stages, glossary) from official government pages

**Bill Extraction** (2 templates) — Used by the bill ingest pipeline:
- `bill-extraction` — Extracts a structured Bill record from a legislature bill status page
- `bill-votes-extraction` — Extracts roll-call vote records from a legislature bill votes page

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