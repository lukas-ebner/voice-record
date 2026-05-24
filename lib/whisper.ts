import fs from 'node:fs';
import path from 'node:path';
import { getDb, RECORDINGS_DIR, type Recording } from './db';

export async function transcribeRecording(id: string): Promise<void> {
  const db = getDb();
  const row = db.prepare('SELECT * FROM recordings WHERE id = ?').get(id) as Recording | undefined;
  if (!row) return;

  if (row.transcript_status === 'processing') return;

  db.prepare(
    'UPDATE recordings SET transcript_status = ?, transcript_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run('processing', id);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    db.prepare(
      'UPDATE recordings SET transcript_status = ?, transcript_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run('failed', 'OPENAI_API_KEY not configured', id);
    return;
  }

  const filePath = path.join(RECORDINGS_DIR, row.filename);
  if (!fs.existsSync(filePath)) {
    db.prepare(
      'UPDATE recordings SET transcript_status = ?, transcript_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run('failed', 'Audio file missing', id);
    return;
  }

  try {
    const buf = fs.readFileSync(filePath);
    const blob = new Blob([buf], { type: row.mime_type });
    const form = new FormData();
    form.append('file', blob, row.filename);
    form.append('model', 'whisper-1');
    form.append('language', 'de');
    form.append('response_format', 'json');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Whisper ${res.status}: ${text.slice(0, 500)}`);
    }

    const json = (await res.json()) as { text?: string };
    const transcript = (json.text || '').trim();

    db.prepare(
      'UPDATE recordings SET transcript = ?, transcript_status = ?, transcript_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(transcript, 'done', id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    db.prepare(
      'UPDATE recordings SET transcript_status = ?, transcript_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run('failed', msg, id);
  }
}
