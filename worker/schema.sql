PRAGMA foreign_keys = ON;

-- Workers (menos de 20, simple y robusto)
CREATE TABLE IF NOT EXISTS workers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  worker_name TEXT NOT NULL UNIQUE,
  worker_key TEXT NOT NULL UNIQUE,
  country_code TEXT NOT NULL DEFAULT 'PE',
  timezone TEXT NOT NULL DEFAULT 'America/Lima',
  required_schedule TEXT NOT NULL DEFAULT 'MON_FRI', -- MON_FRI | MON_SAT | ALL_DAYS
  exclude_holidays INTEGER NOT NULL DEFAULT 1,       -- 1=true
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Entradas (histórico sin borrar)
CREATE TABLE IF NOT EXISTS workers_sleep_entries (
  id TEXT PRIMARY KEY, -- uuid
  worker_id INTEGER NOT NULL,
  worker_name TEXT NOT NULL,
  worker_key TEXT NOT NULL,
  date TEXT NOT NULL, -- YYYY-MM-DD
  sleep_h INTEGER NOT NULL,
  sleep_m INTEGER NOT NULL CHECK (sleep_m BETWEEN 0 AND 59),
  sleep_text TEXT NOT NULL,
  duration_min INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual', -- telegram | manual
  chat_id TEXT,
  file_id TEXT,
  notes TEXT,
  raw_text TEXT,
  image_url TEXT,
  pdf_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(worker_id) REFERENCES workers(id)
);

CREATE INDEX IF NOT EXISTS idx_entries_date ON workers_sleep_entries(date);
CREATE INDEX IF NOT EXISTS idx_entries_worker_date ON workers_sleep_entries(worker_key, date);
CREATE INDEX IF NOT EXISTS idx_entries_created ON workers_sleep_entries(created_at);

-- Feriados por año/país (carga manual por ahora)
CREATE TABLE IF NOT EXISTS holidays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL, -- YYYY-MM-DD
  country_code TEXT NOT NULL, -- PE, etc.
  name TEXT NOT NULL,
  is_required INTEGER NOT NULL DEFAULT 0, -- 0=No obligatorio, 1=Obligatorio
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(date, country_code)
);

CREATE INDEX IF NOT EXISTS idx_holidays_date_country ON holidays(date, country_code);

-- Ejemplo mínimo (puedes borrar/editar):
-- INSERT INTO holidays(date, country_code, name, is_required) VALUES ('2026-01-01','PE','Año Nuevo',0);
