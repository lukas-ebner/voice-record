import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getDb, RECORDINGS_DIR, type Recording } from '@/lib/db';
import { transcribeRecording } from '@/lib/whisper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function extFromMime(mime: string): string {
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4') || mime.includes('m4a')) return 'm4a';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('wav')) return 'wav';
  return 'bin';
}

function formatDefaultTitle(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Aufnahme ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export async function GET() {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM recordings ORDER BY datetime(created_at) DESC')
    .all() as Recording[];
  return NextResponse.json({ recordings: rows });
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
  }

  const durationStr = form.get('duration_ms');
  const duration_ms = typeof durationStr === 'string' && durationStr.length > 0
    ? Number.parseInt(durationStr, 10)
    : null;

  const mime = file.type || 'audio/webm';
  const id = randomUUID();
  const ext = extFromMime(mime);
  const filename = `${id}.${ext}`;
  const fullPath = path.join(RECORDINGS_DIR, filename);

  const arrayBuf = await file.arrayBuffer();
  const buf = Buffer.from(arrayBuf);
  fs.writeFileSync(fullPath, buf);

  const title = formatDefaultTitle(new Date());

  const db = getDb();
  db.prepare(
    `INSERT INTO recordings (id, filename, mime_type, duration_ms, size_bytes, title, transcript_status)
     VALUES (?, ?, ?, ?, ?, ?, 'pending')`
  ).run(id, filename, mime, duration_ms, buf.length, title);

  const row = db.prepare('SELECT * FROM recordings WHERE id = ?').get(id) as Recording;

  // Kick off transcription asynchronously
  void transcribeRecording(id).catch((e) => {
    console.error('Background transcription failed', e);
  });

  return NextResponse.json({ recording: row }, { status: 201 });
}
