-- Convert all timestamp columns to timezone-aware (timestamptz), preserving the exact instant.
-- Existing values were stored as UTC wall-clock, so interpret them AT TIME ZONE 'UTC'.
-- After this, the database renders/stores timestamps in the connection time zone (Asia/Kolkata).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.table_schema, c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND c.data_type = 'timestamp without time zone'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN %I TYPE timestamptz(3) USING %I AT TIME ZONE ''UTC''',
      r.table_schema, r.table_name, r.column_name, r.column_name
    );
  END LOOP;
END $$;
