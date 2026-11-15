/**
 * Stores the learner's AI provider settings, including the API key, only in
 * this browser (IndexedDB, with a localStorage fallback when IndexedDB is
 * unavailable). Nothing here is ever sent to the platform API (R9).
 */
export interface AiSettings {
  providerId: string;
  baseUrl: string;
  model: string;
  apiKey: string;
}

const DB_NAME = 'fde-ai-settings';
const STORE_NAME = 'settings';
const RECORD_KEY = 'byok';
const FALLBACK_KEY = 'fde-ai-settings';

let databasePromise: Promise<IDBDatabase> | undefined;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is unavailable.'));
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Could not open AI settings storage.'));
    });
    databasePromise.catch(() => { databasePromise = undefined; });
  }
  return databasePromise;
}

function isSettings(value: unknown): value is AiSettings {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return ['providerId', 'baseUrl', 'model', 'apiKey'].every((key) => typeof record[key] === 'string');
}

function readFallback(): AiSettings | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(FALLBACK_KEY) ?? 'null');
    return isSettings(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function loadAiSettings(): Promise<AiSettings | null> {
  try {
    const db = await openDatabase();
    const stored = await new Promise<unknown>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(RECORD_KEY);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Could not read AI settings.'));
    });
    return isSettings(stored) ? stored : readFallback();
  } catch {
    return readFallback();
  }
}

export async function saveAiSettings(settings: AiSettings): Promise<void> {
  const clean: AiSettings = {
    providerId: settings.providerId,
    baseUrl: settings.baseUrl.trim(),
    model: settings.model.trim(),
    apiKey: settings.apiKey.trim(),
  };
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(clean, RECORD_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not save AI settings.'));
    });
    try { localStorage.removeItem(FALLBACK_KEY); } catch { /* ignore */ }
  } catch {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(clean));
  }
}

export async function clearAiSettings(): Promise<void> {
  try { localStorage.removeItem(FALLBACK_KEY); } catch { /* ignore */ }
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(RECORD_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not remove AI settings.'));
    });
  } catch {
    /* Nothing stored in IndexedDB. */
  }
}
