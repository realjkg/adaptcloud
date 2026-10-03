-- AIDigest schema (Postgres). Applied idempotently at service startup by
-- aidigest/db.py:apply_schema(); safe to run by hand with psql as well.
-- When schema "aidigest" already exists (the recommended least-privilege setup,
-- see README), CREATE SCHEMA is skipped so the role needs no database CREATE.
-- Everything lives in schema "aidigest" so nothing collides with homeschool
-- tables in "public". Statements are separated by ";" and must not contain
-- a literal semicolon.

CREATE SCHEMA IF NOT EXISTS aidigest;

CREATE TABLE IF NOT EXISTS aidigest.articles (
  id TEXT PRIMARY KEY,                 -- sha256(url)
  url TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  lead TEXT NOT NULL,
  summary TEXT NOT NULL,
  why_adapt TEXT NOT NULL,
  next_move TEXT NOT NULL,
  category TEXT NOT NULL,
  score INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_articles_created ON aidigest.articles(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_score ON aidigest.articles(score DESC);

CREATE TABLE IF NOT EXISTS aidigest.knowledge (
  id TEXT PRIMARY KEY,                 -- sha256(source_url || topic || statement)
  topic TEXT NOT NULL,
  statement TEXT NOT NULL,
  source_url TEXT NOT NULL,
  confidence REAL NOT NULL CHECK (confidence >= 0.75 AND confidence <= 1),
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_knowledge_topic ON aidigest.knowledge(topic);

CREATE TABLE IF NOT EXISTS aidigest.tasks (
  id TEXT PRIMARY KEY,
  requested_by TEXT NOT NULL,
  request_text TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,                -- running | completed | failed
  result_json TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS aidigest.runs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,                  -- daily
  run_key TEXT,                        -- daily:YYYY-MM-DD (UTC)
  trigger TEXT,                        -- schedule | operator
  status TEXT NOT NULL,                -- running | completed | failed | schema_not_ready
  owner TEXT,                          -- random token of the process holding the lease
  lease_until TIMESTAMPTZ,             -- a running row may be taken over only after this
  candidates INTEGER NOT NULL DEFAULT 0,
  accepted INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ
);
-- At most one in-flight or completed run per key (day): blocks concurrent and
-- duplicate DAILY runs across workers and restarts; failed runs free the key.
CREATE UNIQUE INDEX IF NOT EXISTS uq_runs_active_key
  ON aidigest.runs(run_key) WHERE status IN ('running', 'completed');
CREATE INDEX IF NOT EXISTS idx_runs_created ON aidigest.runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_user_created ON aidigest.tasks(requested_by, created_at DESC)
