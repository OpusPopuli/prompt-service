-- Create supabase_admin role required by the image's migrate.sh
-- Must run before migrate.sh (alphabetically: 'll' < 'm')
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    CREATE ROLE supabase_admin LOGIN SUPERUSER PASSWORD 'postgres';
  END IF;
END
$$;
