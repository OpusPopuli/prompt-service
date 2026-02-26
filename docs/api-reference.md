# API Reference

Base URL: `http://localhost:3100` (development) or configured deployment URL.

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
  "promptVersion": "v1"
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
  "promptVersion": "v1"
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
}
```

The `promptHash` is computed from the template **before** variable interpolation. This means:
- The same template always produces the same hash regardless of input
- The hash changes only when the template itself is edited
- Hashes can be verified via the `/prompts/verify` endpoint

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