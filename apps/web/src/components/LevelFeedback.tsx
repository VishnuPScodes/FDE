import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { MOCK_AUTH_ENABLED } from '../lib/mock-auth';
import { supabase, supabaseConfigured } from '../lib/supabase';
import styles from './LevelFeedback.module.css';

interface Props { levelId: string }

/** "Was this level clear?" thumbs + optional comment, saved to the `feedback` table (RLS: own rows). */
export default function LevelFeedback({ levelId }: Props) {
  const { user } = useAuth();
  const storageKey = `fde-feedback:${levelId}`;
  const [rating, setRating] = useState<1 | 5 | null>(null);
  const [message, setMessage] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  useEffect(() => {
    setRating(null);
    setMessage('');
    try { setState(localStorage.getItem(storageKey) ? 'sent' : 'idle'); } catch { setState('idle'); }
  }, [storageKey]);

  if (!user) return null;
  if (state === 'sent') return <p className={styles.thanks} role="status">Thanks for the feedback on this level.</p>;

  async function send() {
    if (!rating || !user) return;
    setState('sending');
    try {
      if (supabaseConfigured && !MOCK_AUTH_ENABLED) {
        const { error } = await supabase.from('feedback').insert({ user_id: user.id, level_id: levelId, rating, message: message.trim().slice(0, 1000) || null });
        if (error) throw error;
      }
      try { localStorage.setItem(storageKey, String(rating)); } catch { /* storage blocked */ }
      setState('sent');
    } catch {
      setState('error');
    }
  }

  return (
    <section className={styles.box} aria-label="Level feedback">
      <span className={styles.question}>Was this level clear?</span>
      <div className={styles.thumbs}>
        <button type="button" className={rating === 5 ? styles.active : ''} aria-pressed={rating === 5} onClick={() => setRating(5)}>👍 Yes</button>
        <button type="button" className={rating === 1 ? styles.active : ''} aria-pressed={rating === 1} onClick={() => setRating(1)}>👎 Not really</button>
      </div>
      {rating !== null && (
        <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void send(); }}>
          <label htmlFor={`feedback-${levelId}`} className="sr-only">Optional comment</label>
          <textarea id={`feedback-${levelId}`} maxLength={1000} rows={2} placeholder={rating === 1 ? 'What was confusing? (optional)' : 'Anything we should keep or change? (optional)'} value={message} onChange={(event) => setMessage(event.target.value)} />
          <p className={styles.note}>Please don't include personal or customer data.</p>
          <button type="submit" className="btn btn-secondary btn-sm" disabled={state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Send feedback'}</button>
          {state === 'error' && <p className={styles.error} role="alert">Could not send right now. Try again later.</p>}
        </form>
      )}
    </section>
  );
}
