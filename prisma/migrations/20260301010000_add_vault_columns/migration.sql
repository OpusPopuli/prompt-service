-- Add columns for Vault-based API key management
ALTER TABLE "nodes" ADD COLUMN "api_key_hash" TEXT;
ALTER TABLE "nodes" ADD COLUMN "api_key_secret_id" TEXT;

-- Backfill api_key_hash from existing plaintext keys using SHA-256
UPDATE "nodes"
SET "api_key_hash" = encode(sha256("api_key"::bytea), 'hex')
WHERE "api_key" IS NOT NULL AND "api_key_hash" IS NULL;

-- Create index on api_key_hash for hash-based lookups
CREATE INDEX "nodes_api_key_hash_idx" ON "nodes"("api_key_hash");
