-- ============================================================
-- Row-Level Security + Integrity constraints for agnusdei.ai
--
-- Run once after create_tables() on a hosted Postgres instance.
-- SQLite (desktop mode) does not support RLS — skip this file.
--
-- The API sets the family context at the start of every session:
--   SET LOCAL app.current_family_id = '<uuid>';
-- RLS policies then enforce family isolation at the DB layer
-- even if the application layer is fully compromised.
-- ============================================================

-- ── Application role (least-privilege DB user) ─────────────
-- The API connects as 'bede_app', not as the superuser.
-- Create this role before running, then grant table access:
--
--   CREATE ROLE bede_app LOGIN PASSWORD '...';
--   GRANT CONNECT ON DATABASE bede TO bede_app;
--   GRANT USAGE ON SCHEMA public TO bede_app;
--   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bede_app;
--   GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO bede_app;


-- ── Helper: set family context (called per-request in app) ──
-- Usage: SELECT set_family_context('<uuid>');
CREATE OR REPLACE FUNCTION set_family_context(fid TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('app.current_family_id', fid, true);  -- true = local to txn
END;
$$;


-- ── Enable RLS on every family-scoped data table ────────────

ALTER TABLE student_configs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE narration_assessments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE learner_profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_transcripts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log              ENABLE ROW LEVEL SECURITY;
ALTER TABLE passkey_credentials    ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_keys            ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_codes         ENABLE ROW LEVEL SECURITY;


-- ── RLS policies: only rows matching current family_id ──────

CREATE POLICY family_isolation ON student_configs
  USING (family_id = current_setting('app.current_family_id', true));

CREATE POLICY family_isolation ON voice_profiles
  USING (family_id = current_setting('app.current_family_id', true));

CREATE POLICY family_isolation ON narration_assessments
  USING (family_id = current_setting('app.current_family_id', true));

CREATE POLICY family_isolation ON learner_profiles
  USING (family_id = current_setting('app.current_family_id', true));

CREATE POLICY family_isolation ON session_transcripts
  USING (family_id = current_setting('app.current_family_id', true));

CREATE POLICY family_isolation ON passkey_credentials
  USING (family_id = current_setting('app.current_family_id', true));

CREATE POLICY family_isolation ON family_users
  USING (family_id = current_setting('app.current_family_id', true));

CREATE POLICY family_isolation ON family_keys
  USING (family_id = current_setting('app.current_family_id', true));

CREATE POLICY family_isolation ON recovery_codes
  USING (family_id = current_setting('app.current_family_id', true));

-- Audit log: family-scoped rows + allow NULL family_id for system events
CREATE POLICY family_isolation ON audit_log
  USING (
    family_id IS NULL
    OR family_id = current_setting('app.current_family_id', true)
  );


-- ── Append-only audit log ───────────────────────────────────
-- UPDATE and DELETE silently no-op via RULE. Rows can only be inserted.
-- The ALSO qualifier means the triggering statement also runs, but since
-- we RETURN NULL the modifying operations produce no rows changed.

CREATE OR REPLACE RULE audit_log_no_update AS
  ON UPDATE TO audit_log DO INSTEAD NOTHING;

CREATE OR REPLACE RULE audit_log_no_delete AS
  ON DELETE TO audit_log DO INSTEAD NOTHING;


-- ── Anomaly detection: write-volume baseline table ──────────
-- Populated by the anomaly detection background job.

CREATE TABLE IF NOT EXISTS write_volume_baseline (
  hour_bucket   TIMESTAMPTZ  PRIMARY KEY,
  insert_count  BIGINT       NOT NULL DEFAULT 0,
  update_count  BIGINT       NOT NULL DEFAULT 0
);

-- View: hourly write counts for the last 48 hours (for alerting queries)
CREATE OR REPLACE VIEW recent_write_volume AS
  SELECT
    date_trunc('hour', created_at) AS hour_bucket,
    count(*) AS event_count
  FROM audit_log
  WHERE created_at > now() - interval '48 hours'
  GROUP BY 1
  ORDER BY 1 DESC;
