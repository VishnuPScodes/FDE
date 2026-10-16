export type WorkspaceFiles = Record<string, string>;
interface StoredFiles { key: string; files: WorkspaceFiles }

const DB_NAME = 'fde-learner-workspace';
const STORE_NAME = 'files';
let databasePromise: Promise<IDBDatabase> | undefined;

function openDatabase(): Promise<IDBDatabase> {
  if (!('indexedDB' in window)) return Promise.reject(new Error('IndexedDB is unavailable.'));
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'key' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Could not open workspace storage.'));
    });
  }
  return databasePromise;
}

export async function loadWorkspaceFiles(key: string, initialFiles: WorkspaceFiles): Promise<WorkspaceFiles> {
  try {
    const db = await openDatabase();
    const stored = await new Promise<StoredFiles | undefined>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result as StoredFiles | undefined);
      request.onerror = () => reject(request.error ?? new Error('Could not read workspace files.'));
    });
    return { ...initialFiles, ...stored?.files };
  } catch {
    try { return { ...initialFiles, ...JSON.parse(localStorage.getItem(`fde-files:${key}`) ?? '{}') as WorkspaceFiles }; }
    catch { return initialFiles; }
  }
}

export async function saveWorkspaceFiles(key: string, files: WorkspaceFiles): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put({ key, files } satisfies StoredFiles);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not save workspace files.'));
    });
  } catch {
    localStorage.setItem(`fde-files:${key}`, JSON.stringify(files));
  }
}
