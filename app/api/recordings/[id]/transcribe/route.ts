import { NextRequest, NextResponse } from 'next/server';
import { getDb, type Recording } from '../../../../../lib/db';
import { transcribeRecording } from '../../../../../lib/whisper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = getDb();
  const row = db.prepare('SELECT * FROM recordings WHERE id = ?').get(id) as Recording | undefined;
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Kick off async
  void transcribeRecording(id).catch((e) => console.error(e));

  // Mark as processing immediately so the UI reflects it
  db.prepare(
    "UPDATE recordings SET transcript_status = 'processing', transcript_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(id);

  const updated = db.prepare('SELECT * FROM recordings WHERE id = ?').get(id) as Recording;
  return NextResponse.json({ recording: updated });
}
