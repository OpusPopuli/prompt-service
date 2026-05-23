-- Enforces that variant traffic_pct values sum to exactly 100 per experiment.
--
-- A CHECK constraint cannot aggregate across rows in PostgreSQL, so we use a
-- CONSTRAINT TRIGGER marked DEFERRABLE INITIALLY DEFERRED. The deferred mode is
-- critical: Prisma inserts variants one row at a time within a single transaction,
-- so a per-row immediate trigger would fire after the first INSERT (sum = e.g. 50)
-- and always fail. Deferring to end-of-transaction lets all variants land first.
--
-- The trigger fires only on INSERT and UPDATE (not DELETE) because variants are
-- only removed via CASCADE when their parent experiment is deleted — at which
-- point the sum constraint is moot.

CREATE OR REPLACE FUNCTION check_experiment_traffic_pct()
RETURNS TRIGGER AS $$
DECLARE
  total INT;
BEGIN
  SELECT COALESCE(SUM(traffic_pct), 0)
  INTO total
  FROM experiment_variants
  WHERE experiment_id = NEW.experiment_id;

  IF total <> 100 THEN
    RAISE EXCEPTION
      'Experiment variant traffic_pct values must sum to 100, got % for experiment_id %',
      total, NEW.experiment_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER experiment_traffic_pct_check
  AFTER INSERT OR UPDATE ON experiment_variants
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_experiment_traffic_pct();
