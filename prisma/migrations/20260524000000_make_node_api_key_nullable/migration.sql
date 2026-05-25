-- Phase 1 of dropping the plaintext nodes.api_key column (issue #59).
-- Service code stops reading and writing this column in the same PR.
-- The column itself is dropped in a follow-up migration once this change
-- has been deployed and verified (additive-only rule per CLAUDE.md).
--
-- Auth paths after this migration:
--   - Bearer: lookup by api_key_hash (already in place)
--   - HMAC:   lookup by id + Vault.getSecret(api_key_secret_id) (already in place)
-- The plaintext value is returned in registration/rotation response bodies
-- only; it never re-enters the DB.

-- Drop unique constraint so future inserts can leave api_key NULL
DROP INDEX IF EXISTS "nodes_api_key_key";

-- Drop secondary lookup index — no code path queries by plaintext key
DROP INDEX IF EXISTS "nodes_api_key_idx";

-- Allow NULL so service code can stop writing the column
ALTER TABLE "nodes" ALTER COLUMN "api_key" DROP NOT NULL;
