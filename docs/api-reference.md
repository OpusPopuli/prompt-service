# API Reference

Base URL: `http://localhost:3210` (development) or configured deployment URL.

Interactive Swagger UI available at `/api`.

## Authentication

Prompt endpoints support two authentication methods: **Bearer tokens** and **HMAC request signing**.

### Bearer Token Authentication

Region keys and environment variable keys use a simple Bearer token:

```
Authorization: Bearer <API_KEY>
```

API keys are configured via the `API_KEYS` environment variable (comma-separated `region:key` pairs).

### HMAC Request Signing (Recommended for Nodes)

Registered nodes should use HMAC request signing. Unlike Bearer tokens, the API key never leaves the node — each request is signed with a timestamp and body hash, providing:

- **Replay protection**: Requests expire after 5 minutes
- **Tamper detection**: Body modifications invalidate the signature
- **Key secrecy**: The shared secret is never transmitted over the wire

#### HMAC Headers

| Header | Description |
|--------|-------------|
| `X-HMAC-Signature` | Base64-encoded HMAC-SHA256 signature |
| `X-HMAC-Timestamp` | Unix timestamp in seconds |
| `X-HMAC-Key-Id` | Node UUID (used to look up the shared secret) |

#### Signature Construction

```
signatureString = "${timestamp}\n${method}\n${path}\n${bodyHash}"
```

Where:
- `timestamp`: Same value as `X-HMAC-Timestamp`
- `method`: Uppercase HTTP method (e.g., `POST`)
- `path`: Request path (e.g., `/prompts/rag`)
- `bodyHash`: SHA-256 hex digest of the raw request body (empty string hash for no body)

The signature is computed as:
```
HMAC-SHA256(apiKey, signatureString) → Base64
```

#### Example (Node.js)

```typescript
import { createHash, createHmac } from 'node:crypto';

const timestamp = Math.floor(Date.now() / 1000).toString();
const method = 'POST';
const path = '/prompts/rag';
const body = JSON.stringify({ context: '...', query: '...' });

const bodyHash = createHash('sha256').update(body).digest('hex');
const signatureString = `${timestamp}\n${method}\n${path}\n${bodyHash}`;
const signature = createHmac('sha256', apiKey)
  .update(signatureString)
  .digest('base64');

// Send with headers:
// X-HMAC-Signature: <signature>
// X-HMAC-Timestamp: <timestamp>
// X-HMAC-Key-Id: <nodeId>
```

#### Validation Rules

- Timestamp must be within ±5 minutes of server time
- Signature uses constant-time comparison (timing-attack safe)
- Node must be certified and not expired
- API key is retrieved from Vault using the node's `apiKeySecretId`

#### Error Responses

| Message | Cause |
|---------|-------|
| `Missing HMAC headers` | Signature header present but timestamp or key-id missing |
| `Invalid HMAC timestamp` | Timestamp is not a valid number |
| `HMAC timestamp expired` | Timestamp outside ±5 minute window |
| `Unknown node` | Node UUID not found in database |
| `Node is not certified` | Node is pending, decertified, or certification expired |
| `Failed to retrieve node key` | Vault lookup failed |
| `Invalid HMAC signature` | Signature mismatch (wrong key, tampered body, etc.) |

### Admin Authentication

Admin endpoints (`/admin/*`) use a separate set of API keys configured via the `ADMIN_API_KEYS` environment variable. This separation ensures that node API keys cannot access template management or experiment controls.

```
Authorization: Bearer <ADMIN_API_KEY>
```

Every response includes an `X-Correlation-Id` response header (HTTP headers are case-insensitive; the service emits lowercase `x-correlation-id`). Pass this ID when reporting issues — it ties all log lines for a request together.

## Rate Limits

| Scope | Limit | Window |
|-------|-------|--------|
| Global | 60 requests | 1 minute |
| Prompt endpoints | 30 requests | 1 minute |
| `GET /prompts/:name/hash` | 120 requests | 1 minute |

When exceeded, returns `429 Too Many Requests`.

---

## `GET /health`

Health check endpoint. No authentication required.

### Response (healthy — HTTP 200)

```json
{
  "status": "ok",
  "timestamp": "2025-02-25T12:00:00.000Z",
  "database": "connected",
  "activeTemplates": 21,
  "auditLogFailures": 0
}
```

### Response (degraded — HTTP 503)

