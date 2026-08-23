# Changelog

All notable changes to the Opus Populi prompt-service are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Releases ship by pushing a `v*` tag (`release.yml` builds, signs, and
publishes the image). Versions before 0.2.0 shipped through develop-era
release PRs without tags; that history is summarized below rather than
reconstructed.

## [Unreleased]

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
