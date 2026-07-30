# CLAUDE.md — prompt-service

## What this is

**Private** NestJS microservice that serves AI prompt templates to Opus Populi nodes. This repo contains the prompt template text, which is proprietary IP — do not share template content externally or commit it to public repos.

The public counterpart is `@opuspopuli/prompt-client` in the main `opuspopuli` monorepo. Nodes call the client; the client calls this service over HMAC-authenticated HTTP.

## Commands

```bash
pnpm start:dev          # Hot reload dev server
pnpm test               # Jest unit tests
pnpm test:integration   # Integration tests (requires Docker)
pnpm db:generate        # Regenerate Prisma client after schema changes
pnpm db:migrate         # Run Prisma migrations (dev)
pnpm db:studio          # Open Prisma Studio
```

## Git workflow

- **Base branch**: `develop`. All feature/fix branches cut from `develop`, PR back to `develop`.
- **`main`** is production-only. Promote via a release PR (`develop → main`).
- Never push directly to `develop` or `main`.
- Branch naming: `feat/<short-description>`, `fix/<short-description>`, `chore/<short-description>`

## Pre-push workflow (mandatory)

Before running any `git push`, always:
1. Run `/op-review` — fix any blocking findings before proceeding
2. Run `/security-review` — fix any security issues before proceeding
3. Only push after both pass cleanly

The husky pre-push hook enforces coverage thresholds and an AI security gate automatically.

## Architecture

```
opuspopuli nodes
  └── @opuspopuli/prompt-client
        ├── fetchRemotePrompt()   → this service (HMAC auth)
        ├── DB fallback           → opuspopuli's own prompt_templates table
        └── hardcoded fallback    → inline defaults
```

The client implements a 3-tier fallback so nodes degrade gracefully if this service is unreachable.

## Prompt template categories

| Category | Purpose |
|----------|---------|
| `structural_analysis` | AI extraction of page structure / manifest generation |
| `document_analysis` | Per-document content analysis (petitions, propositions, minutes, etc.) |
| `rag` | Retrieval-augmented generation (citizen Q&A) |
| `civics_extraction` | Structured civic-process data extraction (`CivicsBlock` — chambers, measure types, lifecycle stages, glossary) |
| `bill_extraction` | Legislative bill and vote record extraction |
| `bill_votes_extraction` | Chamber-level roll-call vote records (per-member positions) from a bill votes page |

Template names follow the pattern `{category}-{document-type}` or just `{category}` for single-template categories, e.g. `document-analysis-petition`, `civics-extraction`, `bill-extraction`, `bill-votes-extraction`.

Template variables use `{{VARIABLE_NAME}}` placeholders. The `variables` array on the template must list every placeholder used in `templateText`.

## Database migrations (Prisma)

```bash
# After editing prisma/schema.prisma:
pnpm db:generate        # Regenerate client
pnpm db:migrate         # Create + apply migration (prompts for a name)
```

Migration naming: use a short snake_case description, e.g. `add_experiments_table`, `add_civics_category`.

Rules:
- Additive only in production: never drop or rename columns in a single migration.
- Secrets go in environment variables (never in migration SQL).

## Authentication

Registered nodes authenticate with **HMAC-SHA256** request signing:

| Header | Value |
|--------|-------|
| `X-HMAC-Signature` | Base64 HMAC-SHA256 of `timestamp\nMETHOD\npath\nbodyHash` |
| `X-HMAC-Timestamp` | Unix seconds |
| `X-HMAC-Key-Id` | Node UUID |

Requests expire after 5 minutes (replay protection). The `@opuspopuli/prompt-client` handles signing automatically when `hmacNodeId` is configured.

Admin endpoints use a separate `ADMIN_API_KEYS` env var (comma-separated Bearer tokens). Never expose the admin key to nodes.

## A/B experiments

Experiments in the `experiments` table test prompt variants against a control. The `ExperimentsModule` handles bucketing deterministically by API key (SHA-256 of `apiKey + experimentId` mod 100). Note: key rotation reassigns a node's bucket — keep this in mind when designing long-running experiments. When adding a new template variant, create the experiment via the admin API — do not manually edit the DB.

## IP boundary

- Prompt template *text* lives here (private).
- Prompt *types and parameters* (interfaces, method signatures) are defined in `@opuspopuli/prompt-client/src/types.ts` (public).
- When adding a new prompt type: define the parameter interface in `prompt-client` first, then implement the template here. Keep the two in sync.

## SDLC tooling

Org-wide `op-*` workflow commands (`/op-review`, `/op-release`, `/op-issue-plan`, …) come from the shared **[opuspopuli-sdlc](https://github.com/OpusPopuli/opuspopuli-sdlc)** Claude Code plugin, auto-enabled via the committed `.claude/settings.json` (trust the repo folder once).
