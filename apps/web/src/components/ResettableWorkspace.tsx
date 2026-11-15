import { useState, type ReactNode } from 'react';
import { ResetControl } from './CraftWorkspaceParts';

interface Props {
  /** Erase everything persisted for this level so the workspace reloads its starter state. */
  clear: () => Promise<void>;
  children: ReactNode;
}

/**
 * Adds a two-step inline "Reset level" control above a workspace and remounts it
 * from the starter state afterwards. The workspace is unmounted first so any
 * save-on-unmount finishes before the stored state is erased.
 */
export default function ResettableWorkspace({ clear, children }: Props) {
  const [generation, setGeneration] = useState(0);
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState('');

  const reset = async () => {
    setResetting(true);
    setMessage('');
    await new Promise((resolve) => setTimeout(resolve, 50));
    try {
      await clear();
      setMessage('Level reset. The workspace is back at its starting point.');
    } catch {
      setMessage('Could not fully reset this level. Reload the page and try again.');
    }
    setGeneration((value) => value + 1);
    setResetting(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
        {message && <span role="status">{message}</span>}
        <ResetControl onReset={() => { void reset(); }} />
      </div>
      {resetting ? null : <div key={generation} style={{ display: 'contents' }}>{children}</div>}
    </div>
  );
}
