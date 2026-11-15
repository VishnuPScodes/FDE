/**
 * Provider presets for the bring-your-own-key adapter (spec Part 8).
 *
 * Free-tier models and limits change often. Treat these as editable defaults:
 * the learner can override base URL and model in Settings.
 */
export type AiProviderKind = 'openai' | 'anthropic';

export interface AiPricing {
  /** US dollars per one million input tokens. */
  inputPerMTok: number;
  /** US dollars per one million output tokens. */
  outputPerMTok: number;
}

export interface AiProviderPreset {
  id: string;
  label: string;
  kind: AiProviderKind;
  baseUrl: string;
  defaultModel: string;
  needsKey: boolean;
  /** Where the learner creates a key. */
  keyUrl?: string;
  pricing?: AiPricing;
  note: string;
}

/** Date these presets were last checked by a human. */
export const PRESETS_LAST_VERIFIED = '2026-11-09';

export const AI_PROVIDER_PRESETS: AiProviderPreset[] = [
  {
    id: 'groq',
    label: 'Groq (free tier)',
    kind: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.1-8b-instant',
    needsKey: true,
    keyUrl: 'https://console.groq.com/keys',
    pricing: { inputPerMTok: 0, outputPerMTok: 0 },
    note: 'Fast open-weight models. The free tier has per-minute and per-day limits.',
  },
  {
    id: 'gemini',
    label: 'Google Gemini (OpenAI-compatible)',
    kind: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.5-flash',
    needsKey: true,
    keyUrl: 'https://aistudio.google.com/apikey',
    pricing: { inputPerMTok: 0, outputPerMTok: 0 },
    note: 'Google AI Studio key. Free-tier prompts may be used to improve Google products.',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter (:free models)',
    kind: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    needsKey: true,
    keyUrl: 'https://openrouter.ai/keys',
    pricing: { inputPerMTok: 0, outputPerMTok: 0 },
    note: 'Pick a model id ending in :free. Free models have low daily request limits.',
  },
  {
    id: 'ollama',
    label: 'Ollama on this computer',
    kind: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.2',
    needsKey: false,
    pricing: { inputPerMTok: 0, outputPerMTok: 0 },
    note: 'Runs locally and needs no key. Start Ollama with OLLAMA_ORIGINS set to this site so the browser may call it.',
  },
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    kind: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-haiku-5-5',
    needsKey: true,
    keyUrl: 'https://console.anthropic.com/settings/keys',
    pricing: { inputPerMTok: 0.1, outputPerMTok: 0.5 },
    note: 'Paid API. Calls go straight from your browser to Anthropic.',
  },
  {
    id: 'custom',
    label: 'Custom OpenAI-compatible URL',
    kind: 'openai',
    baseUrl: '',
    defaultModel: '',
    needsKey: true,
    note: 'Any server that implements POST /chat/completions (Cerebras, Mistral, a company gateway).',
  },
];

export function findPreset(id: string): AiProviderPreset | undefined {
  return AI_PROVIDER_PRESETS.find((preset) => preset.id === id);
}
