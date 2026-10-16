import { supabase } from './supabase';

export interface ProgressRow {
  level_id: string;
  status: 'locked' | 'unlocked' | 'in_progress' | 'passed';
  attempts: number;
  hints_used: number;
  time_spent_sec: number;
  passed_at: string | null;
}

const API_URL = import.meta.env.VITE_API_URL as string | undefined;

export async function getProgress(accessToken: string): Promise<ProgressRow[]> {
  if (API_URL) {
    const response = await fetch(`${API_URL}/progress`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new Error('Could not load your progress.');
    const body = await response.json() as { progress: ProgressRow[] };
    return body.progress;
  }
  const { data, error } = await supabase.from('level_progress').select('level_id,status,attempts,hints_used,passed_at,time_spent_sec');
  if (error) throw error;
  return (data ?? []) as ProgressRow[];
}

export async function saveProgress(accessToken: string, update: Omit<ProgressRow, 'passed_at'>): Promise<void> {
  if (API_URL) {
    const response = await fetch(`${API_URL}/progress`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    });
    if (!response.ok) throw new Error('Could not save your progress. It is still saved on this device.');
    return;
  }
  const { error } = await supabase.from('level_progress').upsert({ ...update, user_id: (await supabase.auth.getUser()).data.user?.id }, { onConflict: 'user_id,level_id' });
  if (error) throw error;
}
