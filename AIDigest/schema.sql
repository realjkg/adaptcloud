PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  published_at TEXT,
  lead TEXT NOT NULL,
  summary TEXT NOT NULL,
  why_adapt TEXT NOT NULL,
  next_move TEXT NOT NULL,
  category TEXT NOT NULL,
  score INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_articles_created ON articles(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_score ON articles(score DESC);

CREATE TABLE IF NOT EXISTS knowledge (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  statement TEXT NOT NULL,
  source_url TEXT NOT NULL,
  confidence REAL NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_knowledge_topic ON knowledge(topic);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  requested_by TEXT NOT NULL,
  request_text TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  result_json TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  candidates INTEGER NOT NULL DEFAULT 0,
  accepted INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
