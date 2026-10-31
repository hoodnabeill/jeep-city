-- Every update bumps server_seq so devices can pull "everything changed after N" (sync, PLAN §5).
CREATE OR REPLACE FUNCTION bump_server_seq() RETURNS trigger AS $$
BEGIN
  NEW.server_seq := nextval('change_seq');
  RETURN NEW;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'server_seq' LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION bump_server_seq()', r.table_name || '_seq_trg', r.table_name);
  END LOOP;
END $$;
--> statement-breakpoint
-- Ledgers are append-only: corrections are new rows, never edits or deletes.
CREATE OR REPLACE FUNCTION forbid_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'append-only table: %', TG_TABLE_NAME;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['stock_movements', 'cash_movements', 'customer_ledger', 'supplier_ledger', 'payments', 'audit_log', 'statement_revisions'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION forbid_change()', t || '_append_only', t);
  END LOOP;
END $$;
