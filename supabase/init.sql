-- Enable Supabase Vault extension for encrypted secret storage
-- Runs after the image's built-in init-scripts which create required roles/schemas
CREATE SCHEMA IF NOT EXISTS vault;
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";
