# Prompt attestation record

Every AI-written passage in Opus Populi records the **sha256 of the prompt template** that
produced it. This directory publishes those templates, so you can go from a passage on the site
to the exact words the model was given, and check that the two match.

> The on-page receipts described below ship with
> [opuspopuli#1450](https://github.com/OpusPopuli/opuspopuli/issues/1450). The hashes are already
> recorded on every output; this record is what they resolve against.

```
attestation/
├── manifest.json           every published template text: its hash, size, name and version
└── templates/<sha256>.txt  the exact template text, byte for byte
```

## Checking a prompt yourself

1. On an Opus Populi page, open **How this was made** under an AI-written section and note the
   prompt hash.
2. Open `templates/<that hash>.txt` here. That is the template the model was given; the source
   document (a bill, a proposition) is inserted where the `{{PLACEHOLDERS}}` are.
3. Confirm the file is genuine. Its name is the hash of its own contents:

   ```bash
   shasum -a 256 templates/<hash>.txt     # macOS
   sha256sum templates/<hash>.txt         # Linux
   ```

   The printed hash must equal the file name. If someone altered the file — even one character,
   even its line endings — it would not.

`manifest.json` tells you which template it is (`labels`: name and version). One text can carry
more than one label, for example when a variant was promoted to the main name unchanged. Labels
on texts recovered from history are as the seed file declared them; the hash is what is exact.

## What the record promises

- **Complete for `main`.** It holds every template `prisma/seed.ts` has seeded on the `main`
  branch, back to its first commit, and every template it seeds today. `pnpm test` fails if a
  seeded template is missing.
- **Append-only.** A published text is never removed or changed, so an output made from an older
  prompt stays checkable after the prompt is revised. CI rejects a pull request that removes an
  entry or one of its labels; a file whose contents change no longer matches its own name.
- **Unambiguous from here on.** A template's text cannot change without its version changing.
  Before this record existed, 14 templates were edited without a version bump; they are listed
  in `grandfatheredLabels`, and that list cannot grow. This is why outputs are identified by
  **hash**, not by version: the hash is exact either way.

## What it does not cover

- **Text that never went through `prisma/seed.ts` on `main`.** That includes templates created
  or edited through the service's admin API, experiment variants, prompts on branches that were
  never merged, and prompts a node edited in its own database. Their hashes are not here. When
  Opus Populi's receipts ship (#1450), they will say "not in the public record" in that case
  rather than hide it. As of 2026-11-17, production had served no such text: all 46 versions it recorded are
  published here.
- **Runtime state.** Which experiment arm a node is in, and per-region tuning values, live in the
  deployed service's database, not in this repository.

## For maintainers

After editing a template in `prisma/seed.ts`:

```bash
pnpm attestation:generate   # writes the new templates/<hash>.txt and updates manifest.json
pnpm attestation:check      # the same verification the test suite runs
```

Commit both with the template change. Bump the template's `version` whenever its text changes.
`pnpm attestation:backfill` rebuilt the record from git history once and should not need to run
again.
