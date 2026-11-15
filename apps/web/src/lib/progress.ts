import { supabase } from './supabase';
import { MOCK_ACCESS_TOKEN } from './mock-auth';

export interface ProgressRow {
  level_id: string;
  status: 'locked' | 'unlocked' | 'in_progress' | 'passed';
  attempts: number;
  hints_used: number;
  time_spent_sec: number;
  passed_at: string | null;
}

const API_URL = import.meta.env.VITE_API_URL;
const LOCAL_KEY = 'fde-progress:v1';

// ─── Local mirror ────────────────────────────────────────────────────────────
// Every save is mirrored into this browser so progress survives offline use
// and a failed sync never loses a pass.

function readLocal(): Record<string, ProgressRow> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed as Record<string, ProgressRow> : {};
  } catch {
    return {};
  }
}

function writeLocal(rows: Record<string, ProgressRow>): void {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(rows)); } catch { /* storage full or blocked */ }
}

/** Merge two rows for the same level, never downgrading a pass. */
export function mergeProgressRows(a: ProgressRow | undefined, b: ProgressRow): ProgressRow {
  if (!a) return b;
  const passed = a.status === 'passed' || b.status === 'passed';
  return {
    level_id: b.level_id,
    status: passed ? 'passed' : b.status,
    attempts: Math.max(a.attempts, b.attempts),
    hints_used: Math.max(a.hints_used, b.hints_used),
    time_spent_sec: Math.max(a.time_spent_sec, b.time_spent_sec),
    passed_at: a.passed_at ?? b.passed_at,
  };
}

function rememberLocally(update: Omit<ProgressRow, 'passed_at'>): void {
  const rows = readLocal();
  const passedAt = update.status === 'passed' ? new Date().toISOString() : null;
  rows[update.level_id] = mergeProgressRows(rows[update.level_id], { ...update, passed_at: passedAt });
  writeLocal(rows);
}

/** Progress stored in this browser only. */
export function getLocalProgress(): ProgressRow[] {
  return Object.values(readLocal());
}

// ─── Remote ──────────────────────────────────────────────────────────────────

export async function getProgress(accessToken: string): Promise<ProgressRow[]> {
  const local = readLocal();
  if (accessToken === MOCK_ACCESS_TOKEN) return Object.values(local);
  let remote: ProgressRow[];
  if (API_URL) {
    const response = await fetch(`${API_URL}/progress`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new Error('Could not load your progress.');
    const body = await response.json() as { progress: ProgressRow[] };
    remote = body.progress;
  } else {
    const { data, error } = await supabase.from('level_progress').select('level_id,status,attempts,hints_used,passed_at,time_spent_sec');
    if (error) throw error;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- supabase client is untyped here; data can be null at runtime
    remote = data ?? [];
  }
  const merged = { ...local };
  for (const row of remote) merged[row.level_id] = mergeProgressRows(local[row.level_id], row);
  writeLocal(merged);
  return Object.values(merged);
}

export async function saveProgress(accessToken: string, update: Omit<ProgressRow, 'passed_at'>): Promise<void> {
  rememberLocally(update);
  if (accessToken === MOCK_ACCESS_TOKEN) return;
  if (API_URL) {
    const response = await fetch(`${API_URL}/progress`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    });
    if (!response.ok) throw new Error('Could not save your progress. It is still saved on this device.');
    return;
  }
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.from('level_progress').upsert({ ...update, user_id: userData.user?.id }, { onConflict: 'user_id,level_id' });
  if (error) throw error;
}

// ─── Export / import (I16) ───────────────────────────────────────────────────

const EXPORT_FORMAT = 'fde-progress-export';
const STATUSES = new Set<ProgressRow['status']>(['locked', 'unlocked', 'in_progress', 'passed']);

function toCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

function parseRow(value: unknown): ProgressRow | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const attempts = toCount(row.attempts ?? 0);
  const hints = toCount(row.hints_used ?? 0);
  const time = toCount(row.time_spent_sec ?? 0);
  if (typeof row.level_id !== 'string' || !row.level_id || row.level_id.length > 200) return null;
  if (typeof row.status !== 'string' || !STATUSES.has(row.status as ProgressRow['status'])) return null;
  if (attempts === null || hints === null || time === null) return null;
  const passedAt = typeof row.passed_at === 'string' && !Number.isNaN(Date.parse(row.passed_at)) ? row.passed_at : null;
  return { level_id: row.level_id, status: row.status as ProgressRow['status'], attempts, hints_used: hints, time_spent_sec: time, passed_at: passedAt };
}

/** Serialise progress rows into a portable JSON document. */
export function serializeProgressExport(rows: ProgressRow[], now: Date = new Date()): string {
  return JSON.stringify({ format: EXPORT_FORMAT, version: 1, exported_at: now.toISOString(), progress: rows }, null, 2);
}

export type ParsedProgressImport =
  | { ok: true; rows: ProgressRow[]; skipped: number }
  | { ok: false; error: string };

/** Validate untrusted import text. Never throws. */
export function parseProgressImport(text: string): ParsedProgressImport {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { ok: false, error: 'That file is not valid JSON.' }; }
  const list = Array.isArray(data) ? data : (data && typeof data === 'object' ? (data as { progress?: unknown }).progress : undefined);
  if (!Array.isArray(list)) return { ok: false, error: 'This does not look like an FDE progress export.' };
  const rows: ProgressRow[] = [];
  let skipped = 0;
  for (const item of list) {
    const row = parseRow(item);
    if (row) rows.push(row); else skipped += 1;
  }
  if (!rows.length) return { ok: false, error: 'No valid progress entries were found in that file.' };
  return { ok: true, rows, skipped };
}

/** Merge imported rows into this browser's mirror, never downgrading a pass. Returns rows applied. */
export function importProgressRows(rows: ProgressRow[]): number {
  const local = readLocal();
  for (const row of rows) local[row.level_id] = mergeProgressRows(local[row.level_id], row);
  writeLocal(local);
  return rows.length;
}
