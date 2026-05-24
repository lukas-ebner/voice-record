import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
export const RECORDINGS_DIR = path.join(DATA_DIR, 'recordings');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(RECORDINGS_DIR)) fs.mkdirSync(RECORDINGS_DIR, { recursive: true });

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  const db = new Database(path.join(DATA_DIR, 'db.sqlite'));
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS recordings (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      duration_ms INTEGER,
      size_bytes INTEGER NOT NULL,
      title TEXT,
      transcript TEXT,
      transcript_status TEXT NOT NULL DEFAULT 'pending',
      transcript_error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_recordings_created ON recordings(created_at DESC);
  `);
  _db = db;
  return db;
}

export interface Recording {
  id: string;
  filename: string;
  mime_type: string;
  duration_ms: number | null;
  size_bytes: number;
  title: string | null;
  transcript: string | null;
  transcript_status: 'pending' | 'processing' | 'done' | 'failed';
  transcript_error: string | null;
  created_at: string;
  updated_at: string;
}
