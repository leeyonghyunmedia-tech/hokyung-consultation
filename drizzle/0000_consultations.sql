CREATE TABLE IF NOT EXISTS visits (
 id TEXT PRIMARY KEY NOT NULL,
 campaign TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 attribution TEXT NOT NULL,
 step INTEGER NOT NULL DEFAULT 0,
 answer1 TEXT,
 answer2 TEXT,
 started_at TEXT,
 name TEXT,
 phone TEXT,
 consent_at TEXT,
 consent_version TEXT,
 completed INTEGER NOT NULL DEFAULT 0,
 completed_at TEXT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_visits_created_at ON visits(created_at);
