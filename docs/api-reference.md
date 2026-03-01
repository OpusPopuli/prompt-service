# API Reference

Base URL: `http://localhost:3200` (development) or configured deployment URL.

Interactive Swagger UI available at `/api`.

## Authentication

All prompt endpoints require a Bearer token:

```
Authorization: Bearer <API_KEY>
```

API keys are configured via the `API_KEYS` environment variable (comma-separated). An invalid or missing token returns:

```json
{
  "statusCode": 401,
  "message": "Missing or invalid Authorization header",
  "error": "Unauthorized"
}
```

### Admin Authentication

Admin endpoints (`/admin/*`) use a separate set of API keys configured via the `ADMIN_API_KEYS` environment variable. This separation ensures that node API keys cannot access template management or experiment controls.

```
Authorization: Bearer <ADMIN_API_KEY>
```

## Rate Limits

| Scope | Limit | Window |
|-------|-------|--------|
| Global | 60 requests | 1 minute |
| Prompt endpoints | 30 requests | 1 minute |

When exceeded, returns `429 Too Many Requests`.

---

## `GET /health`

Health check endpoint. No authentication required.

### Response

```json
{
  "status": "ok",
  "timestamp": "2025-02-25T12:00:00.000Z",
  "database": "connected",
  "activeTemplates": 13
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | `"ok"` \| `"degraded"` | `"degraded"` when database is unreachable |
| `timestamp` | string | ISO 8601 timestamp |
| `database` | `"connected"` \| `"disconnected"` | Database connectivity |
| `activeTemplates` | number | Count of active templates (0 if DB is down) |

---

## `POST /prompts/structural-analysis`

Returns a rendered prompt for web page structural analysis (scraping pipeline).

### Request Body

```json
{
  "dataType": "propositions",
  "contentGoal": "Extract ballot measures from the California legislature page",
  "category": "legislation",
  "hints": ["Measures are in table rows", "Date is in the page header"],
  "html": "<html>...</html>"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `dataType` | string | Yes | Data type to extract (e.g., `propositions`, `meetings`, `representatives`) |
| `contentGoal` | string | Yes | Natural language description of what to extract |
| `category` | string | No | Content category for template selection |
| `hints` | string[] | No | Hints from the region plugin author |
| `html` | string | Yes | HTML content to analyze |

### Response

```json
{
  "promptText": "You are a web scraping expert. Analyze the following HTML...",
  "promptHash": "a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890",
  "promptVersion": "v1",
  "expiresAt": "2026-02-25T13:00:00.000Z"
}
```

### Template Resolution

1. Uses `structural-analysis` as the base template
2. Looks up schema template: `structural-schema-{dataType}` (e.g., `structural-schema-propositions`)
3. Falls back to `structural-schema-default` if the specific schema doesn't exist

---

## `POST /prompts/document-analysis`

Returns a rendered prompt for document analysis (petition scanning, proposition analysis, etc.).

### Request Body

```json
{
  "documentType": "petition",
  "text": "We the people of the State of California hereby petition..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `documentType` | string | Yes | Document type (e.g., `petition`, `proposition`, `contract`, `form`, `generic`) |
| `text` | string | Yes | Document text content (typically OCR output) |

### Response

```json
{
  "promptText": "You are a nonpartisan civic analyst. Analyze this petition...\nRespond with valid JSON only. No markdown, no explanations.",
  "promptHash": "b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890a1",
  "promptVersion": "v1",
  "expiresAt": "2026-02-25T13:00:00.000Z"
}
```

### Template Resolution

1. Looks up `document-analysis-{documentType}` (e.g., `document-analysis-petition`)
2. Falls back to `document-analysis-generic` if the specific type doesn't exist
3. Appends `document-analysis-base-instructions` to the rendered prompt

### Available Document Types

| Type | Template | Description |
|------|----------|-------------|
| `petition` | `document-analysis-petition` | Nonpartisan petition analysis with impact, beneficiaries, concerns |
| `proposition` | `document-analysis-proposition` | Ballot proposition analysis |
| `contract` | `document-analysis-contract` | Contract terms, obligations, risks |
| `form` | `document-analysis-form` | Form purpose, required fields, deadlines |
| `generic` | `document-analysis-generic` | Fallback for unknown types |

---

## `POST /prompts/rag`

Returns a rendered prompt for RAG (Retrieval-Augmented Generation) answer generation.

### Request Body

```json
{
  "context": "The California Clean Air Act of 2024 requires all vehicles...",
  "query": "What are the emissions requirements for passenger vehicles?"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `context` | string | Yes | Retrieved context passages |
| `query` | string | Yes | User's question |

### Response

```json
{
  "promptText": "You are a helpful assistant that answers questions based only on the provided context...",
  "promptHash": "c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890a1b2",
  "promptVersion": "v1",
  "expiresAt": "2026-02-25T13:00:00.000Z"
}
```

---

## `POST /prompts/verify`

Verify that a prompt hash is authentic — confirms a prompt was generated by this service.

### Request Body

```json
{
  "promptHash": "a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890",
  "promptVersion": "v1"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `promptHash` | string | Yes | SHA-256 hash to verify |
| `promptVersion` | string | Yes | Version identifier (e.g., `"v1"`) |

### Response (valid)

```json
{
  "valid": true,
  "templateName": "document-analysis-petition"
}
```

### Response (invalid)

```json
{
  "valid": false
}
```

### How Verification Works

The service looks up all templates matching the given version, computes the SHA-256 hash of each template's raw text, and checks if any match the provided hash. This confirms that the hash was produced by an authentic, unmodified template.

---

---

## Admin: Template Management

All admin endpoints require an admin API key (`ADMIN_API_KEYS`).

### `GET /admin/templates`

List all templates with optional filters.

#### Query Parameters

| Param | Type | Description |
|-------|------|-------------|
| `category` | string | Filter by category (e.g., `structural_analysis`) |
| `isActive` | boolean | Filter by active status |

#### Response

```json
[
  {
    "id": "uuid",
    "name": "document-analysis-petition",
    "category": "document_analysis",
    "description": "Nonpartisan petition analysis",
    "templateText": "You are a nonpartisan civic analyst...",
    "variables": ["TEXT"],
    "version": 3,
    "isActive": true,
    "createdAt": "2026-01-15T10:00:00.000Z",
    "updatedAt": "2026-02-20T14:30:00.000Z"
  }
]
```

### `GET /admin/templates/:id`

Get a template by ID, including its full version history.

#### Response

```json
{
  "id": "uuid",
  "name": "document-analysis-petition",
  "version": 3,
  "versionHistory": [
    {
      "id": "uuid",
      "version": 3,
      "templateText": "...",
      "templateHash": "abc123...",
      "changeNote": "Improved neutrality language",
      "createdAt": "2026-02-20T14:30:00.000Z"
    },
    {
      "id": "uuid",
      "version": 2,
      "templateText": "...",
      "templateHash": "def456...",
      "changeNote": "Added beneficiary analysis",
      "createdAt": "2026-02-10T09:00:00.000Z"
    }
  ]
}
```

### `POST /admin/templates`

Create a new prompt template. Automatically creates an initial version history entry.

#### Request Body

```json
{
  "name": "document-analysis-ballot-measure",
  "category": "document_analysis",
  "description": "Ballot measure analysis template",
  "templateText": "You are a nonpartisan civic analyst. Analyze the following ballot measure:\n\n{{TEXT}}",
  "variables": ["TEXT"],
  "changeNote": "Initial creation"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Lowercase with hyphens only (e.g., `my-template-name`) |
| `category` | string | Yes | Template category |
| `description` | string | Yes | Human-readable purpose |
| `templateText` | string | Yes | Template with `{{VARIABLE}}` placeholders |
| `variables` | string[] | No | List of expected variable names |
| `changeNote` | string | No | Defaults to "Initial creation" |

### `PATCH /admin/templates/:id`

Update an existing template. Increments the version number and creates a version history entry.

#### Request Body

```json
{
  "templateText": "Updated template text with {{TEXT}} placeholder",
  "changeNote": "Improved extraction accuracy"
}
```

All fields are optional except `changeNote`. Only provided fields are updated.

### `DELETE /admin/templates/:id`

Soft-delete a template (sets `isActive: false`). The template and its history are preserved.

### `POST /admin/templates/:id/rollback`

Rollback a template to a previous version. Creates a new version entry (does not rewrite history).

#### Request Body

```json
{
  "targetVersion": 2,
  "changeNote": "Reverting due to accuracy regression"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `targetVersion` | integer | Yes | Version number to rollback to (minimum: 1) |
| `changeNote` | string | No | Defaults to "Rollback to version N" |

---

## Admin: A/B Experiments

Experiment endpoints manage A/B tests that serve different prompt versions to different nodes based on deterministic bucketing.

### `POST /admin/experiments`

Create a new experiment in `draft` status.

#### Request Body

```json
{
  "name": "petition-prompt-v3-test",
  "description": "Test improved neutrality language",
  "templateId": "uuid-of-template",
  "variants": [
    { "name": "control", "versionId": "uuid-of-version-history-entry", "trafficPct": 50 },
    { "name": "variant_a", "versionId": "uuid-of-version-history-entry", "trafficPct": 50 }
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Unique experiment name |
| `description` | string | No | Experiment description |
| `templateId` | UUID | Yes | Template this experiment applies to |
| `variants` | array | Yes | Minimum 2 variants; `trafficPct` must sum to 100 |
| `variants[].name` | string | Yes | Variant name (e.g., "control", "variant_a") |
| `variants[].versionId` | UUID | Yes | ID of a `PromptVersionHistory` entry |
| `variants[].trafficPct` | integer | Yes | Traffic percentage (0-100) |

### `GET /admin/experiments`

List all experiments with their variants and linked templates.

### `GET /admin/experiments/:id`

Get experiment details including variants with their associated version entries.

### `POST /admin/experiments/:id/activate`

Activate a draft experiment. Only one experiment may be active per template at a time. Returns `400` if the experiment is not in `draft` status or another experiment is already active for the same template.

### `POST /admin/experiments/:id/stop`

Stop an active experiment. Sets status to `stopped` and records `stoppedAt` timestamp. Once stopped, the template reverts to serving its default (latest) version.

---

## Common Response Format

All prompt endpoints return the same shape:

```typescript
interface PromptServiceResponse {
  /** The fully rendered prompt text, ready to send to an LLM */
  promptText: string;
  /** SHA-256 hash of the raw template text (before variable interpolation) */
  promptHash: string;
  /** Template version identifier (e.g., "v1") */
  promptVersion: string;
  /** ISO 8601 expiry timestamp — nodes must re-fetch after this time */
  expiresAt: string;
}
```

The `promptHash` is computed from the template **before** variable interpolation. This means:
- The same template always produces the same hash regardless of input
- The hash changes only when the template itself is edited
- Hashes can be verified via the `/prompts/verify` endpoint

The `expiresAt` field is computed as `now + PROMPT_TTL_SECONDS` (default: 3600 seconds / 1 hour). Nodes should re-fetch prompts after the expiry time to pick up template updates.

## Error Responses

| Status | Meaning | Example |
|--------|---------|---------|
| `400` | Invalid request body | Missing required field |
| `401` | Authentication failed | Invalid or missing API key |
| `404` | Template not found | No active template for the requested type |
| `429` | Rate limit exceeded | Too many requests in the time window |
| `500` | Internal server error | Database connection failure |

All errors follow the NestJS exception format:

```json
{
  "statusCode": 404,
  "message": "Prompt template \"document-analysis-unknown\" not found",
  "error": "Not Found"
}
```