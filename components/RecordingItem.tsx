'use client';

import { useState } from 'react';
import type { Recording } from './RecorderApp';

function fmtDate(s: string): string {
  // SQLite returns "YYYY-MM-DD HH:MM:SS" in UTC
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function fmtDuration(ms: number | null): string {
  if (!ms || ms < 0) return '—';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function RecordingItem({
  rec,
  onChange,
  onDelete
}: {
  rec: Recording;
  onChange: (r: Recording) => void;
  onDelete: (id: string) => void;
}) {
  const [title, setTitle] = useState(rec.title || '');
  const [editingTitle, setEditingTitle] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [copyOk, setCopyOk] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);

  async function saveTitle() {
    if (title === (rec.title || '')) {
      setEditingTitle(false);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/recordings/${rec.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title })
      });
      if (res.ok) {
        const data = await res.json();
        onChange(data.recording);
      }
    } finally {
      setBusy(false);
      setEditingTitle(false);
    }
  }

  async function onTranscribe() {
    setBusy(true);
    try {
      const res = await fetch(`/api/recordings/${rec.id}/transcribe`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        onChange(data.recording);
      }
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteClick() {
    if (!window.confirm('Aufnahme wirklich löschen?')) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/recordings/${rec.id}`, { method: 'DELETE' });
      if (res.ok) onDelete(rec.id);
    } finally {
      setDeleting(false);
    }
  }

  async function onCopy() {
    if (!rec.transcript) return;
    try {
      await navigator.clipboard.writeText(rec.transcript);
      setCopyOk(true);
      setTimeout(() => setCopyOk(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <li className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveTitle();
                if (e.key === 'Escape') {
                  setTitle(rec.title || '');
                  setEditingTitle(false);
                }
              }}
              className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100 text-sm"
              disabled={busy}
            />
          ) : (
            <button
              onClick={() => setEditingTitle(true)}
              className="text-left text-slate-100 font-medium truncate hover:text-indigo-300 transition w-full"
              title="Titel bearbeiten"
            >
              {rec.title || 'Ohne Titel'}
            </button>
          )}
          <div className="text-xs text-slate-500 mt-0.5">
            {fmtDate(rec.created_at)} · {fmtDuration(rec.duration_ms)}
          </div>
        </div>
        <button
          onClick={onDeleteClick}
          disabled={deleting}
          className="text-slate-500 hover:text-rose-400 transition p-1"
          aria-label="Löschen"
          title="Löschen"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>

      <audio
        controls
        preload="none"
        src={`/api/recordings/${rec.id}/audio`}
        className="w-full mt-3"
      />

      <div className="mt-3">
        {rec.transcript_status === 'done' && rec.transcript ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={() => setTranscriptOpen((v) => !v)}
                className="text-sm text-indigo-300 hover:text-indigo-200 transition flex items-center gap-1"
              >
                <span>{transcriptOpen ? 'Transkript verbergen' : 'Transkript anzeigen'}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={transcriptOpen ? 'rotate-180 transition' : 'transition'}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={onCopy}
                  className="text-xs text-slate-400 hover:text-slate-200 transition"
                  title="Transkript kopieren"
                >
                  {copyOk ? 'Kopiert!' : 'Kopieren'}
                </button>
                <button
                  onClick={onTranscribe}
                  disabled={busy}
                  className="text-xs text-slate-500 hover:text-slate-300 transition"
                  title="Transkript neu erstellen"
                >
                  Neu
                </button>
              </div>
            </div>
            {transcriptOpen && (
              <p className="text-sm text-slate-300 whitespace-pre-wrap bg-slate-950/50 border border-slate-800 rounded p-3 leading-relaxed">
                {rec.transcript}
              </p>
            )}
          </div>
        ) : rec.transcript_status === 'processing' || rec.transcript_status === 'pending' ? (
          <div className="text-sm text-slate-400 flex items-center gap-2">
            <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            Transkribiere…
          </div>
        ) : rec.transcript_status === 'failed' ? (
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-rose-400 truncate" title={rec.transcript_error || ''}>
              Transkription fehlgeschlagen{rec.transcript_error ? `: ${rec.transcript_error}` : ''}
            </div>
            <button
              onClick={onTranscribe}
              disabled={busy}
              className="text-xs rounded bg-slate-800 hover:bg-slate-700 px-3 py-1 text-slate-200 transition disabled:opacity-50"
            >
              Erneut
            </button>
          </div>
        ) : (
          <button
            onClick={onTranscribe}
            disabled={busy}
            className="text-sm rounded bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-slate-200 transition disabled:opacity-50"
          >
            Transkribieren
          </button>
        )}
      </div>
    </li>
  );
}
