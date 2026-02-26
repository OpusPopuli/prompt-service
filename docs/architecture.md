# Architecture

## Overview

The Prompt Service is a standalone NestJS microservice that serves AI prompt templates to Opus Populi nodes. It is the private counterpart to the open-source `prompt-client` package — together they form the prompt delivery system.

```
┌──────────────────────────────────┐     ┌──────────────────────────────────┐
│  Open Source (opuspopuli repo)   │     │  Private (this repo)             │
│                                  │     │                                  │
│  packages/prompt-client/         │────▸│  prompt-service/                 │
│    ├── fetchRemotePrompt()       │HTTP │    ├── PromptsController         │
│    ├── 3-tier fallback chain     │     │    ├── PromptsService            │
│    └── in-memory cache           │     │    └── PostgreSQL templates      │
│                                  │     │                                  │
│  Response contract (shared):     │     │  Same contract:                  │
│  { promptText,                   │     │  { promptText,                   │
│    promptHash,                   │     │    promptHash,                   │
│    promptVersion,                │     │    promptVersion,                │
│    expiresAt }                   │     │    expiresAt }                   │
└──────────────────────────────────┘     └──────────────────────────────────┘
```

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | 20+ |
| Framework | NestJS | 10.x |
| Language | TypeScript | 5.x |
| Database | PostgreSQL | 16+ |
| ORM | Prisma | 6.x |
| API Docs | Swagger / OpenAPI | via @nestjs/swagger 7.x |
| Rate Limiting | @nestjs/throttler | 6.x |
| Validation | class-validator + class-transformer | 0.14.x |
| Container | Docker (Alpine) | Multi-stage build |
| CI | GitHub Actions | — |

## Module Structure

```
AppModule
├── ConfigModule (global)           # Environment variables
├── ThrottlerModule (global)        # Rate limiting: 60 req/min default
├── PrismaModule (global)           # Database connection lifecycle
├── ExperimentsModule (global)      # A/B testing bucketing engine
├── HealthModule                    # GET /health
├── PromptsModule                   # Prompt serving endpoints
│   ├── PromptsController           # Route handlers + node API key guards
│   └── PromptsService              # Template lookup, A/B resolution, interpolation, hashing
└── AdminModule                     # Template & experiment management
    ├── AdminController             # CRUD for templates (admin key auth)
    ├── ExperimentsAdminController  # Experiment lifecycle (admin key auth)
    └── AdminService                # Template CRUD, rollback, experiment management
```

## Database Schema

### `prompt_templates`

Primary storage for prompt templates. Each template has a unique name and belongs to a category.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `name` | String (unique) | Template identifier (e.g., `document-analysis-petition`) |
| `category` | String | `structural_analysis`, `document_analysis`, or `rag` |
| `description` | String | Human-readable purpose |
| `template_text` | Text | Template with `{{VARIABLE}}` placeholders |
| `variables` | String[] | List of expected variable names |
| `version` | Int | Monotonically increasing version number |
| `is_active` | Boolean | Whether this template is served (soft delete) |
| `created_at` | Timestamptz | Creation timestamp |
| `updated_at` | Timestamptz | Last modification timestamp |

### `prompt_version_history`

Immutable audit trail of every template change.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `template_id` | UUID | FK to `prompt_templates` |
| `version` | Int | Version number at time of change |
| `template_text` | Text | Full template text at this version |
| `template_hash` | String | SHA-256 hash of template text |
| `change_note` | String? | What changed and why |
| `created_at` | Timestamptz | When this version was created |

### `experiments`

A/B testing experiments that serve different prompt versions to different nodes.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `name` | String (unique) | Experiment identifier |
| `description` | String? | Human-readable purpose |
| `template_id` | UUID | FK to `prompt_templates` — template being tested |
| `status` | String | `draft`, `active`, or `stopped` |
| `created_at` | Timestamptz | Creation timestamp |
| `updated_at` | Timestamptz | Last modification timestamp |
| `stopped_at` | Timestamptz? | When the experiment was stopped |

### `experiment_variants`

Variant definitions within an experiment. Traffic percentages must sum to 100.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `experiment_id` | UUID | FK to `experiments` |
| `name` | String | Variant name (e.g., "control", "variant_a") |
| `version_id` | UUID | FK to `prompt_version_history` — which template version to serve |
| `traffic_pct` | Int | Traffic percentage (0-100) |

### `prompt_request_logs`

Analytics table tracking prompt usage, including A/B experiment participation.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `endpoint` | String | Which endpoint was called |
| `prompt_version` | Int | Template version served |
| `api_key_prefix` | String | First 8 chars of API key (for identification without exposure) |
| `experiment_id` | String? | Experiment ID if request was part of an A/B test |
| `variant_name` | String? | Variant name served (e.g., "control", "variant_a") |
| `created_at` | Timestamptz | Request timestamp |

## Request Flow

### Prompt Request (e.g., document-analysis)

