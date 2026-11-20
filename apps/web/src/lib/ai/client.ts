import type { AiClient, AiCompletionRequest } from './types';
import { findPreset, type AiProviderKind } from './providers';
import { loadAiSettings, type AiSettings } from './settings-store';

export type { AiClient, AiCompletionRequest, AiMessage } from './types';

export const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MAX_TOKENS = 1024;
/** Longest Retry-After we will wait for automatically before giving up. */
const MAX_AUTO_WAIT_SECONDS = 20;

export type AiErrorKind = 'config' | 'auth' | 'rate_limit' | 'network' | 'http' | 'bad_response';

/** An error with a message that is safe to show the learner as-is. */
export class AiError extends Error {
  readonly kind: AiErrorKind;
  readonly status?: number;
  readonly retryAfterSeconds?: number;

  constructor(kind: AiErrorKind, message: string, options: { status?: number; retryAfterSeconds?: number } = {}) {
    super(message);
    this.name = 'AiError';
    this.kind = kind;
    this.status = options.status;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

/** A client that can also stream and run a quick connection test. */
export interface StreamingAiClient extends AiClient {
  readonly kind: AiProviderKind;
  readonly model: string;
  stream(request: AiCompletionRequest, onDelta: (text: string) => void): Promise<string>;
  test(): Promise<string>;
}

export interface ClientOptions {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** How many times to retry a 429 automatically. */
  maxRetries?: number;
}

function providerKind(settings: AiSettings): AiProviderKind {
  return findPreset(settings.providerId)?.kind ?? 'openai';
}

function trimSlash(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export interface HttpRequest { url: string; headers: Record<string, string>; body: Record<string, unknown> }

/** Build an OpenAI-compatible chat completions request. */
export function buildOpenAiRequest(settings: AiSettings, request: AiCompletionRequest, stream = false): HttpRequest {
  const messages: { role: string; content: string }[] = [];
  if (request.system) messages.push({ role: 'system', content: request.system });
  messages.push(...request.messages);
  const body: Record<string, unknown> = {
    model: settings.model,
    messages,
    max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
  };
  if (request.temperature !== undefined) body.temperature = request.temperature;
  if (request.json) body.response_format = { type: 'json_object' };
  if (stream) body.stream = true;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (settings.apiKey) headers.authorization = `Bearer ${settings.apiKey}`;
  return { url: `${trimSlash(settings.baseUrl)}/chat/completions`, headers, body };
}

/**
 * Build an Anthropic Messages API request.
 *
 * Current Claude models reject non-default sampling values, so temperature is
 * not sent. JSON mode is requested through the system prompt instead.
 */
export function buildAnthropicRequest(settings: AiSettings, request: AiCompletionRequest, stream = false): HttpRequest {
  const system = request.json
    ? `${request.system ? `${request.system}\n\n` : ''}Respond with one JSON object only. No prose before or after it.`
    : request.system;
  const body: Record<string, unknown> = {
    model: settings.model,
    max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
    messages: request.messages,
  };
  if (system) body.system = system;
  if (stream) body.stream = true;
  return {
    url: `${trimSlash(settings.baseUrl || 'https://api.anthropic.com')}/v1/messages`,
    headers: {
      'content-type': 'application/json',
      'x-api-key': settings.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body,
  };
}

/** Parse a Retry-After header (seconds or HTTP date). */
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds));
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, Math.ceil((date - now) / 1000));
}

async function errorFromResponse(response: Response, host: string): Promise<AiError> {
  let detail = '';
  try {
    const text = await response.text();
    try {
      const raw = JSON.parse(text) as unknown;
      // Gemini's OpenAI-compatible endpoint wraps errors in an array.
      const parsed = (Array.isArray(raw) ? raw[0] : raw) as { error?: { message?: string } | string; message?: string } | null;
      detail = typeof parsed?.error === 'string' ? parsed.error : parsed?.error?.message ?? parsed?.message ?? '';
    } catch {
      detail = '';
    }
    if (!detail) detail = text.trim().slice(0, 200);
  } catch {
    detail = '';
  }
  const suffix = detail ? ` Provider said: ${detail}` : '';
  if (response.status === 401 || response.status === 403) {
    return new AiError('auth', `${host} rejected your API key (${response.status}). Check the key in Settings, or create a new one.${suffix}`, { status: response.status });
  }
  if (response.status === 429) {
    const retryAfterSeconds = parseRetryAfter(response.headers.get('retry-after'));
    const wait = retryAfterSeconds !== undefined ? `Wait about ${retryAfterSeconds} seconds` : 'Wait a minute';
    return new AiError('rate_limit', `Rate limit reached on ${host} (429). ${wait} and try again, or switch provider in Settings.${suffix}`, { status: 429, retryAfterSeconds });
  }
  return new AiError('http', `${host} returned HTTP ${response.status}.${suffix || ' Check the base URL and model name in Settings.'}`, { status: response.status });
}

function networkError(host: string, kind: AiProviderKind): AiError {
  const ollamaHint = host.includes('localhost') || host.includes('127.0.0.1') ? ' For Ollama, make sure it is running and started with OLLAMA_ORIGINS allowing this site.' : '';
  const corsHint = kind === 'openai' ? ' Some providers block calls from browsers (CORS).' : '';
  return new AiError('network', `Could not reach ${host}. Check the base URL and your internet connection.${corsHint}${ollamaHint}`);
}

function textFromOpenAi(data: unknown): string | undefined {
  const content = (data as { choices?: { message?: { content?: unknown } }[] } | null)?.choices?.[0]?.message?.content;
  return typeof content === 'string' ? content : undefined;
}

