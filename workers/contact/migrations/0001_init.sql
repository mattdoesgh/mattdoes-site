-- Contact form submission log. MailChannels has no dashboard, so this table
-- is the system of record for "what did someone send me".

CREATE TABLE IF NOT EXISTS submissions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  ip_hash       TEXT    NOT NULL,       -- sha256(ip + daily salt), not the raw IP
  country       TEXT,
  ua            TEXT,
  name          TEXT,
  email         TEXT,
  subject       TEXT,
  body          TEXT    NOT NULL,
  honeypot_hit  INTEGER NOT NULL DEFAULT 0,  -- 1 if the bot field was filled
  mail_status   TEXT,                         -- 'sent' | 'failed' | 'skipped'
  mail_error    TEXT
);

CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_ip_hash    ON submissions(ip_hash, created_at);