```json
{
  "status": "error",
  "timestamp": "2025-02-25T12:00:00.000Z",
  "database": "disconnected",
  "detail": "Can't reach database server at ...",
  "auditLogFailures": 0
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | `"ok"` \| `"error"` | `"error"` when database is unreachable |
| `timestamp` | string | ISO 8601 timestamp |
| `database` | `"connected"` \| `"disconnected"` | Database connectivity |
| `activeTemplates` | number | Count of active templates; present only when healthy |
| `detail` | string | First line of DB error message; present only when degraded |
| `auditLogFailures` | number | Audit log write failures since last restart (non-zero = investigate) |

---

## `GET /metrics`

Prometheus metrics endpoint. No authentication required (private network only — not exposed publicly).

Scraped by Prometheus at the configured scrape interval. Key metrics:

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `prompt_service_requests_total` | Counter | `endpoint`, `method`, `status` | Total HTTP requests processed |
| `prompt_service_request_duration_seconds` | Histogram | `endpoint`, `method` | Request duration in seconds |
| `process_*`, `nodejs_*` | Various | — | Default Node.js + process metrics |

Path parameters are normalised to avoid high cardinality (e.g., `/prompts/:name/hash` rather than the literal template name; UUIDs replaced with `:id`).

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

Schema templates exist for: `propositions`, `meetings`, `representatives`, `campaign_finance`, `lobbying`. All other data types fall back to `structural-schema-default`.

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
| `proposition` | `document-analysis-proposition` | Ballot proposition quick-metadata extraction |
| `proposition-analysis` | `document-analysis-proposition-analysis` | Full detail-page analysis with citations and section anchors |
| `representative-bio` | `document-analysis-representative-bio` | Legislator biography generation with claim attribution |
| `representative-committees-summary` | `document-analysis-representative-committees-summary` | Committee assignment summary |
| `legislative-committee-description` | `document-analysis-legislative-committee-description` | Committee function description |
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

## `POST /prompts/civics-extraction`

Returns a rendered prompt for civics-process data extraction. The LLM is instructed to emit a `CivicsBlock` JSON object (chambers, measure types, lifecycle stages with status patterns, glossary, session scheme) from official government pages describing how a region's legislature works.

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `regionId` | string | Yes | Region identifier (e.g., `"california"`) |
| `sourceUrl` | string | Yes | URL the HTML was scraped from — used in `CivicText.sourceUrl` citations |
| `contentGoal` | string | Yes | Natural-language extraction goal from the region config |
| `category` | string | No | Optional sub-category (e.g., `"Assembly"`) |
| `hints` | string[] | No | Hints from region author to scope extraction |
| `html` | string | Yes | Raw HTML scraped from the source URL |

---

## `POST /prompts/bill-extraction`

Returns a rendered prompt for legislative bill extraction. The LLM is instructed to emit a structured `Bill` record from an official legislature bill status page. Includes prompt-injection defenses for untrusted HTML content.

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `regionId` | string | Yes | Region identifier (e.g., `"california"`) |
| `sourceUrl` | string | Yes | URL the HTML was scraped from |
| `sessionYear` | string | Yes | Legislative session in `YYYY-YYYY` format (e.g., `"2025-2026"`) |
| `html` | string | Yes | Raw HTML of the bill status page |

**Notes:** The LLM may return `{ "skip": true }` if the URL doesn't contain `billStatusClient`, the page is a 404, or no recognizable bill data is present. `votes` is always `[]` — use `bill-votes-extraction` to extract roll-call vote data.

---

## `POST /prompts/bill-votes-extraction`

Returns a rendered prompt for bill vote extraction. The LLM is instructed to emit structured chamber-level roll-call vote records (including per-member positions) from an official legislature bill votes page. Companion to `bill-extraction` — votes are always extracted in a separate call.

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `regionId` | string | Yes | Region identifier (e.g., `"california"`) |
| `sourceUrl` | string | Yes | URL the HTML was scraped from |
| `sessionYear` | string | Yes | Legislative session in `YYYY-YYYY` format (e.g., `"2025-2026"`) |
| `billId` | string | Yes | Raw bill ID (e.g., `"202520260AB1"`) — used as the system key |
| `html` | string | Yes | Raw HTML of the bill votes page |

### LLM Response Shape

```json
{
  "billId": "202520260AB1",
  "votes": [
    {
      "chamber": "Assembly",
      "date": "2025-05-01",
      "motionText": "Do Pass",
      "yesCount": 42,
      "noCount": 28,
      "members": [
        { "name": "Member Name", "position": "yes", "party": "D" }
      ]
    }
  ]
}
```

Position values: `yes | no | abstain | absent | excused | no_vote`

---

## `GET /prompts/:name/hash`

Returns the current hash and version of a named template without interpolation. Used by clients to cheaply check whether a cached prompt is stale. Rate limit: 120 requests per minute.

### Path Parameter

| Param | Description |
|-------|-------------|
| `name` | Template name (e.g., `"structural-analysis"`, `"bill-extraction"`) |

### Response

```json
{
  "name": "bill-extraction",
  "promptHash": "a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890",
  "promptVersion": "v1"
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