function textFromAnthropic(data: unknown): string | undefined {
  const blocks = (data as { content?: { type?: string; text?: unknown }[] } | null)?.content;
  if (!Array.isArray(blocks)) return undefined;
  return blocks.filter((block) => block.type === 'text' && typeof block.text === 'string').map((block) => block.text as string).join('');
}

export interface SseEvent { event?: string; data: string }

/**
 * Split a Server-Sent Events buffer into complete events. Returns any
 * trailing partial event in `rest` so it can be joined with the next chunk.
 */
export function parseSseEvents(buffer: string): { events: SseEvent[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, '\n');
  const blocks = normalized.split('\n\n');
  const rest = blocks.pop() ?? '';
  const events: SseEvent[] = [];
  for (const block of blocks) {
    let event: string | undefined;
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith(':')) continue;
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
    if (data.length) events.push({ event, data: data.join('\n') });
  }
  return { events, rest };
}

/** Extract the text delta from one streamed event, for either provider. */
export function deltaFromEvent(kind: AiProviderKind, event: SseEvent): string {
  if (event.data === '[DONE]') return '';
  let parsed: unknown;
  try { parsed = JSON.parse(event.data); } catch { return ''; }
  if (kind === 'anthropic') {
    const record = parsed as { type?: string; delta?: { type?: string; text?: unknown }; error?: { message?: string } };
    if (record.type === 'error') throw new AiError('http', `Stream error: ${record.error?.message ?? 'unknown error'}`);
    return record.type === 'content_block_delta' && record.delta?.type === 'text_delta' && typeof record.delta.text === 'string' ? record.delta.text : '';
  }
  const content = (parsed as { choices?: { delta?: { content?: unknown } }[] } | null)?.choices?.[0]?.delta?.content;
  return typeof content === 'string' ? content : '';
}

/** Create a client from explicit settings. Exported for tests and Settings. */
export function createAiClient(rawSettings: AiSettings, options: ClientOptions = {}): StreamingAiClient {
  const settings: AiSettings = { ...rawSettings, model: rawSettings.model.trim(), apiKey: rawSettings.apiKey.trim() };
  const kind = providerKind(settings);
  const fetchImpl = options.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const maxRetries = options.maxRetries ?? 1;
  const preset = findPreset(settings.providerId);
  const label = `${preset?.label ?? 'Custom provider'} · ${settings.model}`;

  function validate() {
    if (!settings.model) throw new AiError('config', 'Choose a model name in Settings first.');
    if (kind === 'openai' && !settings.baseUrl) throw new AiError('config', 'Add a base URL in Settings first.');
    if (!settings.apiKey && (preset?.needsKey ?? true)) throw new AiError('config', 'Add your API key in Settings first.');
  }

  async function send(request: AiCompletionRequest, stream: boolean): Promise<Response> {
    validate();
    const http = kind === 'anthropic' ? buildAnthropicRequest(settings, request, stream) : buildOpenAiRequest(settings, request, stream);
    let host = http.url;
    try { host = new URL(http.url).host; } catch { throw new AiError('config', `The base URL "${settings.baseUrl}" is not a valid URL.`); }
    for (let attempt = 0; ; attempt += 1) {
      let response: Response;
      try {
        response = await fetchImpl(http.url, { method: 'POST', headers: http.headers, body: JSON.stringify(http.body) });
      } catch {
        throw networkError(host, kind);
      }
      if (response.ok) return response;
      const error = await errorFromResponse(response, host);
      const wait = error.retryAfterSeconds ?? 2 ** attempt;
      if (error.kind === 'rate_limit' && attempt < maxRetries && wait <= MAX_AUTO_WAIT_SECONDS) {
        await sleep(wait * 1000);
        continue;
      }
      throw error;
    }
  }

  async function complete(request: AiCompletionRequest): Promise<string> {
    const response = await send(request, false);
    let data: unknown;
    try { data = await response.json(); } catch { throw new AiError('bad_response', 'The provider sent a response that is not JSON. Check the base URL.'); }
    const text = kind === 'anthropic' ? textFromAnthropic(data) : textFromOpenAi(data);
    if (text === undefined) throw new AiError('bad_response', 'The provider response had no text. Check the model name.');
    return text;
  }

  async function stream(request: AiCompletionRequest, onDelta: (text: string) => void): Promise<string> {
    const response = await send(request, true);
    if (!response.body) {
      const text = await response.text();
      return collectFromText(text, onDelta);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    for (;;) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const { events, rest } = parseSseEvents(done ? `${buffer}\n\n` : buffer);
      buffer = rest;
      for (const event of events) {
        const delta = deltaFromEvent(kind, event);
        if (delta) { full += delta; onDelta(delta); }
      }
      if (done) return full;
    }
  }

  function collectFromText(text: string, onDelta: (text: string) => void): string {
    let full = '';
    for (const event of parseSseEvents(`${text}\n\n`).events) {
      const delta = deltaFromEvent(kind, event);
      if (delta) { full += delta; onDelta(delta); }
    }
    return full;
  }

  return {
    label,
    kind,
    model: settings.model,
    complete,
    stream,
    test: () => complete({ messages: [{ role: 'user', content: 'Reply with the single word: ready' }], maxTokens: 16 }),
  };
}

/**
 * Returns a client built from the learner's own key (stored only in this
 * browser), or null when no key is configured.
 */
export async function getAiClient(): Promise<AiClient | null> {
  const settings = await loadAiSettings();
  if (!settings?.model) return null;
  const preset = findPreset(settings.providerId);
  if (!settings.apiKey && (preset?.needsKey ?? true)) return null;
  return createAiClient(settings);
}

/** Same as getAiClient, typed with streaming and test helpers. */
export async function getStreamingAiClient(): Promise<StreamingAiClient | null> {
  return (await getAiClient()) as StreamingAiClient | null;
}
