import { useEffect, useState } from 'react';
import { getAiClient } from './ai/client';
import type { AiClient } from './ai/types';
import { levelIdToPath, loadLesson, loadStarterFile, type LevelMeta } from './content-loader';

/** Load starter text: inline content, a data file, or a Markdown file. */
export async function loadStarterText(level: LevelMeta, file: { path: string; content?: string; from?: string }): Promise<string> {
  if (file.content !== undefined) return file.content;
  const text = await loadStarterFile(level.id, file.path, file.from).catch(() => '');
  if (text || !/\.md$/i.test(file.from ?? file.path)) return text;
  const segments = levelIdToPath(level.id).split('/');
  for (const part of (file.from ?? `starter/${file.path}`).split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') segments.pop();
    else segments.push(part);
  }
  return loadLesson(segments.join('/')).catch(() => '');
}

/** The learner's own AI client (BYOK), or null when no key is configured. */
export function useAiClient(): AiClient | null {
  const [client, setClient] = useState<AiClient | null>(null);
  useEffect(() => {
    let active = true;
    void getAiClient().then((value) => { if (active) setClient(value); }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  return client;
}

