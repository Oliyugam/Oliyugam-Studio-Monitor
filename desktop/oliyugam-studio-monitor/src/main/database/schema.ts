export const DATABASE_SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS agent_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS secure_credentials (
  key TEXT PRIMARY KEY,
  ciphertext_base64 TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS device_identity (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  device_id TEXT NOT NULL UNIQUE,
  device_name TEXT NOT NULL,
  platform TEXT NOT NULL,
  operating_system TEXT NOT NULL,
  agent_version TEXT NOT NULL,
  enrollment_state TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_successful_sync TEXT,
  last_heartbeat TEXT
);

CREATE TABLE IF NOT EXISTS attendance_events (
  id INTEGER PRIMARY KEY,
  client_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  event_timestamp TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS activity_events (
  id INTEGER PRIMARY KEY,
  client_event_id TEXT NOT NULL UNIQUE,
  event_timestamp TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS app_usage_events (
  id INTEGER PRIMARY KEY,
  client_event_id TEXT NOT NULL UNIQUE,
  application_id TEXT NOT NULL,
  category TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS system_metrics (
  id INTEGER PRIMARY KEY,
  client_event_id TEXT NOT NULL UNIQUE,
  sampled_at TEXT NOT NULL,
  cpu_percent REAL NOT NULL,
  memory_percent REAL NOT NULL,
  disk_percent REAL NOT NULL,
  network_available INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id INTEGER PRIMARY KEY,
  client_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  event_timestamp TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (sync_status IN ('pending', 'synced', 'failed')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_attempt_at TEXT,
  next_attempt_at TEXT,
  error_code TEXT
);

CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS local_logs (
  id INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL,
  level TEXT NOT NULL,
  code TEXT NOT NULL,
  message TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_pending
  ON sync_queue(sync_status, next_attempt_at, id);
CREATE INDEX IF NOT EXISTS idx_attendance_timestamp
  ON attendance_events(event_timestamp);
CREATE INDEX IF NOT EXISTS idx_activity_timestamp
  ON activity_events(event_timestamp);
CREATE INDEX IF NOT EXISTS idx_app_usage_started
  ON app_usage_events(started_at);
CREATE INDEX IF NOT EXISTS idx_system_metrics_sampled
  ON system_metrics(sampled_at);
CREATE INDEX IF NOT EXISTS idx_local_logs_created
  ON local_logs(created_at);
`;