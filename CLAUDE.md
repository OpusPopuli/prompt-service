# CLAUDE.md — prompt-service

## What this is

NestJS microservice that serves AI prompt templates to Opus Populi nodes. **This repo is public, and so is the prompt text** (decided in opuspopuli#1143, 2026-09-06): the civic prompts are published so every AI output can be traced to the exact prompt behind it. What is not public is runtime state, not code — live experiment assignments, per-region tuning values, API keys — which lives in the deployed service's database and Vault, never in this repo.

The public counterpart is `@opuspopuli/prompt-client` in the main `opuspopuli` monorepo. Nodes call the client; the client calls this service over HMAC-authenticated HTTP.

## Commands

```bash
pnpm start:dev          # Hot reload dev server
pnpm test               # Jest unit tests
pnpm test:integration   # Integration tests (requires Docker)
pnpm db:generate        # Regenerate Prisma client after schema changes
pnpm db:migrate         # Run Prisma migrations (dev)
pnpm db:studio          # Open Prisma Studio
pnpm attestation:generate  # Publish template changes to attestation/ (after editing prisma/seed.ts)
pnpm attestation:check     # Verify the attestation record
```

## Git workflow

**Trunk-based.** `main` is the only long-lived branch; there is no `develop`.

- **Base branch**: `main`. Cut short-lived branches from `main`, PR back to `main`.
- Never push directly to `main` — a repository ruleset rejects it, with no bypass for admins.
- Branch naming: `feat/<short-description>`, `fix/<short-description>`, `chore/<short-description>`
- **Merging does not ship.** `release.yml` triggers on a `v*` tag, not on merge:
  ```bash
  git tag v0.2.0 && git push origin v0.2.0
  ```

`develop` was removed on 2026-08-13, matching `opuspopuli`. It existed to insulate
a stable line from in-flight work — a coordination problem that needs more than one
committer to exist — while costing a second merge on every change.

Note this repo has **no release history**: no git tag and no GitHub Release has ever
been created, and `package.json` still reads `0.1.0`. The tag trigger above is what
starts one.

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

## Attestation record (opuspopuli#1450)

`attestation/` publishes every template text ever seeded, as `templates/<sha256>.txt`, with
`manifest.json` mapping each hash to its name and version. Opus Populi shows readers that hash on
every AI output and links here, so this record is what makes the receipt checkable.

- **After editing a template in `prisma/seed.ts`, run `pnpm attestation:generate`** and commit the
  new file and manifest with the change. `src/attestation/record.spec.ts` fails `pnpm test` until you do.
- **Changing a template's text means bumping its `version`.** `generate` refuses new text under an
  already-published name+version, because that makes the version label ambiguous to every reader.
  Fourteen labels predate this rule and are listed in `grandfatheredLabels`; that list never grows.
- **Never edit or delete a file in `attestation/templates/`.** It is append-only: outputs produced
  from an old text must stay attributable after the template is revised. Each file's name is the
  hash of its bytes, so an edit is detectable by anyone, not just CI.

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

Experiments in the `experiments` table test prompt variants against a control. The `ExperimentsModule` handles bucketing deterministically by API key (SHA-256 of `apiKey + experimentId` mod 100). Note: key rotation reassigns a node's bucket — keep this in mind when designing long-running experiments. When adding a new template variant, create the experiment via the admin API — do not manually edit the DB. **Commit the variant's text to `prisma/seed.ts` and the attestation record first**: text that only exists in the database is served to nodes, stamped on their outputs, and resolves to nothing in the public record.

## Prompt boundary

- Prompt template *text* lives here, and is public (see the attestation record above).
- Prompt *types and parameters* (interfaces, method signatures) are defined in `@opuspopuli/prompt-client/src/types.ts` (public).
- When adding a new prompt type: define the parameter interface in `prompt-client` first, then implement the template here. Keep the two in sync.

## SDLC tooling

Org-wide `op-*` workflow commands (`/op-review`, `/op-release`, `/op-issue-plan`, …) come from the shared **[opuspopuli-sdlc](https://github.com/OpusPopuli/opuspopuli-sdlc)** Claude Code plugin, auto-enabled via the committed `.claude/settings.json` (trust the repo folder once).
