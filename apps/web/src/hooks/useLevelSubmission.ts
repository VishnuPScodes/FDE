import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getProgress, saveProgress } from '../lib/progress';

/** Attempts and time recorded when a level was passed, for the pass banner. */
export interface PassStats { attempts: number; timeSec: number }

/** One graded check, shown in a workspace results panel. */
export interface SubmissionCheckResult {
  kind: string;
  label: string;
  passed: boolean;
  actual: string;
  expected: string;
  feedback?: string;
}

interface Options {
  levelId: string;
  hintsUsed: number;
  onPassed: () => void;
}

/**
 * Shared submit/progress logic for level workspaces.
 *
 * - restores attempts and time spent from saved progress
 * - marks the level passed when it was already passed on another device
 * - records each submission (attempts, hints, time) and syncs it when signed in
 */
export function useLevelSubmission({ levelId, hintsUsed, onPassed }: Options) {
  const { session } = useAuth();
  const token = session?.access_token;
  const startedAt = useRef(Date.now());
  const timeBase = useRef(0);
  const attemptsRef = useRef(0);
  const [attempts, setAttempts] = useState(0);
  const [status, setStatus] = useState('');
  const [results, setResults] = useState<SubmissionCheckResult[] | null>(null);
  const [passStats, setPassStats] = useState<PassStats | null>(null);

  useEffect(() => {
    startedAt.current = Date.now();
    timeBase.current = 0;
    attemptsRef.current = 0;
    setAttempts(0);
    setResults(null);
    setPassStats(null);
    setStatus('');
    if (!token) return;
    let active = true;
    void getProgress(token)
      .then((rows) => {
        if (!active) return;
        const row = rows.find((item) => item.level_id === levelId);
        attemptsRef.current = row?.attempts ?? 0;
        setAttempts(attemptsRef.current);
        timeBase.current = row?.time_spent_sec ?? 0;
        if (row?.status === 'passed') onPassed();
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [levelId, onPassed, token]);

  /** Record graded results. Returns true when every check passed. */
  const submit = useCallback(
    async (checkResults: SubmissionCheckResult[]): Promise<boolean> => {
      const passed = checkResults.length > 0 && checkResults.every((check) => check.passed);
      attemptsRef.current += 1;
      setAttempts(attemptsRef.current);
      setResults(checkResults);
      const timeSpent = timeBase.current + Math.floor((Date.now() - startedAt.current) / 1000);
      setPassStats(passed ? { attempts: attemptsRef.current, timeSec: timeSpent } : null);
      if (passed) onPassed();
      if (!token) {
        setStatus(passed ? 'All checks passed. Sign in to sync progress across devices.' : 'Some checks need work. Your workspace is saved on this device.');
        return passed;
      }
      try {
        await saveProgress(token, {
          level_id: levelId,
          status: passed ? 'passed' : 'in_progress',
          attempts: attemptsRef.current,
          hints_used: hintsUsed,
          time_spent_sec: timeSpent,
        });
        setStatus(passed ? 'Level passed. Progress saved.' : 'Some checks need work. Attempt saved.');
      } catch {
        setStatus(passed ? 'Checks passed, but progress could not sync. It will be kept on this device.' : 'Some checks need work. Progress could not sync right now.');
      }
      return passed;
    },
    [hintsUsed, levelId, onPassed, token],
  );

  const clearResults = useCallback(() => { setResults(null); setPassStats(null); }, []);

  return { submit, attempts, status, results, passStats, clearResults, setStatus };
}
