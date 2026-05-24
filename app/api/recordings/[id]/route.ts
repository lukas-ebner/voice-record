import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { getDb, RECORDINGS_DIR, type Recording } from '@/lib/db';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const db = getDb();
  const row = db.prepare('SELECT * FROM recordings WHERE id = ?').get(id) as Recording | undefined;
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updates: string[] = [];
  const values: unknown[] = [];

  if (typeof body.title === 'string') {
    updates.push('title = ?');
    values.push(body.title.slice(0, 500));
  }
  if (typeof body.transcript === 'string') {
    updates.push('transcript = ?');
    values.push(body.transcript);
  }

  if (updates.length === 0) {
    return NextResponse.json({ recording: row });
  }

  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);
  db.prepare(`UPDATE recordings SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT * FROM recordings WHERE id = ?').get(id) as Recording;
  return NextResponse.json({ recording: updated });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = getDb();
  const row = db.prepare('SELECT * FROM recordings WHERE id = ?').get(id) as Recording | undefined;
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const fullPath = path.join(RECORDINGS_DIR, row.filename);
  try {
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  } catch (e) {
    console.error('Failed to delete file', e);
  }
  db.prepare('DELETE FROM recordings WHERE id = ?').run(id);
  return NextResponse.json({ ok: true });
}
