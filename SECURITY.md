# Security & Trust Model

This document is intended for security auditors, privacy reviewers, and anyone evaluating the trustworthiness of the Opus Populi AI system. It explains what this service does, what it does not do, and how its design enforces the platform's trust commitments.

## What This Service Is

The Prompt Service is a private API that serves AI prompt templates to Opus Populi nodes. It is the single source of truth for all prompts used in document analysis, web scraping, and knowledge retrieval.

It does **not** run AI models. It does **not** process user documents. It does **not** store user data. It composes prompt text from templates and returns it to nodes, which then send that text to their local LLM.

## Trust Model: Glass Box Behavior, Black Box Implementation

Opus Populi follows a "glass box behavior, black box implementation" model:

- **Glass box**: Users see what the AI does — summaries, key points, entities, impact analysis. The methodology is documented publicly in the Prompt Service Charter. Analysis results include source provenance and prompt version identifiers.
- **Black box**: The specific prompt templates are private. Users cannot see the exact wording that instructs the LLM, which prevents gaming and ensures consistent quality across the federated network.

## Authentication & Authorization

### API Key Authentication

All prompt endpoints require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <API_KEY>
```

- API keys are configured via the `API_KEYS` environment variable (comma-separated)
- Keys are validated by `ApiKeyGuard` (`src/auth/api-key.guard.ts`)
- Invalid or missing tokens return `401 Unauthorized`
- The API key is attached to the request context for analytics logging

### What is logged

Every prompt request logs:
- Endpoint called (`structural-analysis`, `document-analysis`, `rag`)
- Prompt template version served
- API key prefix (first 8 characters + `...`) — **not the full key**
- Timestamp

Full API keys are **never** written to logs or the database.

## Rate Limiting

Rate limiting is enforced at two levels:

- **Global**: 60 requests per minute per client (via `@nestjs/throttler`)
- **Prompt endpoints**: 30 requests per minute per client

This prevents prompt scraping — an attacker with a valid API key cannot enumerate all templates at scale.

## Cryptographic Integrity

### Prompt Hashing

Every prompt response includes a `promptHash` field — a SHA-256 hash of the **raw template text** (before variable interpolation):

```json
{
  "promptText": "You are a nonpartisan civic analyst...",
  "promptHash": "a1b2c3d4e5f6...",
  "promptVersion": "v1"
}
```

This hash serves as a tamper-evident seal:
- Nodes can verify they received an authentic prompt via `POST /prompts/verify`
- Auditors can verify any analysis was produced with a known prompt version
- The hash is computed from the template, not the rendered output, so it's stable across different inputs

### Version History

Every template change is recorded in the `prompt_version_history` table with:
- Full template text at that version
- SHA-256 hash of the template
- Change note
- Timestamp

This creates an immutable audit trail. No version record can be deleted (enforced by the schema — no delete endpoint exists).

## Data Handling

### What data this service receives

| Data | Source | Purpose | Retention |
|------|--------|---------|-----------|
| API key | Node request header | Authentication | Not stored (only prefix logged) |
| Data type / document type | Node request body | Template selection | Not stored |
| HTML content | Node request body (structural analysis) | Variable interpolation | Not stored |
| Document text | Node request body (document analysis) | Variable interpolation | Not stored |
| Query + context | Node request body (RAG) | Variable interpolation | Not stored |

### What data this service does NOT receive

- User identity (the service has no concept of end users)
- User documents in their original form (only extracted text)
- Analysis results (those stay on the node)
- User behavior data (no analytics tracking of end users)

### Data flow

```
User uploads document → Node extracts text → Node sends text to Prompt Service
→ Prompt Service interpolates template → Returns composed prompt → Node sends
prompt to local LLM → LLM returns analysis → Node shows result to user
```

The Prompt Service is a pass-through text composition layer. Document text passes through memory during request processing and is never persisted.

## What the AI Prompts Do (and Don't Do)

### What prompts instruct the LLM to do

- Extract structured data from HTML (structural analysis)
- Summarize documents in a neutral, nonpartisan manner
- Identify key points, entities, beneficiaries, and those potentially harmed
- Identify actual effects and potential concerns
- Answer questions using only provided context (RAG)
- Respond with structured JSON

### What prompts explicitly do NOT do

- **No voting recommendations**: No prompt contains language that suggests how to vote
- **No political bias**: Petition and proposition prompts use "nonpartisan civic analyst" framing and require analysis of all sides (beneficiaries AND potentially harmed)
- **No editorial judgment**: Prompts ask for factual extraction, not opinion
- **No data fabrication**: RAG prompt explicitly states "do not make up information not present in the context"

### Verifying these claims

The seeded templates are in `prisma/seed.ts`. An auditor with repository access can:

1. Read every template in plain text
2. Verify no template contains recommendation language
3. Verify all analysis templates require multi-perspective output
4. Compare templates to the public Prompt Service Charter claims

## Network Architecture

### Production deployment

```
Internet → Cloudflare Tunnel → Opus Populi Node (public)
                                      │
                                      ▼
                            Prompt Service (internal network only)
                                      │
                                      ▼
                            PostgreSQL (prompt templates)
```

The Prompt Service is **not** publicly accessible. It sits on an internal Docker network, reachable only by authorized Opus Populi backend services.

### Federation model

In the federated Opus Populi network:
- Each region runs its own node with its own data
- All nodes connect to the same central Prompt Service
- Regions control **what facts are available** (their data sources)
- The Prompt Service controls **how facts are interpreted** (the prompts)
- This separation prevents any single region from biasing analysis

## Threat Model

| Threat | Mitigation |
|--------|-----------|
| Unauthorized prompt access | Bearer token authentication; API keys rotatable |
| Prompt scraping | Rate limiting (30 req/min per endpoint per key) |
| Prompt tampering in transit | SHA-256 hash verification via `/prompts/verify` |
| Node modifying prompts locally | Prompt lock verification in `prompt-client` (planned, see Issue #426) |
| API key compromise | Key prefix logging enables identification; revocation via env var update |
| Database compromise | Templates are text (no secrets); version history enables forensic audit |
| Insider threat (rogue prompt edit) | Version history with full diff trail; no delete capability |
| LLM output manipulation | Canary system compares outputs across nodes (planned, see Issue #429) |

## Known Limitations

1. **No mutual TLS**: Node-to-service communication uses Bearer tokens over HTTPS, not mTLS. This is acceptable for the current deployment model (internal Docker network) but should be revisited for multi-host federation.

2. **Static API keys**: Keys are configured via environment variable, not a dynamic key management system. Key rotation requires a service restart. Future work (Issue #428) adds a node registry with dynamic key provisioning.

3. **No request signing**: Requests are authenticated but not signed. A compromised node could replay requests. Future work adds HMAC request signing.

4. **Template text in responses**: The rendered prompt (including the template structure) is returned to nodes. This is by design — nodes need the full prompt to send to their LLM. The mitigation is rate limiting and key-based access control.

## Contact

For security concerns, contact the Opus Populi security team. Do not open public issues for security vulnerabilities — use responsible disclosure.