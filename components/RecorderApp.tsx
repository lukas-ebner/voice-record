'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import RecordingItem from './RecordingItem';

export type Recording = {
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
};

type RecState = 'idle' | 'recording' | 'uploading' | 'error';

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm';
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/mpeg'];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}

function fmtTimer(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function RecorderApp() {
  const router = useRouter();
  const [state, setState] = useState<RecState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  const loadRecordings = useCallback(async () => {
    try {
      const res = await fetch('/api/recordings', { cache: 'no-store' });
      if (res.status === 401) {
        router.replace('/login');
        return;
      }
      const data = await res.json();
      setRecordings(data.recordings || []);
    } catch {
      // ignore
    } finally {
      setLoadingList(false);
    }
  }, [router]);

  useEffect(() => {
    loadRecordings();
  }, [loadRecordings]);

  // Poll while any recording is pending/processing
  useEffect(() => {
    const anyPending = recordings.some(
      (r) => r.transcript_status === 'pending' || r.transcript_status === 'processing'
    );
    if (!anyPending) return;
    const id = window.setInterval(loadRecordings, 3000);
    return () => window.clearInterval(id);
  }, [recordings, loadRecordings]);

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMime();
      const opts: MediaRecorderOptions = mime ? { mimeType: mime } : {};
      const rec = new MediaRecorder(stream, opts);
      mediaRecorderRef.current = rec;
      chunksRef.current = [];
      startedAtRef.current = Date.now();

      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      rec.onerror = (e) => {
        console.error('MediaRecorder error', e);
        setError('Aufnahme-Fehler');
        setState('error');
      };

      rec.onstop = async () => {
        const duration = Date.now() - startedAtRef.current;
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || mime || 'audio/webm' });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        setState('uploading');
        try {
          const form = new FormData();
          const ext = (rec.mimeType || mime).includes('mp4') ? 'm4a' : 'webm';
          form.append('file', blob, `recording.${ext}`);
          form.append('duration_ms', String(duration));
          const res = await fetch('/api/recordings', { method: 'POST', body: form });
          if (res.status === 401) {
            router.replace('/login');
            return;
          }
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'Upload fehlgeschlagen');
          }
          const data = await res.json();
          setRecordings((prev) => [data.recording, ...prev]);
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Upload fehlgeschlagen';
          setError(msg);
        } finally {
          setState('idle');
          setElapsed(0);
        }
      };

      rec.start(250);
      setState('recording');
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = window.setInterval(() => {
        setElapsed(Date.now() - startedAtRef.current);
      }, 200);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Mikrofon-Zugriff verweigert';
      setError(msg);
      setState('error');
    }
  }, [router]);

  const stopRecording = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.stop();
    }
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onMainButton = useCallback(() => {
    if (state === 'idle' || state === 'error') return startRecording();
    if (state === 'recording') return stopRecording();
  }, [state, startRecording, stopRecording]);

  async function onLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  const buttonClasses =
    state === 'recording'
      ? 'bg-rose-500 animate-pulse-record'
      : state === 'uploading'
        ? 'bg-orange-500'
        : 'bg-gradient-to-br from-indigo-500 to-pink-500 hover:from-indigo-400 hover:to-pink-400';

  const buttonLabel =
    state === 'recording'
      ? 'Stoppen'
      : state === 'uploading'
        ? 'Hochladen…'
        : 'Aufnahme starten';

  return (
    <main className="min-h-screen max-w-2xl mx-auto px-4 py-6">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Voice Record</h1>
          <p className="text-xs text-slate-500">Drücke zum Aufnehmen, lass den Rest passieren.</p>
        </div>
        <button
          onClick={onLogout}
          className="text-xs text-slate-400 hover:text-slate-200 transition"
        >
          Logout
        </button>
      </header>

      <section className="flex flex-col items-center mb-10">
        <button
          onClick={onMainButton}
          disabled={state === 'uploading'}
          aria-label={buttonLabel}
          className={`w-[140px] h-[140px] rounded-full text-white font-medium shadow-lg transition-transform active:scale-95 disabled:opacity-70 ${buttonClasses} flex items-center justify-center`}
        >
          {state === 'recording' ? (
            <span className="w-10 h-10 rounded bg-white" />
          ) : state === 'uploading' ? (
            <svg className="animate-spin" width="38" height="38" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="white" strokeOpacity="0.3" strokeWidth="3" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="white" strokeWidth="3" strokeLinecap="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="56" height="56" fill="white" aria-hidden>
              <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z" />
              <path d="M19 11a1 1 0 1 0-2 0 5 5 0 1 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V20H8a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-3v-2.08A7 7 0 0 0 19 11Z" />
            </svg>
          )}
        </button>
        <div className="mt-4 h-6 text-slate-300 tabular-nums">
          {state === 'recording' ? fmtTimer(elapsed) : state === 'uploading' ? 'Lade hoch…' : ''}
        </div>
        {error && (
          <div className="mt-3 text-sm text-rose-400 text-center max-w-sm">{error}</div>
        )}
      </section>

      <section>
        <h2 className="text-sm uppercase tracking-wide text-slate-500 mb-3">Aufnahmen</h2>
        {loadingList ? (
          <div className="text-slate-500 text-sm">Lade…</div>
        ) : recordings.length === 0 ? (
          <div className="border border-dashed border-slate-800 rounded-xl py-12 text-center text-slate-500 text-sm">
            Noch keine Aufnahmen. Drücke den Button oben, um zu starten.
          </div>
        ) : (
          <ul className="space-y-3">
            {recordings.map((r) => (
              <RecordingItem
                key={r.id}
                rec={r}
                onChange={(updated) =>
                  setRecordings((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
                }
                onDelete={(id) => setRecordings((prev) => prev.filter((x) => x.id !== id))}
              />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
