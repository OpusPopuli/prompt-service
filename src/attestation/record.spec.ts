import { join } from 'node:path';
import { prompts } from '../../prisma/seed';
import { verifyManifest } from './manifest';
import { readRecord, toSeedTemplates } from './record-io';

/**
 * The committed record is complete and untampered (opuspopuli#1450).
 *
 * This is the gate: it runs in `pnpm test` (pre-commit and CI). Change a
 * template in prisma/seed.ts without running `pnpm attestation:generate`, or
 * change its text without bumping `version`, and this fails — so an output's
 * receipt can never point at a prompt the public record does not hold.
 */
describe('the published attestation record', () => {
  it('holds every seeded template, each file intact', () => {
    const { manifest, files } = readRecord(
      join(__dirname, '..', '..', 'attestation'),
    );
    expect(verifyManifest(manifest, files, toSeedTemplates(prompts))).toEqual(
      [],
    );
  });
});
