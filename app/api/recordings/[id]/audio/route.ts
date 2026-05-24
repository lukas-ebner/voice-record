import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { getDb, RECORDINGS_DIR, type Recording } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = getDb();
  const row = db.prepare('SELECT * FROM recordings WHERE id = ?').get(id) as Recording | undefined;
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const fullPath = path.join(RECORDINGS_DIR, row.filename);
  if (!fs.existsSync(fullPath)) {
    return NextResponse.json({ error: 'File missing' }, { status: 404 });
  }

  const stat = fs.statSync(fullPath);
  const stream = fs.createReadStream(fullPath);

  return new NextResponse(stream as unknown as ReadableStream, {
    status: 200,
    headers: {
      'Content-Type': row.mime_type,
      'Content-Length': String(stat.size),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600'
    }
  });
}