```
1. Client sends POST /prompts/document-analysis
   Headers: Authorization: Bearer <API_KEY>
   Body: { documentType: "petition", text: "..." }

2. ApiKeyGuard validates Bearer token against API_KEYS env var
   → 401 if invalid

3. ThrottlerGuard checks rate limit (30 req/min for prompt endpoints)
   → 429 if exceeded

4. ValidationPipe validates body against DocumentAnalysisDto
   → 400 if invalid

5. PromptsService.getDocumentAnalysisPrompt():
   a. resolveTemplate("document-analysis-petition", apiKey):
      i.  Check for active A/B experiment on this template
      ii. If experiment active → bucket API key to variant → use variant's template text
      iii.If no experiment → look up default template
      → If not found, fall back to "document-analysis-generic"
      → If neither found, throw 404
   b. Look up base instructions: "document-analysis-base-instructions" (always default, never A/B tested)
   c. Interpolate {{TEXT}} variable into template
   d. Append base instructions
   e. Compute SHA-256 hash of raw template text (before interpolation)
   f. Compute expiresAt from PROMPT_TTL_SECONDS config
   g. Log request to prompt_request_logs (including experimentId and variantName if applicable)

6. Return { promptText, promptHash, promptVersion, expiresAt }
```

### Verification Request

```
1. Client sends POST /prompts/verify
   Body: { promptHash: "a1b2c3...", promptVersion: "v1" }

2. ApiKeyGuard validates Bearer token

3. PromptsService.verifyPrompt():
   a. Parse version number from "v1" → 1
   b. Query all templates with that version
   c. Hash each template's text, compare to provided hash
   d. Return { valid: true, templateName: "..." } or { valid: false }
```

## Template Interpolation

Templates use `{{VARIABLE_NAME}}` placeholders. The service performs simple string replacement — no logic, no conditionals, no loops. This is intentional: templates should be declarative text, not programs.

```
Template: "Analyze this {{DOCUMENT_TYPE}}: {{TEXT}}"
Variables: { DOCUMENT_TYPE: "petition", TEXT: "We the people..." }
Result:   "Analyze this petition: We the people..."
```

## Hashing Strategy

The `promptHash` is computed from the **raw template text before interpolation**. This means:
- The same template always produces the same hash, regardless of input variables
- Hash changes only when the template itself is edited
- Nodes can cache prompts by hash and know when to re-fetch

Hash algorithm: SHA-256 (via Node.js `crypto.createHash`).

## Fallback Strategy

The Prompt Service uses a template fallback chain for type-specific lookups:

1. Look up exact template name (e.g., `document-analysis-petition`)
2. If not found, look up the fallback name (e.g., `document-analysis-generic`)
3. If neither found, return `404 Not Found`

This allows adding new document types by simply seeding a new template — no code changes required.

## A/B Testing (Experiments)

The service supports A/B testing of prompt templates via the experiments system. This allows controlled rollout of prompt changes by serving different template versions to different nodes.

### Bucketing Algorithm

Nodes are deterministically assigned to variants using SHA-256 hashing:

```
bucket = parseInt(SHA256(apiKey + ":" + experimentId)[0..7], 16) % 100
```

Properties:
- **Deterministic**: The same node (API key) always gets the same variant for a given experiment
- **Uniform**: SHA-256 distributes evenly across 0-99 buckets
- **Independent**: Different experiments produce different bucket assignments for the same node

### Experiment Lifecycle

```
draft → active → stopped
```

- **Draft**: Experiment is configured but not serving traffic. Variants and traffic splits can be adjusted.
- **Active**: Experiment is live. Only one experiment may be active per template at a time. Prompt requests for the associated template are routed through the bucketing engine.
- **Stopped**: Experiment is concluded. The template reverts to serving its default (latest) version.

### Data Flow

```
1. Node requests prompt for "document-analysis-petition"
2. ExperimentsService checks for active experiment on this template
3. If experiment active:
   a. Compute bucket from SHA256(apiKey + ":" + experimentId)
   b. Walk variants by cumulative trafficPct until bucket < cumulative
   c. Return variant's version entry (templateText, version, hash)
4. If no experiment: use default template (latest active version)
5. Log request with experimentId + variantName for analytics
```

### Design Decisions

- **Only primary templates are A/B tested**: Auxiliary templates (schema descriptions, base instructions) always use the default version. This keeps prompt composition predictable.
- **Separate admin controller**: Experiment endpoints use `/admin/experiments` (not nested under `/admin/templates/:id`) to avoid route parameter conflicts.
- **No auto-winner selection**: Experiments must be manually stopped and evaluated. Automatic winner selection is out of scope for the initial implementation.

Note: The `prompt-client` in the main repo has its own 3-tier fallback:
1. Remote service (this service) → 2. Local database → 3. Hardcoded fallbacks

The two fallback chains are complementary: the client falls back when the service is unreachable, the service falls back when a specific template doesn't exist.