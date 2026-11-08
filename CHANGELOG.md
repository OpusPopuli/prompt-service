# Changelog

All notable changes to the Opus Populi prompt-service are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Releases ship by pushing a `v*` tag (`release.yml` builds, signs, and
publishes the image). Versions before 0.2.0 shipped through develop-era
release PRs without tags; that history is summarized below rather than
reconstructed.

## [Unreleased]

## [0.5.0] - 2026-11-08

The templates `opuspopuli` v2.0.0 calls. **Deploy this release before that
backend**, and don't restart the container after seeding: the boot re-seed
can overwrite newer template text while leaving the version number unchanged.

### Added

- **OCR transcription instructions**: two named templates, for two kinds of
  model, served from here instead of inline in the client
  ([#110](https://github.com/OpusPopuli/prompt-service/pull/110);
  opuspopuli#1234, opuspopuli#1245).
- **PDF text rules**: five `structural_analysis` templates at v1. This was the
  last inline LLM prompt in opuspopuli
  ([#124](https://github.com/OpusPopuli/prompt-service/pull/124);
  opuspopuli#1414).
- **`minutes-summary`** v1, restored. It was removed from opuspopuli by #1246
  and never seeded here. Since then minutes summaries had fallen back to the
  generic prompt and carried no claims
  ([#125](https://github.com/OpusPopuli/prompt-service/pull/125)).
- **The two representative activity templates**, which had never existed
  ([#122](https://github.com/OpusPopuli/prompt-service/pull/122)).

### Changed

- **`document-analysis-proposition-analysis`**:
  - **v2**: quote-then-locate. The model quotes its evidence and code locates
    the quote ([#111](https://github.com/OpusPopuli/prompt-service/pull/111),
    [#113](https://github.com/OpusPopuli/prompt-service/pull/113);
    opuspopuli#1212).
  - **v3**: the two ballot outcomes are written symmetrically
    ([#115](https://github.com/OpusPopuli/prompt-service/pull/115), #114).
  - **v4**: shows the rule instead of an example answer the model copied
    ([#121](https://github.com/OpusPopuli/prompt-service/pull/121);
    opuspopuli#1358).
- **Civics extraction**:
  - **v2**: says which field a fact belongs in
    ([#116](https://github.com/OpusPopuli/prompt-service/pull/116)).
  - **v3**: a measure type can be named at the end of a line
    ([#117](https://github.com/OpusPopuli/prompt-service/pull/117)).
  - **v5**: a lifecycle stage is neither a section heading nor a glossary term
    ([#119](https://github.com/OpusPopuli/prompt-service/pull/119)).
  - **v6**: keeps the page's words and escapes the page's quotes
    ([#120](https://github.com/OpusPopuli/prompt-service/pull/120)).
  - Measured against the opuspopuli gold set (opuspopuli#1332, #1333).
- **`representative-bio` v2**: grounded in source data only, with no "general
  knowledge". Committee chairs are rendered by code, not asked of the model
  ([#122](https://github.com/OpusPopuli/prompt-service/pull/122)).

### Fixed

- **Image builds**: pnpm is pinned to 9.15.9, because `@latest` broke every
  image build ([#112](https://github.com/OpusPopuli/prompt-service/pull/112)).

## [0.4.0] - 2026-08-23

### Changed

- `document-analysis-petition` → **v2**: classification-first — returns a
  `{ "skip": true, "reason": "not_a_petition" | "unreadable" }` sentinel
  for non-petition or undecipherable text instead of fabricating
  petition-shaped analysis
  ([#107](https://github.com/OpusPopuli/prompt-service/issues/107),
  [#108](https://github.com/OpusPopuli/prompt-service/pull/108); consumed
  by [opuspopuli#1057](https://github.com/OpusPopuli/opuspopuli/issues/1057)).
  Closed reason enum; skip responses never echo document text;
  conservative bias so a genuine (even noisy-OCR) petition is never
  skipped. Analysis output unchanged for genuine petitions.
- Seed supports per-template `version` bumps: revisions now move
  `promptVersion` in consumer provenance and write a
  `PromptVersionHistory` row.

### Fixed

- `release.yml` now has `contents: write` so anchore/sbom-action can
  attach SBOMs to the GitHub Release — the v0.3.0 run failed at that step
  after the image was already pushed and signed
  ([#106](https://github.com/OpusPopuli/prompt-service/pull/106)).

### Deploy

Node prompts DB must be re-seeded (`pnpm db:seed`) after this image is
deployed so the v2 template row lands; until then the opuspopuli
classifier never fires (safe — behavior identical to v1).

## [0.3.0] - 2026-08-22

### Added

- `personalized-impact` prompt template + `personalized_impact` category —
  the petition-scan "What this means to you" read
  ([#103](https://github.com/OpusPopuli/prompt-service/issues/103),
  [#104](https://github.com/OpusPopuli/prompt-service/pull/104); consumed by
  [opuspopuli#1052](https://github.com/OpusPopuli/opuspopuli/issues/1052)).
  Output contract is plain text (2–4 sentences, 40–90 words, descriptive
  never persuasive) or the exact sentinel `SKIP` — unlike the JSON
  relevance-explanation family, the caller renders the output verbatim.
- `PersonalizedImpactDto` + `POST /prompts/personalized-impact`, with size
  caps and slug patterns on every interpolated field.

### Changed

- `interpolate()` is now a single regex pass with literal replacement:
  values are never re-scanned (a document-derived value containing
  `{{OTHER_VAR}}` can no longer hoist another variable's content past a
  SECURITY NOTICE) and `$`-patterns (`$&`, `` $` ``) in values are inert.
  Rendered output is unchanged for all existing templates.
- The seed's `prompts` array is exported (script entry guarded by
  `require.main`) so specs pin the real seeded template text against the
  descriptor variable maps — template/descriptor drift is now a test
  failure instead of a silently degraded prompt.

### Security

- Trust boundary in the new template: all analysis-derived content (effect
  line, benefit/burden groups, summary block) sits below the SECURITY
  NOTICE; only declared signals and operator metadata sit above it.
- Dependency override: `deepmerge-ts >= 8.0.0`
  (GHSA-ggr8-5vv4-36mx, HIGH, transitive via `prisma`).

## [0.2.0] - 2026-08-14

First tag-based release baseline. **Note:** the `v0.2.0` tag was prepared
([#102](https://github.com/OpusPopuli/prompt-service/pull/102)) but never
pushed; if backfilled, it points at merge `3e98035`.

### Changed

- Trunk-based workflow: `develop` collapsed into `main`
  ([#100](https://github.com/OpusPopuli/prompt-service/pull/100)); releases
  ship from `v*` tags.

### Fixed

- Pre-push guard no longer blocks tag pushes — tags are how releases ship
  ([#101](https://github.com/OpusPopuli/prompt-service/pull/101)).

## Pre-0.2.0 (develop-era, untagged)

Shipped via release PRs to main, newest first: js-yaml ReDoS fix + SDLC
plugin adoption (#99), civics-extraction-compact template (#94), multi-arch
image builds (#91), ghcr.io publish + prod compose overlay (#89), formatting
(#87), briefing-summary template + endpoint (#85), and earlier work.
